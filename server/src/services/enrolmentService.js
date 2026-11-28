const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const settingsService = require('./settingsService');
const { notifyUser, notifyAdmins, activeLearnerIds } = require('./notificationService');
const { ACTIVATION_STATUS, PAYMENT_STATUS } = require('../constants');

/**
 * The one place course access is granted, and the payment state machine
 * that leads to it. Admin actions, the free-course checkout, the Razorpay
 * callback and its webhook all come through here, so a learner is enrolled
 * (and everyone is told) the same way whichever path got them there.
 *
 * The three kinds of access a learner can have:
 *   Full Access     User.fullAccess — every course and material, including future ones
 *   Course access   a live CourseAccess row — granted by an admin (Limited
 *                   Access), or created automatically by a paid / free enrolment
 *   Material access ResourceAccess rows — individual study materials only
 */

const rupees = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;

/** True when the grant exists, is switched on, is not suspended, and has not run out. */
function isGrantLive(grant) {
  return Boolean(grant?.active) && !grant?.suspended && (!grant.expiresAt || new Date(grant.expiresAt) > new Date());
}

/**
 * Whether `user` may open a course's lessons, videos and materials.
 * Returns { allowed, via: 'staff' | 'full' | 'grant', reason?: 'none' | 'expired' | 'suspended', suspensionReason?: string }.
 */
async function courseAccessFor(user, courseId) {
  if (!user || !courseId) return { allowed: false, reason: 'none' };
  if (user.role === 'admin') return { allowed: true, via: 'staff' };

  // Explicit course-specific suspension check
  const grant = await CourseAccess.findOne({ studentId: user._id, courseId });
  if (grant?.suspended) {
    return {
      allowed: false,
      reason: 'suspended',
      suspensionReason: grant.suspensionReason || '',
      suspendedAt: grant.suspendedAt || null,
      grant,
    };
  }

  // If an explicit grant exists and is inactive, learner has been unenrolled from this course
  if (grant && !grant.active) {
    return { allowed: false, reason: 'none' };
  }

  // Check centralized Device Activation settings:
  const settings = await settingsService.get();
  const activationEnabled = settings.activation?.systemEnabled !== false;

  if (activationEnabled) {
    const activation = await DeviceActivation.findOne({ studentId: user._id });
    if (!activation) {
      return { allowed: false, reason: 'none' };
    }
    if (activation.status === ACTIVATION_STATUS.REVOKED) {
      return {
        allowed: false,
        reason: 'suspended',
        suspensionReason: activation.revocationReason || 'Your course activation has been revoked by the administrator.',
      };
    }
    if (!activation.isActivated || activation.status !== ACTIVATION_STATUS.ACTIVATED) {
      return {
        allowed: false,
        reason: 'none',
      };
    }
    if (activation.paymentStatus !== PAYMENT_STATUS.VERIFIED) {
      return {
        allowed: false,
        reason: 'none',
      };
    }
    const isAuthorized =
      (activation.authorizedCourses || []).some((cId) => String(cId) === String(courseId)) ||
      (grant && isGrantLive(grant));
    if (!isAuthorized) {
      return { allowed: false, reason: 'none' };
    }
  }

  if (!grant || !grant.active) return { allowed: false, reason: 'none' };
  if (!isGrantLive(grant)) return { allowed: false, reason: 'expired' };
  return { allowed: true, via: 'grant', grant };
}

/**
 * Every active learner who can currently open a course: live grants plus
 * Full Access accounts (excluding any explicitly suspended for this course).
 * The audience for "new lesson", "new task" and course-specific events.
 */
async function learnerIdsWithAccess(courseId) {
  const grants = await CourseAccess.find({ courseId, active: true }).select('studentId active suspended expiresAt');
  const live = grants.filter(isGrantLive).map((g) => g.studentId);
  const suspendedLearnerIds = grants.filter((g) => g.suspended).map((g) => g.studentId);
  return activeLearnerIds({
    $or: [
      { _id: { $in: live } },
      { fullAccess: true, _id: { $nin: suspendedLearnerIds } },
    ],
  });
}

