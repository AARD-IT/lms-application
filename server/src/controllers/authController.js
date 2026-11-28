const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const DeviceActivation = require('../models/DeviceActivation');
const activity = require('../services/activityService');
const mailService = require('../services/mailService');
const settingsService = require('../services/settingsService');
const { notifyAdmins } = require('../services/notificationService');
const { notifySessionTerminated } = require('../services/socketService');
const { appUrl } = require('../utils/url');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '7d';

// Five wrong passwords lock the account for fifteen minutes.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;
const MIN_PASSWORD_LENGTH = 8;

function generateToken(user, sessionId = null) {
  const payload = { id: user._id, email: user.email };
  if (sessionId) payload.sessionId = sessionId;
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function register(req, res, next) {
  try {
    const { name, password, phone } = req.body || {};
    const email = normaliseEmail(req.body?.email);

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password` });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

    // Only name/email/password/phone are taken from the body — never `role`.
    const user = new User({
      name: String(name).trim().slice(0, 80),
      email,
      password,
      phone: String(phone || '').trim().slice(0, 20),
      lastLoginAt: new Date(),
      currentSessionId: sessionId,
    });
    await user.save();

    // Initialize DeviceActivation record for the new student
    await DeviceActivation.findOneAndUpdate(
      { studentId: user._id },
      {
        $setOnInsert: {
          studentId: user._id,
          email: user.email,
          paymentStatus: 'pending',
          status: 'payment_pending',
          isActivated: false,
          authorizedCourses: [],
        },
      },
      { upsert: true, new: true }
    );

    await notifyAdmins(
      {
        type: 'learner_registered',
        title: 'New learner registered',
        message: `${user.name} (${user.email}) just created an account.`,
        link: `/admin/learners/${user._id}`,
      },
      { setting: 'admin.learnerRegistered' }
    );

    const token = generateToken(user, sessionId);
    res.status(201).json({ student: user, token });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const email = normaliseEmail(req.body?.email);
    const { password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
        user.failedLoginAttempts = 0;
        if (user.role === 'admin') {
          await activity.log(
            { user, ip: req.ip },
            {
              category: 'security',
              action: 'auth.locked',
              summary: `Admin account ${user.email} locked after ${MAX_FAILED_LOGINS} failed sign-in attempts`,
              entityType: 'user',
              entityId: user._id,
            }
          );
        }
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Checked after the password so a suspended account's existence is not
    // revealed to someone guessing.
    if (user.status === 'deleted') {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account is suspended. Please contact support.' });
    }

    // Check device activation restriction: if user is a student,
    // enforce one-time PIN first device activation and prevent multi-device logins.
    let isActivated = false;
    if (user.role !== 'admin') {
      const activation = await DeviceActivation.findOne({ studentId: user._id });
      isActivated = Boolean(activation?.isActivated && activation.status === 'activated');

      // If already activated, enforce single primary device binding (System B rejection)
      if (isActivated) {
        const clientDeviceId = req.headers['x-device-id'] || req.body?.deviceId;
        if (clientDeviceId && activation.activationDeviceId && clientDeviceId !== activation.activationDeviceId) {
          // Reject System B without disrupting System A's session or login state
          return res.status(403).json({
            error:
              'This account has already been activated on another device. Multi-device access is restricted. Please access your courses from your activated device, or contact the administrator to reset your activation.',
            code: 'ALREADY_ACTIVATED_ON_OTHER_DEVICE',
          });
        }
      }
    }

    // Generate a new unique session identifier for single-device login enforcement.
    // Any prior session from another device/browser will be rejected and disconnected.
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    user.currentSessionId = sessionId;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    // Invalidate existing sessions/sockets for this user on other devices
    notifySessionTerminated(user._id, sessionId);

    if (user.role === 'admin') {
      await activity.log(
        { user, ip: req.ip },
        {
          category: 'security',
          action: 'auth.admin_login',
          summary: `${user.name} signed in to the admin panel`,
          entityType: 'user',
          entityId: user._id,
        }
      );
    }

    const token = generateToken(user, sessionId);
    res.json({ student: user, token, isActivated });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    // req.user will be attached by authMiddleware
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json(req.user);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/auth/complete-profile
 * Learner submits required personal details during initial onboarding.
 */
async function completeProfile(req, res, next) {
  try {
    const { name, phone, city, education, headline, bio } = req.body || {};
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!city || !String(city).trim()) {
      return res.status(400).json({ error: 'City / location is required' });
    }
    if (!education || !String(education).trim()) {
      return res.status(400).json({ error: 'Educational background is required' });
    }

    if (name && String(name).trim()) {
      req.user.name = String(name).trim().slice(0, 80);
    }
    req.user.phone = String(phone).trim().slice(0, 20);
    req.user.city = String(city).trim().slice(0, 80);
    req.user.education = String(education).trim().slice(0, 120);
    if (headline !== undefined) req.user.headline = String(headline).trim().slice(0, 120);
    if (bio !== undefined) req.user.bio = String(bio).trim().slice(0, 1000);
    req.user.profileCompleted = true;
    req.user.onboardingSubmittedAt = new Date();
    await req.user.save();

    // Update DeviceActivation onboarding details timestamp
    await DeviceActivation.findOneAndUpdate(
      { studentId: req.user._id },
      {
        $set: {
          onboardingDetailsSubmittedAt: new Date(),
        },
        $setOnInsert: {
          studentId: req.user._id,
          email: req.user.email,
          status: 'payment_pending',
          paymentStatus: 'pending',
        },
      },
      { upsert: true, new: true }
    );

    // Trigger Admin notification
    await notifyAdmins(
      {
        type: 'learner_registered',
        title: 'New Learner Onboarding Submitted',
        message: `${req.user.name} (${req.user.email}) completed personal details. Payment verification pending.`,
        link: `/admin/learners/${req.user._id}?tab=activation`,
      },
      { setting: 'admin.learnerRegistered' }
    );

    res.json({
      message: 'Personal details saved successfully. Please wait for payment verification and activation PIN.',
      student: req.user,
    });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/me — the profile fields a user may change about themselves. */
async function updateMe(req, res, next) {
  try {
    const body = req.body || {};
    const limits = { name: 80, phone: 20, city: 80, headline: 120, bio: 1000 };

    for (const [field, max] of Object.entries(limits)) {
      if (body[field] === undefined) continue;
      const value = String(body[field]).trim().slice(0, max);
      if (field === 'name' && !value) return res.status(400).json({ error: 'Name cannot be empty' });
      req.user[field] = value;
    }

    await req.user.save();
    res.json(req.user);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/me/password  body: { currentPassword, newPassword } */
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Enter your current and new password' });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (!(await req.user.comparePassword(currentPassword))) {
      return res.status(400).json({ error: 'Your current password is not correct' });
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    req.user.password = newPassword;
    req.user.currentSessionId = sessionId;
    await req.user.save();

    // Terminate older sessions across other devices
    notifySessionTerminated(req.user._id, sessionId);

    await activity.log(req, {
      category: 'security',
      action: 'auth.password_changed',
      summary: `${req.user.name} changed their password`,
      entityType: 'user',
      entityId: req.user._id,
    });

    // The change revokes older tokens, this one included — hand back a fresh
    // one with the new sessionId so the session that made the change stays signed in.
    res.json({ success: true, token: generateToken(req.user, sessionId) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password  body: { email }
 *
 * Always answers the same way, so it cannot be used to find out which
 * addresses have accounts. Without SMTP the link is printed to the server
 * console (see mailService).
 */
async function forgotPassword(req, res, next) {
  try {
    const email = normaliseEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Enter your email address' });

    const generic = {
      success: true,
      message: 'If an account exists for that email, a password reset link is on its way.',
    };

    const user = await User.findOne({ email });
    if (!user || user.status === 'suspended') return res.json(generic);

    // At most one email a minute per account.
    const issuedAt = user.resetPasswordExpires
      ? user.resetPasswordExpires.getTime() - RESET_TOKEN_MINUTES * 60000
      : 0;
    if (Date.now() - issuedAt < 60000) return res.json(generic);

    await sendResetLink(user);
    res.json(generic);
  } catch (err) {
    next(err);
  }
}

/**
 * Issues a fresh single-use reset token and emails the link. Shared by the
 * public "forgot password" form and the admin "send reset link" action.
 * Resolves mailService's { sent, error }.
 */
async function sendResetLink(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordTokenHash = sha256(token);
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60000);
  await user.save();

  const { branding } = await settingsService.get();
  const url = `${appUrl()}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  return mailService.sendMail({
    to: user.email,
    subject: `Reset your ${branding.platformName} password`,
    text:
      `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in ` +
      `${RESET_TOKEN_MINUTES} minutes:\n\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
    html:
      `<p>Hi ${escapeHtml(user.name)},</p><p>Use the button below to choose a new password. ` +
      `It works once and expires in ${RESET_TOKEN_MINUTES} minutes.</p>` +
      `<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#2450eb;color:#fff;` +
      `border-radius:8px;text-decoration:none">Reset password</a></p>` +
      `<p style="color:#64748b">If you did not ask for this, you can ignore this email.</p>`,
  });
}

/** POST /api/auth/reset-password  body: { email, token, password } */
async function resetPassword(req, res, next) {
  try {
    const email = normaliseEmail(req.body?.email);
    const { token, password } = req.body || {};
    const invalid = { error: 'This reset link is invalid or has expired. Request a new one.' };

    if (!email || !token) return res.status(400).json(invalid);
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const user = await User.findOne({ email });
    if (
      !user ||
      !user.resetPasswordTokenHash ||
      !user.resetPasswordExpires ||
      user.resetPasswordExpires < new Date() ||
      user.resetPasswordTokenHash !== sha256(String(token))
    ) {
      return res.status(400).json(invalid);
    }

    user.password = password;
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    await activity.log(
      { user, ip: req.ip },
      {
        category: 'security',
        action: 'auth.password_reset',
        summary: `${user.name} reset their password with an emailed link`,
        entityType: 'user',
        entityId: user._id,
      }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function logout(req, res) {
  try {
    // If authenticated and this session is the active session, clear it on the server
    if (req.user && req.sessionId && req.user.currentSessionId === req.sessionId) {
      req.user.currentSessionId = null;
      await req.user.save();
    }
  } catch (err) {
    console.error('[auth] error invalidating session on logout:', err.message);
  }
  res.json({ success: true, message: 'Logged out successfully' });
}

/** GET /api/auth/session — returns active session status under requireAuth */
async function checkSession(req, res) {
  res.json({ valid: true, sessionId: req.sessionId });
}

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  sendResetLink,
  logout,
  checkSession,
  completeProfile,
  generateToken,
  MIN_PASSWORD_LENGTH,
};
