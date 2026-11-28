const mongoose = require('mongoose');
const Course = require('../models/Course');
const Resource = require('../models/Resource');
const ResourceAccess = require('../models/ResourceAccess');
const { courseAccessFor, grantedCourseIds } = require('../services/enrolmentService');

/**
 * Study materials (PDFs, slides, documents, links).
 * Strictly course-specific: students ONLY see and access resources belonging
 * to the courses for which they have valid course access (verified Razorpay payment,
 * manual Admin course authorization, or Full Access).
 */

/** GET /api/courses/:courseId/resources — strictly course-authorized. */
async function listResourcesForCourse(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const access = await courseAccessFor(req.user, courseId);
    if (!access.allowed) {
      return res.status(403).json({
        error:
          access.reason === 'expired'
            ? 'Your access to this course has expired'
            : access.reason === 'suspended'
            ? 'Your access to this course is suspended'
            : 'You do not have access to this course resources',
        code: 'COURSE_ACCESS_REQUIRED',
      });
    }

    const resources = await Resource.find({ courseId }).sort({ createdAt: 1 });
    res.json(resources);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resources/:id
 * Direct resource access authorization: verifies student has valid course access
 * for this specific resource before returning details. Prevents ID manipulation bypass.
 */
async function getResourceById(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const resource = await Resource.findById(id).populate('courseId', 'title slug published');
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found' });
    }

    const courseId = resource.courseId?._id || resource.courseId;
    const access = await courseAccessFor(req.user, courseId);
    if (!access.allowed) {
      return res.status(403).json({
        error: 'You do not have access to this course resource.',
        code: 'COURSE_ACCESS_REQUIRED',
      });
    }

    res.json(resource);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/resources/mine — every material this learner can open, grouped by course.
 * Strictly course-specific: students only see resources from their authorized courses.
 */
async function listMine(req, res, next) {
  try {
    const user = req.user;
    const isStaff = user.role === 'admin';
    const hasFullAccess = Boolean(user.fullAccess);

    let authorizedCourseIds = [];

    if (isStaff) {
      // Staff can view all courses
      const allCourses = await Course.find().select('_id');
      authorizedCourseIds = allCourses.map((c) => c._id);
    } else if (hasFullAccess) {
      // Full Access covers all published courses
      const allPublished = await Course.find({ published: { $ne: false } }).select('_id');
      authorizedCourseIds = allPublished.map((c) => c._id);
    } else {
      // Student: dynamically fetch verified authorized course IDs from database
      const grantedIds = await grantedCourseIds(user._id);

      // Validate each course grant with courseAccessFor to ensure no suspended/expired courses leak
      const accessChecks = await Promise.all(
        grantedIds.map(async (cId) => {
          const access = await courseAccessFor(user, cId);
          return access.allowed ? cId : null;
        })
      );
      authorizedCourseIds = accessChecks.filter(Boolean);
    }

    if (!authorizedCourseIds.length) {
      return res.json([]);
    }

    // Fetch only authorized courses
    const courseFilter = { _id: { $in: authorizedCourseIds } };
    if (!isStaff) courseFilter.published = { $ne: false };

    const courses = await Course.find(courseFilter)
      .select('title thumbnail accent category')
      .sort({ createdAt: 1 });

    // Fetch ONLY resources belonging to authorized courses
    const resources = await Resource.find({
      courseId: { $in: courses.map((c) => c._id) },
    }).sort({ createdAt: 1 });

    const byCourse = new Map();
    for (const resource of resources) {
      const key = String(resource.courseId);
      if (!byCourse.has(key)) byCourse.set(key, []);
      byCourse.get(key).push(resource);
    }

    // Group resources by course; include courses that have study materials
    const groups = courses
      .map((course) => {
        const key = String(course._id);
        const courseResources = byCourse.get(key) || [];
        return {
          course: {
            _id: course._id,
            title: course.title,
            thumbnail: course.thumbnail,
            accent: course.accent,
            category: course.category,
          },
          access: isStaff || hasFullAccess ? 'full' : 'course',
          resources: courseResources,
        };
      })
      .filter((group) => group.resources.length > 0);

    res.json(groups);
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/resources — every material, for the per-learner picker. */
async function listAll(_req, res, next) {
  try {
    const resources = await Resource.find().populate('courseId', 'title').sort({ courseId: 1, createdAt: 1 });
    res.json(
      resources.map((r) => ({
        ...r.toJSON(),
        courseId: r.courseId?._id || r.courseId,
        courseTitle: r.courseId?.title || 'Deleted course',
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { listResourcesForCourse, getResourceById, listMine, listAll };