/** Ids of the courses a learner can open through their own grants. Strictly requires verified device activation when enabled. */
async function grantedCourseIds(studentId) {
  const settings = await settingsService.get();
  const activationEnabled = settings.activation?.systemEnabled !== false;

  if (activationEnabled) {
    const activation = await DeviceActivation.findOne({ studentId });
    if (
      !activation ||
      !activation.isActivated ||
      activation.status !== ACTIVATION_STATUS.ACTIVATED ||
      activation.paymentStatus !== PAYMENT_STATUS.VERIFIED
    ) {
      return [];
    }

    const grants = await CourseAccess.find({
      studentId,
      courseId: { $in: activation.authorizedCourses || [] },
      active: true,
      suspended: { $ne: true },
    }).select('courseId active suspended expiresAt');
    return grants.filter(isGrantLive).map((g) => g.courseId);
  }

  const grants = await CourseAccess.find({
    studentId,
    active: true,
    suspended: { $ne: true },
  }).select('courseId active suspended expiresAt');
  return grants.filter(isGrantLive).map((g) => g.courseId);
}

/**
 * Turns Full Access on or off for a learner. Returns true when it changed.
 * Course grants are untouched either way.
 */
async function setFullAccess(student, enabled, { by } = {}) {
  if (Boolean(student.fullAccess) === Boolean(enabled)) return false;

  student.fullAccess = Boolean(enabled);
  student.fullAccessGrantedAt = enabled ? new Date() : undefined;
  student.fullAccessGrantedBy = enabled ? by : undefined;
  await student.save();

  await notifyUser(student._id, enabled
    ? {
        type: 'access_granted',
        title: 'Full access granted',
        message: 'You now have access to every course and learning material, including new courses as they are added.',
        link: '/my-courses',
      }
    : {
        type: 'access_revoked',
        title: 'Full access ended',
        message: 'Your all-course access has ended. Courses you were enrolled in or paid for individually are still available.',
        link: '/my-courses',
      });
  return true;
}

/**
 * Grants (or re-activates) a learner's access to a course.
 *
 * Returns { grant, alreadyActive }. An access that is already live is left
 * untouched — re-running a grant must not quietly extend an expiry date.
 *
 * Options:
 *   by             the staff user granting it (absent for checkout / gateway)
 *   source         'payment' | 'free' | 'manual' | 'bulk'
 *   learnerNotice  { title, message, setting? } — what the learner is told; false for nothing
 *   notifyStaff    tell the admin team "learner enrolled" (default true)
 */
