const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const Enrollment = require('../models/Enrollment');
const ResourceAccess = require('../models/ResourceAccess');
const Review = require('../models/Review');
const { isGrantLive } = require('../services/enrolmentService');
const { COURSE_ACCESS_STATUS, ACTIVATION_STATUS, PAYMENT_STATUS, USER_ROLES } = require('../constants');

/**
 * Attach lesson counts, this student's completion percentage, dynamic access status,
 * and whether they currently have access, to each course. Computed here so the
 * dashboard needs one request instead of N.
 *
 * `student` is undefined for anonymous catalogue browsing (the course list
 * is public) — such requests get lesson counts but no progress and no access (LOCKED).
 *
 * Dynamic accessStatus:
 *   - 'ACCESS_GRANTED': payment verified + authorized + device activated (or staff/fullAccess)
 *   - 'ACTIVATION_PENDING': payment verified + authorized, but PIN device activation pending
 *   - 'PAYMENT_PENDING': payment under review / pending admin manual verification
 *   - 'LOCKED': not purchased / not authorized
 *   - 'SUSPENDED': account or course access suspended
 */
async function decorateCourses(courses, student) {
  const courseIds = courses.map((c) => c._id);
  const isAdmin = student?.role === USER_ROLES.ADMIN;
  const hasFullAccess = Boolean(student?.fullAccess);
  const studentId = student?._id || student?.id;

  const [lessonCounts, progressRows, accessRows, materialRows, reviewStats, activation, enrollments] = await Promise.all([
    Lesson.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
    studentId ? Progress.find({ studentId, courseId: { $in: courseIds } }).lean() : [],
    studentId
      ? CourseAccess.find({ studentId, courseId: { $in: courseIds } }).lean()
      : [],
    studentId && !isAdmin ? ResourceAccess.distinct('courseId', { studentId, courseId: { $in: courseIds } }) : [],
    Review.aggregate([
      { $match: { courseId: { $in: courseIds }, hidden: false } },
      { $group: { _id: '$courseId', average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]),
    studentId ? DeviceActivation.findOne({ studentId }).lean() : null,
    studentId ? Enrollment.find({ studentId, courseId: { $in: courseIds } }).lean() : [],
  ]);

  const reviewsByCourse = new Map(reviewStats.map((r) => [String(r._id), r]));
  const materialCourses = new Set(materialRows.map(String));
  const countByCourse = new Map(lessonCounts.map((r) => [String(r._id), r.count]));
  const completedByCourse = new Map();
  for (const row of progressRows) {
    if (!row.completed) continue;
    const key = String(row.courseId);
    completedByCourse.set(key, (completedByCourse.get(key) || 0) + 1);
  }
  const accessByCourse = new Map(accessRows.map((r) => [String(r.courseId), r]));
  const enrollmentByCourse = new Map(enrollments.map((e) => [String(e.courseId), e]));

  const authorizedCourseSet = new Set((activation?.authorizedCourses || []).map((id) => String(id)));
  const isActivationActivated = Boolean(
    activation?.isActivated && activation?.status === ACTIVATION_STATUS.ACTIVATED
  );
  const isActivationRevoked = Boolean(activation?.status === ACTIVATION_STATUS.REVOKED);
  const isPaymentVerified = Boolean(activation?.paymentStatus === PAYMENT_STATUS.VERIFIED);

  return courses.map((course) => {
    const key = String(course._id);
    const lessonCount = countByCourse.get(key) || 0;
    const completed = completedByCourse.get(key) || 0;
    const grant = accessByCourse.get(key);
    const enrollment = enrollmentByCourse.get(key);
    const isSuspended = Boolean(grant?.suspended) || isActivationRevoked;
    const suspensionReason = isSuspended
      ? (grant?.suspensionReason || activation?.revocationReason || '')
      : '';
    const suspendedAt = isSuspended ? (grant?.suspendedAt || null) : null;

    let accessStatus = COURSE_ACCESS_STATUS.LOCKED;
    let accessVia = null;

    if (isSuspended) {
      accessStatus = COURSE_ACCESS_STATUS.SUSPENDED;
      accessVia = null;
    } else if (isAdmin) {
      accessStatus = COURSE_ACCESS_STATUS.ACCESS_GRANTED;
      accessVia = 'staff';
    } else if (hasFullAccess) {
      accessStatus = COURSE_ACCESS_STATUS.ACCESS_GRANTED;
      accessVia = 'full';
    } else if (activation) {
      const isCourseAuthorized = authorizedCourseSet.has(key) || (grant && isGrantLive(grant));
      if (isCourseAuthorized) {
        if (isActivationActivated) {
          accessStatus = COURSE_ACCESS_STATUS.ACCESS_GRANTED;
          accessVia = 'grant';
        } else if (isPaymentVerified || (grant && isGrantLive(grant))) {
          accessStatus = COURSE_ACCESS_STATUS.ACTIVATION_PENDING;
          accessVia = null;
        } else {
          accessStatus = COURSE_ACCESS_STATUS.PAYMENT_PENDING;
          accessVia = null;
        }
      } else if (enrollment?.status === PAYMENT_STATUS.PENDING || activation.paymentStatus === PAYMENT_STATUS.PENDING) {
        accessStatus = COURSE_ACCESS_STATUS.PAYMENT_PENDING;
        accessVia = null;
      } else {
        accessStatus = COURSE_ACCESS_STATUS.LOCKED;
        accessVia = null;
      }
    } else if (grant && isGrantLive(grant)) {
      accessStatus = COURSE_ACCESS_STATUS.ACCESS_GRANTED;
      accessVia = 'grant';
    } else if (enrollment?.status === PAYMENT_STATUS.PENDING) {
      accessStatus = COURSE_ACCESS_STATUS.PAYMENT_PENDING;
      accessVia = null;
    } else {
      accessStatus = COURSE_ACCESS_STATUS.LOCKED;
      accessVia = null;
    }

    const hasAccess = accessStatus === COURSE_ACCESS_STATUS.ACCESS_GRANTED;
    const reviews = reviewsByCourse.get(key);

    return {
      ...course.toJSON(),
      ...(reviews ? { rating: Math.round(reviews.average * 10) / 10, ratingCount: reviews.count } : {}),
      lessonCount,
      completedLessons: completed,
      progress: lessonCount ? Math.round((completed / lessonCount) * 100) : 0,
      hasAccess,
      accessStatus,
      accessVia,
      isSuspended,
      suspensionReason,
      suspendedAt,
      hasSelectedMaterials: !hasAccess && materialCourses.has(key),
      isActivated: activation ? Boolean(activation.isActivated) : false,
      deviceActivationStatus: activation ? activation.status : null,
      paymentStatus: activation?.paymentStatus || enrollment?.status || null,
      enrollmentStatus: enrollment?.status || null,
      enrollmentGateway: enrollment?.gateway || null,
    };
  });
}

/** GET /api/courses */
async function listCourses(req, res, next) {
  try {
    // Draft courses are editable in the admin dashboard but stay out of the
    // student-facing catalogue. `$ne: false` rather than `true` so courses
    // created before the field existed keep showing up.
    const filter = req.user?.role === 'admin' ? {} : { published: { $ne: false } };

    const courses = await Course.find(filter).sort({ createdAt: 1 });
    res.json(await decorateCourses(courses, req.user));
  } catch (err) {
    next(err);
  }
}

/** GET /api/courses/:id */
async function getCourse(req, res, next) {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.published === false && req.user?.role !== 'admin') {
      return res.status(404).json({ error: 'Course not found' });
    }

    const [decorated] = await decorateCourses([course], req.user);

    // The details page needs to tell "not enrolled" apart from "enrolled,
    // payment still being confirmed" so it can show the right call to action.
    if (req.user) {
      const enrollment = await Enrollment.findOne({ studentId: req.user._id, courseId: course._id });
      decorated.enrollmentStatus = enrollment?.status || null;
      // A pending Razorpay order is a checkout the learner can simply retry;
      // a pending manual one is waiting on an admin.
      decorated.enrollmentGateway = enrollment?.gateway || null;
    }

    res.json(decorated);
  } catch (err) {
    next(err);
  }
}

module.exports = { listCourses, getCourse };
