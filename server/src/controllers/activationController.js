const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const DeviceActivation = require('../models/DeviceActivation');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const Enrollment = require('../models/Enrollment');
const Notification = require('../models/Notification');
const { sendActivationPinEmail, sendActivationResetEmail, sendActivationRevokedEmail } = require('../services/activationEmailService');
const { grantCourseAccess } = require('../services/enrolmentService');
const packageService = require('../services/packageService');
const activity = require('../services/activityService');
const settingsService = require('../services/settingsService');
const { ACTIVATION_STATUS, PAYMENT_STATUS } = require('../constants');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-key-change-in-prod';
const JWT_EXPIRES_IN = '7d';

/**
 * Generate cryptographically secure 4-digit PIN (0000 - 9999)
 */
function generateRandomPin() {
  const pinNum = crypto.randomInt(0, 10000);
  return String(pinNum).padStart(4, '0');
}

/**
 * Hash PIN using HMAC-SHA256 with unique random salt
 */
function hashPin(pin, salt) {
  return crypto.createHmac('sha256', salt).update(String(pin).trim()).digest('hex');
}

/**
 * Constant-time hash verification
 */
function verifyPinHash(candidatePin, salt, storedHash) {
  if (!candidatePin || !salt || !storedHash) return false;
  const candidateHash = hashPin(candidatePin, salt);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function generateAuthToken(user, sessionId, deviceActivationId) {
  const payload = {
    id: user._id,
    email: user.email,
  };
  if (sessionId) payload.sessionId = sessionId;
  if (deviceActivationId) payload.deviceActivationId = deviceActivationId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/* --------------------------------------------------------------------------
 * ADMIN CONTROLLERS
 * -------------------------------------------------------------------------- */

/**
 * GET /api/admin/activation/student/:studentId
 * Fetch student activation record with full course details and history
 */
async function getStudentActivation(req, res, next) {
  try {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await User.findById(studentId).select(
      'name email phone city education headline bio profileCompleted onboardingSubmittedAt status lastLoginAt'
    );
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const courseGrants = await CourseAccess.find({ studentId }).select('courseId source active suspended');
    const courseSources = {};
    for (const cg of courseGrants) {
      courseSources[String(cg.courseId)] = {
        source: cg.source || 'manual',
        active: cg.active,
        suspended: cg.suspended,
      };
    }

    let activation = await DeviceActivation.findOne({ studentId })
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('packageId', 'name identifier slug tier description price features')
      .populate('paymentVerifiedBy', 'name email')
      .populate('pinGeneratedBy', 'name email')
      .populate('revokedBy', 'name email')
      .populate('resetHistory.resetBy', 'name email')
      .populate('auditLog.performedBy', 'name email');

    if (!activation) {
      // Find any existing enrollment for this student to pre-fill payment info
      const enrollment = await Enrollment.findOne({ studentId })
        .populate('courseId', 'title thumbnail')
        .sort({ createdAt: -1 });

      return res.json({
        exists: false,
        student,
        courseSources,
        activation: {
          studentId: student._id,
          email: student.email,
          paymentStatus: enrollment?.status === 'completed' ? 'verified' : 'pending',
          paymentAmount: enrollment?.amount || 0,
          paymentReference: enrollment?.reference || '',
          authorizedCourses: enrollment?.courseId ? [enrollment.courseId] : [],
          status: 'payment_pending',
          isActivated: false,
        },
      });
    }

    res.json({
      exists: true,
      student,
      courseSources,
      activation,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/activation/list
 * List all activation records with filtering and pagination
 */
async function listActivations(req, res, next) {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (status && DeviceActivation.STATUSES.includes(status)) {
      filter.status = status;
    }

    if (search) {
      const pattern = new RegExp(search.trim(), 'i');
      filter.$or = [{ email: pattern }, { paymentReference: pattern }];
    }

    const total = await DeviceActivation.countDocuments(filter);
    const activations = await DeviceActivation.find(filter)
      .populate('studentId', 'name email phone status')
      .populate('authorizedCourses', 'title thumbnail')
      .sort({ updatedAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Calculate status counts
    const statusCounts = await DeviceActivation.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const counts = {};
    for (const item of statusCounts) {
      counts[item._id] = item.count;
    }

    res.json({
      activations,
      total,
      counts,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/verify-payment
 * Manual payment verification and optional course authorization by administrator
 */
async function verifyPayment(req, res, next) {
  try {
    const {
      studentId,
      paymentReference,
      paymentAmount,
      paymentNotes,
      verified = true,
      courseIds,
      courseId,
    } = req.body || {};

    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required', code: 'INVALID_STUDENT_ID' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'STUDENT_NOT_FOUND' });
    }

    if (student.role === 'admin') {
      return res.status(400).json({ error: 'Cannot activate course payment for an admin account', code: 'INVALID_ACCOUNT_ROLE' });
    }

    if (student.status === 'suspended') {
      return res.status(403).json({ error: 'Student account is suspended. Reactivate account first.', code: 'STUDENT_SUSPENDED' });
    }

    // Process and validate courseIds if provided
    let verifiedCourseIds = [];
    const incomingCourseIds = Array.isArray(courseIds)
      ? courseIds
      : courseId
      ? [courseId]
      : [];

    if (incomingCourseIds.length > 0) {
      for (const cId of incomingCourseIds) {
        if (!mongoose.isValidObjectId(cId)) {
          return res.status(400).json({ error: `Invalid course ID: ${cId}`, code: 'INVALID_COURSE_ID' });
        }
      }

      const existingCourses = await Course.find({ _id: { $in: incomingCourseIds } }).select('_id title');
      if (existingCourses.length !== incomingCourseIds.length) {
        return res.status(404).json({ error: 'One or more selected courses do not exist', code: 'COURSE_NOT_FOUND' });
      }
      verifiedCourseIds = existingCourses.map((c) => c._id);
    }

    // Find or create activation record safely without duplicates
    let activation = await DeviceActivation.findOne({ studentId: student._id });
    if (!activation) {
      activation = new DeviceActivation({
        studentId: student._id,
        email: student.email,
        status: 'payment_pending',
      });
    }

    const isVerified = Boolean(verified);
    activation.paymentStatus = isVerified ? 'verified' : 'pending';
    activation.paymentVerifiedAt = isVerified ? new Date() : null;
    activation.paymentVerifiedBy = isVerified ? req.user._id : null;
    if (paymentReference !== undefined) activation.paymentReference = String(paymentReference).trim();
    if (paymentAmount !== undefined) {
      const amt = Number(paymentAmount);
      if (Number.isNaN(amt) || amt < 0) {
        return res.status(400).json({ error: 'Payment amount must be a positive number', code: 'INVALID_AMOUNT' });
      }
      activation.paymentAmount = amt;
    }
    if (paymentNotes !== undefined) activation.paymentNotes = String(paymentNotes).trim();

    // Associate authorized courses if provided
    if (verifiedCourseIds.length > 0) {
      const mergedCourses = new Set([
        ...(activation.authorizedCourses || []).map(String),
        ...verifiedCourseIds.map(String),
      ]);
      activation.authorizedCourses = Array.from(mergedCourses);
    }

    // Advance lifecycle status
    if (isVerified) {
      if (['payment_pending', 'payment_verified'].includes(activation.status)) {
        activation.status = activation.authorizedCourses?.length ? 'course_authorized' : 'payment_verified';
      }
    } else {
      activation.status = 'payment_pending';
    }

    activation.auditLog.push({
      action: isVerified ? 'payment_verified' : 'payment_unverified',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: {
        paymentReference: activation.paymentReference,
        paymentAmount: activation.paymentAmount,
        notes: activation.paymentNotes,
        authorizedCoursesCount: activation.authorizedCourses?.length || 0,
      },
    });

    await activation.save();

    // Sync with existing CourseAccess and Enrollment architecture
    if (isVerified && verifiedCourseIds.length > 0) {
      for (const cId of verifiedCourseIds) {
        const cObj = await Course.findById(cId);
        if (cObj) {
          await grantCourseAccess(student._id, cObj, {
            by: req.user._id,
            source: 'manual',
            learnerNotice: false,
            notifyStaff: false,
          });
        }
      }
    } else if (activation.paymentReference || verifiedCourseIds.length > 0) {
      const enrollmentFilter = { studentId: student._id };
      if (verifiedCourseIds.length > 0) {
        enrollmentFilter.courseId = { $in: verifiedCourseIds };
      }
      await Enrollment.updateMany(
        enrollmentFilter,
        {
          $set: {
            status: isVerified ? 'completed' : 'pending',
            reference: activation.paymentReference || '',
            confirmedAt: isVerified ? new Date() : null,
            confirmedBy: isVerified ? req.user._id : null,
          },
        }
      );
    }

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'payment',
        action: 'activation.payment_verified',
        summary: `${req.user.name} marked payment as ${isVerified ? 'verified' : 'pending'} for ${student.name} (${student.email})`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('paymentVerifiedBy', 'name email');

    res.json({
      message: isVerified ? 'Payment verified successfully' : 'Payment marked pending',
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/authorize-courses
 * Step 2: Admin selects and authorizes specific courses for student
 */
async function authorizeCourses(req, res, next) {
  try {
    const { studentId, courseIds } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required' });
    }

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one course to authorize' });
    }

    const validCourseIds = courseIds.filter((id) => mongoose.isValidObjectId(id));
    if (validCourseIds.length !== courseIds.length) {
      return res.status(400).json({ error: 'One or more selected course IDs are invalid' });
    }

    const existingCoursesCount = await Course.countDocuments({ _id: { $in: validCourseIds } });
    if (existingCoursesCount !== validCourseIds.length) {
      return res.status(400).json({ error: 'One or more selected courses do not exist' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    let activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      activation = new DeviceActivation({
        studentId: student._id,
        email: student.email,
        status: 'payment_pending',
      });
    }

    // Preserve any existing courses the learner already has paid access to via Razorpay
    const paidGrants = await CourseAccess.find({
      studentId,
      active: true,
      source: { $in: ['payment', 'razorpay'] },
    }).select('courseId');
    const paidCourseIds = paidGrants.map((g) => String(g.courseId));

    const mergedCourseIds = Array.from(new Set([...validCourseIds.map(String), ...paidCourseIds]));
    activation.authorizedCourses = mergedCourseIds;

    // Advance status if payment is already verified
    if (activation.paymentStatus === 'verified' && ['payment_verified', 'payment_pending'].includes(activation.status)) {
      activation.status = 'course_authorized';
    }

    activation.auditLog.push({
      action: 'courses_authorized',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: { courseIds: validCourseIds, mergedCourseIds },
    });

    await activation.save();

    // Ensure database-backed CourseAccess and Enrollment records exist for all authorized courses
    for (const cId of validCourseIds) {
      const cObj = await Course.findById(cId);
      if (cObj) {
        await grantCourseAccess(student._id, cObj, {
          by: req.user._id,
          source: 'manual',
          learnerNotice: false,
          notifyStaff: false,
        });
      }
    }

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'learner',
        action: 'activation.courses_authorized',
        summary: `${req.user.name} authorized ${validCourseIds.length} course(s) for ${student.name}`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('paymentVerifiedBy', 'name email');

    res.json({
      message: `${validCourseIds.length} course(s) authorized successfully`,
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/generate-package-pin
 * Generates an individual 4-digit activation PIN for a specific student and course package.
 */
async function generatePackagePin(req, res, next) {
  try {
    const {
      studentId,
      packageId,
      packageIdentifier,
      paymentAmount,
      paymentReference,
      paymentNotes,
    } = req.body || {};

    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required', code: 'INVALID_STUDENT_ID' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'STUDENT_NOT_FOUND' });
    }

    if (student.role === 'admin') {
      return res.status(400).json({ error: 'Cannot generate activation PIN for an admin account', code: 'INVALID_ACCOUNT_ROLE' });
    }

    if (student.status === 'suspended') {
      return res.status(403).json({ error: 'Student account is suspended. Reactivate account first.', code: 'STUDENT_SUSPENDED' });
    }

    // Resolve course package
    let pkg = null;
    if (packageId) {
      pkg = await packageService.getPackageByIdOrIdentifier(packageId);
    } else if (packageIdentifier) {
      pkg = await packageService.getPackageByIdOrIdentifier(packageIdentifier);
    }

    if (!pkg) {
      return res.status(404).json({ error: 'Selected course package not found', code: 'PACKAGE_NOT_FOUND' });
    }

    // Resolve courses included in this package dynamically
    const packageCourses = await packageService.resolveCoursesForPackage(pkg);
    if (!packageCourses || packageCourses.length === 0) {
      return res.status(400).json({ error: 'No courses are configured for this package', code: 'NO_COURSES_IN_PACKAGE' });
    }

    const courseIds = packageCourses.map((c) => c._id);
    const courseTitles = packageCourses.map((c) => c.title);

    // Generate secure 4-digit PIN (0000-9999) and random cryptographic salt
    const pin = generateRandomPin();
    const pinSalt = crypto.randomBytes(16).toString('hex');
    const pinHash = hashPin(pin, pinSalt);

    let activation = await DeviceActivation.findOne({ studentId: student._id });
    if (!activation) {
      activation = new DeviceActivation({
        studentId: student._id,
        email: student.email,
      });
    }

    activation.packageId = pkg._id;
    activation.packageIdentifier = pkg.identifier;
    activation.packageName = pkg.name;
    activation.authorizedCourses = courseIds;

    activation.paymentStatus = 'verified';
    activation.paymentVerifiedAt = new Date();
    activation.paymentVerifiedBy = req.user._id;
    if (paymentAmount !== undefined) activation.paymentAmount = Number(paymentAmount) || pkg.price || 0;
    if (paymentReference !== undefined) activation.paymentReference = String(paymentReference).trim();
    if (paymentNotes !== undefined) activation.paymentNotes = String(paymentNotes).trim();

    activation.pinHash = pinHash;
    activation.pinSalt = pinSalt;
    activation.pinCreatedAt = new Date();
    activation.pinGeneratedBy = req.user._id;
    activation.pinConsumedAt = null;
    activation.status = 'pin_generated';
    activation.isActivated = false;
    activation.failedPinAttempts = 0;
    activation.lockedUntil = null;

    activation.auditLog.push({
      action: 'package_pin_generated',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: {
        packageId: pkg._id,
        packageIdentifier: pkg.identifier,
        packageName: pkg.name,
        tier: pkg.tier,
        coursesCount: courseIds.length,
        courseTitles,
        paymentReference: activation.paymentReference,
        paymentAmount: activation.paymentAmount,
      },
    });

    await activation.save();

    // Deliver PIN via persistent LMS Notification to the student
    await Notification.create({
      userId: student._id,
      type: 'activation_pin',
      title: `${pkg.name} – Activation PIN Ready`,
      message: `Your payment has been verified! Assigned Package: "${pkg.name}". Your 4-digit activation PIN is: ${pin}. Included courses: ${courseTitles.join(', ')}. Go to /activate to unlock your package.`,
      link: '/activate',
    });

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'security',
        action: 'activation.package_pin_generated',
        summary: `${req.user.name} generated 4-digit activation PIN for ${student.name} (${pkg.name})`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('packageId', 'name identifier slug tier description price features')
      .populate('paymentVerifiedBy', 'name email')
      .populate('pinGeneratedBy', 'name email');

    res.json({
      message: `4-digit activation PIN generated and sent to ${student.name}'s notifications`,
      pin,
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/regenerate-package-pin
 * Explicit reset/regeneration process with audit history: invalidates previously issued PIN
 */
async function regeneratePackagePin(req, res, next) {
  try {
    const { studentId, reason = '' } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required', code: 'INVALID_STUDENT_ID' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'STUDENT_NOT_FOUND' });
    }

    const activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      return res.status(404).json({ error: 'Activation record not found' });
    }

    if (!activation.packageId && !activation.packageName) {
      return res.status(400).json({ error: 'No package assigned to this learner yet. Please assign a package first.' });
    }

    // Invalidate previous PIN and generate fresh PIN
    const pin = generateRandomPin();
    const pinSalt = crypto.randomBytes(16).toString('hex');
    const pinHash = hashPin(pin, pinSalt);

    activation.pinHash = pinHash;
    activation.pinSalt = pinSalt;
    activation.pinCreatedAt = new Date();
    activation.pinGeneratedBy = req.user._id;
    activation.pinConsumedAt = null;
    activation.isActivated = false;
    activation.status = 'pin_generated';
    activation.failedPinAttempts = 0;
    activation.lockedUntil = null;

    activation.auditLog.push({
      action: 'package_pin_regenerated',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: {
        reason: String(reason || 'Admin regenerated PIN').trim(),
        packageName: activation.packageName,
      },
    });

    await activation.save();

    // Deliver new PIN to student via persistent LMS Notification
    await Notification.create({
      userId: student._id,
      type: 'activation_pin',
      title: 'New Activation PIN Issued',
      message: `Your activation PIN has been regenerated. Your new 4-digit PIN is: ${pin}. Enter this PIN at /activate to unlock your package "${activation.packageName}". Previous PIN has been invalidated.`,
      link: '/activate',
    });

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'security',
        action: 'activation.pin_regenerated',
        summary: `${req.user.name} regenerated activation PIN for ${student.name}. Reason: ${reason || 'N/A'}`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('packageId', 'name identifier slug tier description price features')
      .populate('paymentVerifiedBy', 'name email')
      .populate('pinGeneratedBy', 'name email');

    res.json({
      message: `New activation PIN generated and sent to ${student.name}'s notifications`,
      pin,
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/generate-pin
 * Seamless alias for package PIN generation or manual request
 */
async function generatePin(req, res, next) {
  if (req.body?.packageId || req.body?.packageIdentifier) {
    return generatePackagePin(req, res, next);
  }
  return res.status(400).json({
    error: 'Please specify a course package (packageId or packageIdentifier) to generate an activation PIN.',
    code: 'PACKAGE_REQUIRED',
  });
}

/**
 * POST /api/admin/activation/reset
 * Admin resets device activation (e.g., student changed computer / lost access)
 * Clears the hardware device binding so student can activate on new device using the central default PIN.
 * Does NOT generate student-specific PINs.
 */
async function resetActivation(req, res, next) {
  try {
    const { studentId, reason = '' } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required' });
    }

    const activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      return res.status(404).json({ error: 'Activation record not found' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Preserve reset history
    activation.resetHistory.push({
      resetAt: new Date(),
      resetBy: req.user._id,
      reason: String(reason || 'Admin reset activation').trim(),
      previousDeviceId: activation.activationDeviceId,
      previousActivatedAt: activation.activatedAt,
    });

    // Invalidate old device binding
    activation.isActivated = false;
    activation.activationDeviceId = null;
    activation.activationSessionId = null;
    activation.activatedAt = null;
    activation.deviceInfo = {
      userAgent: '',
      ip: '',
      browser: '',
      os: '',
      platform: '',
      activatedAt: null,
      lastSeenAt: null,
    };
    activation.failedPinAttempts = 0;
    activation.lockedUntil = null;
    activation.pinHash = null;
    activation.pinSalt = null;
    activation.pinExpiresAt = null;

    activation.status =
      activation.paymentStatus === 'verified' && activation.authorizedCourses?.length
        ? 'course_authorized'
        : 'payment_pending';

    activation.auditLog.push({
      action: 'activation_reset',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: {
        reason,
        deviceBindingCleared: true,
      },
    });

    await activation.save();

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'security',
        action: 'activation.reset',
        summary: `${req.user.name} reset device activation for ${student.name} (${student.email}). Reason: ${reason || 'N/A'}`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('paymentVerifiedBy', 'name email')
      .populate('resetHistory.resetBy', 'name email');

    res.json({
      message: 'Device activation reset successfully. Old device binding cleared. Learner may activate on their new device with the central activation PIN.',
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/revoke
 * Admin revokes activation immediately
 */
async function revokeActivation(req, res, next) {
  try {
    const { studentId, reason = '' } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required' });
    }

    const activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      return res.status(404).json({ error: 'Activation record not found' });
    }

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    activation.status = 'revoked';
    activation.isActivated = false;
    activation.revokedAt = new Date();
    activation.revokedBy = req.user._id;
    activation.revocationReason = String(reason || '').trim();
    // Invalidate active PIN
    activation.pinHash = null;
    activation.pinSalt = null;

    activation.auditLog.push({
      action: 'activation_revoked',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: { reason: activation.revocationReason },
    });

    await activation.save();

    // Suspend CourseAccess grants for this student's authorized courses
    if (activation.authorizedCourses?.length) {
      await CourseAccess.updateMany(
        { studentId: student._id, courseId: { $in: activation.authorizedCourses } },
        {
          $set: {
            suspended: true,
            suspensionReason: `Activation revoked by admin: ${activation.revocationReason || 'Revoked'}`,
            suspendedBy: req.user._id,
            suspendedAt: new Date(),
          },
        }
      );
    }

    try {
      await sendActivationRevokedEmail({
        studentName: student.name,
        email: student.email,
        reason: activation.revocationReason,
      });
    } catch {}

    await activity.log(
      { user: req.user, ip: req.ip },
      {
        category: 'security',
        action: 'activation.revoked',
        summary: `${req.user.name} revoked activation for ${student.name}. Reason: ${activation.revocationReason || 'N/A'}`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category')
      .populate('revokedBy', 'name email');

    res.json({
      message: 'Activation revoked successfully',
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/activation/reauthorize
 * Re-authorize a revoked or expired activation
 */
async function reauthorizeActivation(req, res, next) {
  try {
    const { studentId } = req.body || {};
    if (!studentId || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ error: 'Valid student ID is required' });
    }

    const activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      return res.status(404).json({ error: 'Activation record not found' });
    }

    activation.status = activation.authorizedCourses?.length ? 'course_authorized' : 'payment_verified';
    activation.revokedAt = null;
    activation.revokedBy = null;
    activation.revocationReason = '';

    activation.auditLog.push({
      action: 'reauthorized',
      performedBy: req.user._id,
      performedAt: new Date(),
    });

    await activation.save();

    const populated = await DeviceActivation.findById(activation._id)
      .populate('authorizedCourses', 'title thumbnail accent price category');

    res.json({
      message: 'Activation re-authorized successfully. You can now generate a PIN.',
      activation: populated,
    });
  } catch (err) {
    next(err);
  }
}

/* --------------------------------------------------------------------------
 * STUDENT PIN ACTIVATION & AUTHENTICATION (SYSTEM A & SYSTEM B CHECKS)
 * -------------------------------------------------------------------------- */

/**
 * POST /api/auth/activate
 * Student enters email and 4-digit PIN for first device activation
 */
async function activateDevice(req, res, next) {
  try {
    const { email: rawEmail, pin: rawPin, deviceId: rawDeviceId, deviceInfo = {} } = req.body || {};

    const email = String(rawEmail || '').trim().toLowerCase();
    const pin = String(rawPin || '').trim();

    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and 4-digit activation PIN are required' });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'Activation PIN must be exactly 4 digits' });
    }

    // 1. Verify student exists
    const student = await User.findOne({ email });
    if (!student) {
      return res.status(404).json({ error: 'No student account found with this email address' });
    }

    // 2. Verify activation record exists
    const activation = await DeviceActivation.findOne({ studentId: student._id });
    if (!activation) {
      return res.status(404).json({
        error: 'No course authorization found for this account. Please contact the administrator.',
        code: 'NO_AUTHORIZATION',
      });
    }

    // 3. Centralized Platform Settings Check & Brute Force Lockout
    const settings = await settingsService.get();
    if (settings.activation?.systemEnabled === false) {
      return res.status(403).json({
        error: 'The device activation system is currently disabled by administrator. Please contact support.',
        code: 'SYSTEM_DISABLED',
      });
    }

    if (activation.lockedUntil && activation.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((activation.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Too many failed PIN attempts. Account locked. Try again in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}.`,
        code: 'PIN_THROTTLED',
      });
    }

    // 4. Revocation check
    if (activation.status === 'revoked') {
      return res.status(403).json({
        error: 'Your course activation has been revoked by the administrator. Please contact support.',
        code: 'ACTIVATION_REVOKED',
      });
    }

    // 5. CRITICAL REQUIREMENT: Check if already activated on another device (System B attempt)
    // System A must remain completely active. Second device attempt is rejected with 409 without disrupting System A.
    if (activation.isActivated || activation.status === 'activated') {
      return res.status(409).json({
        error: 'Your activation PIN has already been used on another device. This access has already been activated. Please contact the administrator if you need to reset your activation.',
        code: 'ALREADY_ACTIVATED_ON_OTHER_DEVICE',
      });
    }

    // 6. Validate Activation PIN (individual 4-digit package PIN per learner, with default PIN fallback)
    let isPinValid = false;
    if (activation.pinHash && activation.pinSalt) {
      isPinValid = verifyPinHash(pin, activation.pinSalt, activation.pinHash);
    } else {
      const pinVerification = await settingsService.verifyDefaultPin(pin);
      isPinValid = Boolean(pinVerification.valid);
    }

    if (!isPinValid) {
      const maxAttempts = settings.activation?.maxFailedAttempts || 5;
      const lockoutMinutes = settings.activation?.lockoutDurationMinutes || 15;

      activation.failedPinAttempts = (activation.failedPinAttempts || 0) + 1;
      if (activation.failedPinAttempts >= maxAttempts) {
        activation.lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
      }
      await activation.save();

      const remainingTries = Math.max(0, maxAttempts - activation.failedPinAttempts);
      return res.status(401).json({
        error:
          remainingTries > 0
            ? `Invalid activation PIN. ${remainingTries} attempt${remainingTries === 1 ? '' : 's'} remaining.`
            : `Invalid activation PIN. Account locked for ${lockoutMinutes} minutes due to multiple failed attempts.`,
        code: 'INVALID_PIN',
      });
    }

    // 7. Verify Payment status (strictly enforced)
    if (activation.paymentStatus !== 'verified') {
      return res.status(403).json({
        error: 'Payment verification is still pending. Please contact the administrator.',
        code: 'PAYMENT_PENDING',
      });
    }

    // 8. Verify Authorized courses exist (shared PIN must NEVER authorize without student-specific courses)
    if (!activation.authorizedCourses || activation.authorizedCourses.length === 0) {
      return res.status(400).json({
        error: 'No courses are currently authorized for this account. Please contact administrator.',
        code: 'NO_COURSES',
      });
    }

    // 10. ATOMIC PIN CONSUMPTION & FIRST DEVICE ACTIVATION (SYSTEM A)
    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
    const finalDeviceId = rawDeviceId && String(rawDeviceId).trim()
      ? String(rawDeviceId).trim()
      : (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

    const updatedActivation = await DeviceActivation.findOneAndUpdate(
      {
        _id: activation._id,
        isActivated: false,
        status: { $in: ['payment_verified', 'course_authorized', 'pin_generated', 'not_activated'] },
      },
      {
        $set: {
          isActivated: true,
          status: 'activated',
          activatedAt: new Date(),
          activationDeviceId: finalDeviceId,
          activationSessionId: sessionId,
          pinConsumedAt: new Date(),
          pinHash: null, // Wipe PIN hash atomically so it can NEVER be reused
          pinSalt: null,
          failedPinAttempts: 0,
          lockedUntil: null,
          deviceInfo: {
            userAgent: req.headers['user-agent'] || '',
            ip: req.ip || req.connection?.remoteAddress || '',
            platform: deviceInfo?.platform || '',
            browser: deviceInfo?.browser || '',
            os: deviceInfo?.os || '',
            activatedAt: new Date(),
            lastSeenAt: new Date(),
          },
        },
        $push: {
          auditLog: {
            action: 'first_device_activated',
            performedBy: student._id,
            performedAt: new Date(),
            details: {
              deviceId: finalDeviceId,
              ip: req.ip,
              userAgent: req.headers['user-agent'],
            },
          },
        },
      },
      { new: true }
    ).populate('authorizedCourses', 'title thumbnail accent price category');

    if (!updatedActivation) {
      // Race condition: another request just activated it
      return res.status(409).json({
        error: 'Your activation PIN has already been used on another device. This access has already been activated.',
        code: 'ALREADY_ACTIVATED_ON_OTHER_DEVICE',
      });
    }

    // 11. Unlock only specifically authorized courses preserving access source
    for (const courseId of activation.authorizedCourses) {
      const existingGrant = await CourseAccess.findOne({ studentId: student._id, courseId });
      const accessSource = existingGrant?.source || (activation.packageId ? 'package' : 'manual');
      await CourseAccess.findOneAndUpdate(
        { studentId: student._id, courseId },
        {
          $set: {
            active: true,
            suspended: false,
            suspensionReason: '',
            source: accessSource,
            packageId: activation.packageId || null,
          },
          $setOnInsert: {
            studentId: student._id,
            courseId,
          },
        },
        { upsert: true, new: true }
      );

      await Enrollment.findOneAndUpdate(
        { studentId: student._id, courseId },
        {
          $set: {
            status: 'completed',
            gateway: 'manual',
            reference: activation.paymentReference || 'Package Activation',
            confirmedAt: new Date(),
          },
          $setOnInsert: {
            studentId: student._id,
            courseId,
          },
        },
        { upsert: true }
      );
    }

    // Send LMS confirmation notification to student
    try {
      await Notification.create({
        userId: student._id,
        type: 'access_granted',
        title: 'Package Activated Successfully!',
        message: `Congratulations! Your courses for "${activation.packageName || 'course package'}" have been unlocked. Start learning now!`,
        link: '/my-courses',
      });
    } catch {}

    // 12. Establish student's authenticated session
    student.currentSessionId = sessionId;
    student.lastLoginAt = new Date();
    await student.save();

    const token = generateAuthToken(student, sessionId, finalDeviceId);

    await activity.log(
      { user: student, ip: req.ip },
      {
        category: 'security',
        action: 'activation.device_activated',
        summary: `Learner ${student.name} successfully activated LMS on first device (${finalDeviceId.slice(0, 8)}...)`,
        entityType: 'user',
        entityId: student._id,
      }
    );

    res.json({
      message: 'Device activation successful! Your course access is unlocked.',
      token,
      student,
      deviceId: finalDeviceId,
      authorizedCourses: updatedActivation.authorizedCourses,
      activation: {
        status: updatedActivation.status,
        isActivated: updatedActivation.isActivated,
        activatedAt: updatedActivation.activatedAt,
        deviceId: finalDeviceId,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/activation-status
 * Check activation status for currently signed-in student / device.
 * Dynamically evaluates database records across User, DeviceActivation, and Package models.
 */
async function getActivationStatus(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const student = req.user;
    const activation = await DeviceActivation.findOne({ studentId: student._id })
      .populate('packageId', 'name slug identifier tier price description')
      .populate('authorizedCourses', 'title thumbnail accent price category slug');

    const clientDeviceId = req.headers['x-device-id'];
    const isCurrentDevice = Boolean(
      activation?.activationDeviceId &&
      clientDeviceId &&
      activation.activationDeviceId === clientDeviceId
    );

    // Dynamic, database-driven status determination
    let currentStatus = 'profile_incomplete';
    const paymentStatus = activation?.paymentStatus || 'pending';
    const isActivated = Boolean(activation?.isActivated && activation?.status === 'activated');

    if (!student.profileCompleted) {
      currentStatus = 'profile_incomplete';
    } else if (isActivated) {
      currentStatus = 'activated';
    } else if (activation?.status === 'revoked') {
      currentStatus = 'activation_revoked';
    } else if (activation?.status === 'pin_generated' || Boolean(activation?.pinHash)) {
      currentStatus = 'pin_generated';
    } else if (activation?.paymentStatus === 'verified' && activation?.packageId) {
      currentStatus = 'package_assigned';
    } else if (activation?.paymentStatus === 'verified') {
      currentStatus = 'payment_verified';
    } else {
      currentStatus = 'payment_pending';
    }

    res.json({
      hasActivation: Boolean(activation),
      status: currentStatus,
      rawStatus: activation?.status || 'payment_pending',
      paymentStatus,
      isActivated,
      profileCompleted: Boolean(student.profileCompleted),
      activatedAt: activation?.activatedAt || null,
      isCurrentDevice,
      packageName: activation?.packageName || activation?.packageId?.name || null,
      packageIdentifier: activation?.packageIdentifier || activation?.packageId?.identifier || null,
      package: activation?.packageId || null,
      authorizedCourses: activation?.authorizedCourses || [],
      onboardingDetailsSubmittedAt: activation?.onboardingDetailsSubmittedAt || student.onboardingSubmittedAt || null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStudentActivation,
  listActivations,
  verifyPayment,
  authorizeCourses,
  generatePin,
  generatePackagePin,
  regeneratePackagePin,
  resetActivation,
  revokeActivation,
  reauthorizeActivation,
  activateDevice,
  getActivationStatus,
  hashPin,
  generateRandomPin,
  verifyPinHash,
};