async function grantCourseAccess(studentId, course, { by, source = 'manual', learnerNotice, notifyStaff = true } = {}) {
  const existing = await CourseAccess.findOne({ studentId, courseId: course._id });
  const alreadyLive = isGrantLive(existing);

  const { learning } = await settingsService.get();
  const expiresAt =
    learning.accessDurationDays > 0 ? new Date(Date.now() + learning.accessDurationDays * 86400000) : null;

  const grant = await CourseAccess.findOneAndUpdate(
    { studentId, courseId: course._id },
    {
      $set: {
        active: true,
        suspended: false,
        suspensionReason: '',
        suspendedBy: null,
        suspendedAt: null,
        source,
        expiresAt,
        ...(by ? { grantedBy: by } : {}),
      },
      $setOnInsert: { studentId, courseId: course._id },
    },
    { new: true, upsert: true }
  );

  // 1. Ensure Enrollment record exists and is marked completed
  const isRazorpay = source === 'razorpay' || source === 'payment';
  let enrollment = await Enrollment.findOne({ studentId, courseId: course._id });
  if (!enrollment) {
    enrollment = new Enrollment({
      studentId,
      courseId: course._id,
      transactionId: Enrollment.generateTransactionId(),
      amount: source === 'complimentary' || source === 'free' ? 0 : Number(course.price) || 0,
      currency: 'INR',
      method: isRazorpay ? 'razorpay' : source === 'complimentary' || source === 'free' ? 'free' : 'manual',
      gateway: isRazorpay ? 'razorpay' : 'manual',
      status: 'completed',
      confirmedBy: by || undefined,
      confirmedAt: new Date(),
      history: [{ status: 'completed', note: `Access granted via ${source}`, by, at: new Date() }],
    });
    await enrollment.save();
  } else if (enrollment.status !== 'completed') {
    enrollment.status = 'completed';
    enrollment.confirmedBy = by || enrollment.confirmedBy || undefined;
    enrollment.confirmedAt = enrollment.confirmedAt || new Date();
    enrollment.history.push({ status: 'completed', note: `Access confirmed via ${source}`, by, at: new Date() });
    await enrollment.save();
  }

  // 2. Synchronize with DeviceActivation
  const user = await User.findById(studentId);
  if (user) {
    let activation = await DeviceActivation.findOne({ studentId });
    if (!activation) {
      activation = new DeviceActivation({
        studentId: user._id,
        email: user.email,
        status: 'course_authorized',
        paymentStatus: 'verified',
        paymentVerifiedAt: new Date(),
        paymentAmount: enrollment?.amount || 0,
        paymentReference: enrollment?.reference || enrollment?.transactionId || '',
        authorizedCourses: [course._id],
      });
    } else {
      activation.paymentStatus = 'verified';
      activation.paymentVerifiedAt = activation.paymentVerifiedAt || new Date();
      if (!activation.paymentReference && enrollment?.reference) {
        activation.paymentReference = enrollment.reference;
      }
      const courseSet = new Set((activation.authorizedCourses || []).map(String));
      courseSet.add(String(course._id));
      activation.authorizedCourses = Array.from(courseSet);

      if (['payment_pending', 'payment_verified', 'not_activated'].includes(activation.status)) {
        activation.status = 'course_authorized';
      }
    }

    activation.auditLog.push({
      action: isRazorpay ? 'payment_verified' : 'course_authorized',
      performedBy: by || user._id,
      performedAt: new Date(),
      details: {
        courseId: course._id,
        courseTitle: course.title,
        source,
        autoEnrolled: Boolean(!by),
      },
    });

    await activation.save();
  }

  if (learnerNotice !== false && !alreadyLive) {
    const notice = learnerNotice || {
      title: 'Course access granted',
      message: `You now have access to "${course.title}". Start learning any time.`,
    };
    await notifyUser(
      studentId,
      {
        type: 'access_granted',
        title: notice.title,
        message: notice.message,
        courseId: course._id,
        link: `/my-courses/${course._id}`,
      },
      { setting: notice.setting }
    );
  }

  if (notifyStaff && !alreadyLive) {
    const student = await User.findById(studentId).select('name');
    await notifyAdmins(
      {
        type: 'enrollment',
        title: 'Learner enrolled',
        message: `${student?.name || 'A learner'} was enrolled in "${course.title}"${
          source === 'free' ? ' (free course)' : ''
        }.`,
        courseId: course._id,
        link: `/admin/learners/${studentId}`,
      },
      { setting: 'admin.learnerEnrolled', exclude: by }
    );
  }

  return { grant, alreadyActive: alreadyLive };
}

/** Turns access off. Returns the grant, or null if there was none. */
async function revokeCourseAccess(studentId, course) {
  const grant = await CourseAccess.findOneAndUpdate(
    { studentId, courseId: course._id },
    {
      $set: {
        active: false,
        suspended: false,
        suspensionReason: '',
        suspendedBy: null,
        suspendedAt: null,
      },
      $setOnInsert: { studentId, courseId: course._id, source: 'manual' },
    },
    { new: true, upsert: true }
  );
  if (!grant) return null;

  // Cleanly remove only this course from DeviceActivation.authorizedCourses
  const activation = await DeviceActivation.findOne({ studentId });
  if (activation && activation.authorizedCourses?.length) {
    activation.authorizedCourses = activation.authorizedCourses.filter(
      (cId) => String(cId) !== String(course._id)
    );
    if (activation.authorizedCourses.length === 0 && activation.status === 'course_authorized') {
      activation.status = 'payment_verified';
    }
    await activation.save();
  }

  await notifyUser(studentId, {
    type: 'access_revoked',
    title: 'Course access revoked',
    message: `Your access to "${course.title}" was revoked`,
    courseId: course._id,
  });
  return grant;
}

async function loadParties(enrollment) {
  const courseId = enrollment.courseId?._id || enrollment.courseId;
  const studentId = enrollment.studentId?._id || enrollment.studentId;
  const [course, student] = await Promise.all([Course.findById(courseId), User.findById(studentId)]);
  return { course, student };
}

/**
 * Marks a payment successful and, per Settings, enrols the learner.
 *
 * An admin confirming by hand always enrols — that is what the button says.
 * A gateway success enrols when "auto-enrol on successful payment" is on;
 * otherwise the admin team is told to enrol the learner themselves.
 *
 * Returns { enrollment, granted }.
 */
async function markPaymentSuccessful(enrollment, { reference = '', by, note = '' } = {}) {
  const { course, student } = await loadParties(enrollment);
  const wasSuccessful = enrollment.status === 'completed';

  if (!wasSuccessful) {
    const now = new Date();
    enrollment.status = 'completed';
    if (reference) enrollment.reference = String(reference).slice(0, 120);
    enrollment.failureReason = '';
    enrollment.confirmedBy = by || undefined;
    enrollment.confirmedAt = now;
    enrollment.history.push({ status: 'completed', note: note || (by ? 'Marked paid by admin' : 'Payment verified'), by });
    await enrollment.save();

    // If this payment was confirmed now, ensure createdAt is synced if it was created significantly earlier
    if (enrollment.createdAt && (now - new Date(enrollment.createdAt) > 24 * 60 * 60 * 1000)) {
      await enrollment.constructor.collection.updateOne(
        { _id: enrollment._id },
        { $set: { createdAt: now } }
      );
      enrollment.createdAt = now;
    }
  }

  if (!course || !student) return { enrollment, granted: false };

  const { payments } = await settingsService.get();
  const shouldEnrol = Boolean(by) || payments.autoEnrolOnSuccess;

  let granted = false;
  if (shouldEnrol) {
    const result = await grantCourseAccess(student._id, course, {
      by,
      source: enrollment.gateway === 'razorpay' ? 'razorpay' : 'payment',
      learnerNotice: {
        title: 'Payment successful',
        message: `Your payment of ${rupees(enrollment.amount)} is confirmed and "${course.title}" is now unlocked.`,
        setting: 'learner.paymentConfirmed',
      },
      // The "payment received" notice below already says the learner was enrolled.
      notifyStaff: false,
    });
    granted = !result.alreadyActive || wasSuccessful;
  }

  if (!wasSuccessful) {
    await notifyAdmins(
      {
        type: 'payment',
        title: 'Payment received',
        message: `${rupees(enrollment.amount)} from ${student.name} for "${course.title}"${
          shouldEnrol ? ' — learner enrolled.' : ' — enrol the learner from the Payments page.'
        }`,
        courseId: course._id,
        link: '/admin/payments',
      },
      { setting: 'admin.paymentReceived', exclude: by }
    );
  }

  return { enrollment, granted };
}

/** Marks a payment failed and tells the learner how to try again. */
async function markPaymentFailed(enrollment, { reason = '', by } = {}) {
  const { course, student } = await loadParties(enrollment);

  enrollment.status = 'failed';
  enrollment.failureReason = String(reason || '').slice(0, 300);
  enrollment.history.push({ status: 'failed', note: enrollment.failureReason, by });
  await enrollment.save();

  if (!course || !student) return enrollment;

  await notifyUser(student._id, {
    type: 'payment',
    title: 'Payment failed',
    message: `Your payment for "${course.title}" did not go through${
      enrollment.failureReason ? ` (${enrollment.failureReason})` : ''
    }. You can try again from the course page.`,
    courseId: course._id,
    link: `/courses/${course._id}/enrol`,
  });

  await notifyAdmins(
    {
      type: 'payment',
      title: 'Payment failed',
      message: `${student.name}'s payment of ${rupees(enrollment.amount)} for "${course.title}" failed${
        enrollment.failureReason ? `: ${enrollment.failureReason}` : '.'
      }`,
      courseId: course._id,
      link: '/admin/payments',
    },
    { setting: 'admin.paymentFailed', exclude: by }
  );

  return enrollment;
}

module.exports = {
  isGrantLive,
  courseAccessFor,
  learnerIdsWithAccess,
  grantedCourseIds,
  setFullAccess,
  grantCourseAccess,
  revokeCourseAccess,
  markPaymentSuccessful,
  markPaymentFailed,
  rupees,
};
