const mongoose = require('mongoose');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const User = require('../models/User');
const CourseAccess = require('../models/CourseAccess');
const Enrollment = require('../models/Enrollment');
const Resource = require('../models/Resource');
const ResourceAccess = require('../models/ResourceAccess');
const Review = require('../models/Review');
const driveService = require('../services/googleDriveService');
const { notifyUser, notifyUsers, activeLearnerIds } = require('../services/notificationService');
const activity = require('../services/activityService');
const {
  grantCourseAccess,
  revokeCourseAccess,
  isGrantLive,
  learnerIdsWithAccess,
  rupees,
} = require('../services/enrolmentService');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { checkUrl, normaliseDriveLink } = require('../utils/url');

/**
 * Everything the admin dashboard is allowed to write on a course.
 *
 * Built as an allowlist rather than spreading req.body so that a request
 * cannot reach fields the dashboard has no business setting — `driveFolderId`
 * (owned by the Drive importer) and the `lessons` array (owned by
 * addLesson/deleteLesson) in particular.
 *
 * Only keys actually present in the body are returned, so a partial edit
 * (PUT with just a thumbnail) leaves every other field alone.
 */
const TEXT_FIELDS = [
  'title', 'slug', 'description', 'summary', 'instructor', 'instructorTitle',
  'level', 'category', 'accent', 'thumbnail', 'introVideoUrl', 'language',
];
const NUMBER_FIELDS = ['hours', 'price', 'originalPrice', 'rating', 'ratingCount', 'studentsCount'];
const LIST_FIELDS = ['outcomes', 'requirements', 'features'];
const BOOLEAN_FIELDS = ['published', 'certificateIncluded', 'hasDriveVideos'];

/** Trims a bullet list, dropping blanks and capping length. */
function cleanList(value) {
  if (!Array.isArray(value)) {
    if (typeof value !== 'string') return [];
    value = value.split(/\r?\n/);
  }
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 40);
}

function buildCourseFields(body = {}) {
  const fields = {};

  for (const key of TEXT_FIELDS) {
    if (body[key] === undefined) continue;
    fields[key] = String(body[key]).trim();
  }

  for (const key of NUMBER_FIELDS) {
    if (body[key] === undefined || body[key] === '') continue;
    const number = Number(body[key]);
    if (Number.isFinite(number) && number >= 0) fields[key] = number;
  }

  for (const key of LIST_FIELDS) {
    if (body[key] === undefined) continue;
    fields[key] = cleanList(body[key]);
  }

  for (const key of BOOLEAN_FIELDS) {
    if (body[key] === undefined) continue;
    fields[key] = Boolean(body[key]);
  }

  // The formatted long description is the one field that carries markup, so
  // it is the one field that has to be sanitised.
  if (body.descriptionHtml !== undefined) {
    fields.descriptionHtml = sanitizeHtml(String(body.descriptionHtml));
  }

  return fields;
}

/** Checks the course's links in place; returns an error message or null. */
function validateCourseLinks(fields) {
  if (fields.introVideoUrl !== undefined) {
    const result = checkUrl(fields.introVideoUrl, { label: 'Intro video URL' });
    if (result.error) return result.error;
    fields.introVideoUrl = result.value;
  }
  if (fields.thumbnail !== undefined) {
    const result = checkUrl(fields.thumbnail, { allowUploads: true, label: 'Thumbnail' });
    if (result.error) return result.error;
    fields.thumbnail = result.value;
  }
  return null;
}

async function createCourse(req, res, next) {
  try {
    const fields = buildCourseFields(req.body);
    const linkError = validateCourseLinks(fields);
    if (linkError) return res.status(400).json({ error: linkError });
    if (!fields.title) return res.status(400).json({ error: 'title is required' });
    if (!fields.slug) return res.status(400).json({ error: 'slug is required' });

    // Check if course with slug already exists
    const existingCourse = await Course.findOne({ slug: fields.slug });
    if (existingCourse) {
      return res.status(400).json({ error: 'Course with this slug already exists' });
    }

    const course = new Course({
      hasDriveVideos: true, // Assuming manually added courses have drive videos
      ...fields,
    });

    await course.save();

    const notified = course.published !== false && req.body?.notifyStudents !== false
      ? await announceCourse(course)
      : 0;

    await activity.log(req, {
      category: 'course',
      action: 'course.created',
      summary: `Created course "${course.title}" (${course.published === false ? 'draft' : 'published'}${
        course.price > 0 ? `, ${rupees(course.price)}` : ', free'
      })${notified ? ` and notified ${notified} learners` : ''}`,
      entityType: 'course',
      entityId: course._id,
    });

    res.status(201).json(course);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/courses/:courseId/lessons
 * Dedicated admin curriculum & video management endpoint.
 * Returns all lessons with complete video metadata (Drive details, folder/module name, duration, order)
 * without student lock restrictions.
 */
async function getCourseLessons(req, res, next) {
  try {
    const { courseId } = req.params;
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const lessons = await Lesson.find({ courseId }).sort({ order: 1, createdAt: 1 });
    res.json(
      lessons.map((lesson) => ({
        _id: lesson._id,
        courseId: lesson.courseId,
        title: lesson.title,
        description: lesson.description || '',
        date: lesson.date || null,
        duration: lesson.duration || 0,
        order: lesson.order,
        folderId: lesson.folderId || '',
        folderName: lesson.folderName || 'General',
        mimeType: lesson.mimeType || 'video/mp4',
        driveFileName: lesson.driveFileName || '',
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
        streamUrl: `/api/videos/${lesson._id}/stream`,
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function addLesson(req, res, next) {
  try {
    const { courseId, title, description, date, driveLink, folderName, order: requestedOrder } = req.body;

    if (!courseId || !title || !driveLink) {
      return res.status(400).json({ error: 'courseId, title, and driveLink are required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Extract driveFileId from the link using the service
    let driveFileId = driveService.normaliseFolderId(driveLink);
    if (!driveFileId) {
      return res.status(400).json({ error: 'Invalid Google Drive link' });
    }

    // Fetch metadata from Google Drive
    let driveMetadata;
    try {
      driveMetadata = await driveService.getVideoMetadata(driveFileId);
      if (driveMetadata.shortcutTargetId) {
        driveFileId = driveMetadata.shortcutTargetId;
        driveMetadata = await driveService.getVideoMetadata(driveFileId);
      }
    } catch (err) {
      console.error('[admin] Failed to fetch drive metadata:', err.message);
      const errorMessage =
        err.status === 404
          ? 'Drive file was not found, or is not shared with the service account.'
          : err.status === 403
          ? 'Google refused access to this file. Check that the Drive API is enabled.'
          : err.message || 'Could not fetch Drive metadata. Ensure the file is shared with the service account.';
      return res.status(400).json({ error: errorMessage });
    }

    if (driveMetadata.mimeType === 'application/vnd.google-apps.folder') {
      return res.status(400).json({
        error:
          `That link is the Drive folder "${driveMetadata.name}", not a video. Open the folder, right-click ` +
          'the video → Share → Copy link, and paste that.',
      });
    }
    if (!String(driveMetadata.mimeType).startsWith('video/')) {
      return res.status(400).json({
        error: `"${driveMetadata.name}" is not a video file. Paste the link of a video file.`,
      });
    }

    const existingLesson = await Lesson.findOne({ courseId, driveFileId });
    if (existingLesson) {
      return res.status(400).json({
        error: `"${driveMetadata.name}" is already in this course as the lesson "${existingLesson.title}".`,
      });
    }

    if (!driveMetadata.canDownload) {
      return res.status(400).json({
        error:
          `"${driveMetadata.name}" has downloading turned off in Google Drive, so it cannot be streamed. ` +
          'In Drive, open the file → Share → Settings → tick "Viewers and commenters can see the option to download", then try again.',
      });
    }

    // Calculate order
    let order;
    if (requestedOrder && Number.isFinite(Number(requestedOrder)) && Number(requestedOrder) > 0) {
      order = Number(requestedOrder);
    } else {
      const lastLesson = await Lesson.findOne({ courseId }).sort('-order');
      order = lastLesson ? lastLesson.order + 1 : 1;
    }

    const effectiveFolder = String(folderName || driveMetadata.folderName || 'General').trim();

    const lesson = new Lesson({
      courseId,
      title: String(title).trim(),
      description: String(description || '').trim(),
      date,
      order,
      driveFileId,
      driveFileName: driveMetadata.name,
      driveWebViewLink: driveMetadata.webViewLink,
      mimeType: driveMetadata.mimeType,
      duration: driveMetadata.durationSeconds || 0,
      folderId: driveMetadata.folderId || '',
      folderName: effectiveFolder,
    });

    await lesson.save();

    // Update course lessons array
    if (!course.lessons.some((lId) => String(lId) === String(lesson._id))) {
      course.lessons.push(lesson._id);
      await course.save();
    }

    // Activity log
    await activity.log(req, {
      category: 'course',
      action: 'lesson.created',
      summary: `Added video lesson "${lesson.title}" (${effectiveFolder}) to "${course.title}"`,
      entityType: 'course',
      entityId: course._id,
      meta: { lessonId: lesson._id, duration: lesson.duration, module: effectiveFolder },
    });

    // Notify every learner who can currently open this course (grants + Full Access).
    await notifyUsers(
      await learnerIdsWithAccess(course._id),
      {
        type: 'new_lesson',
        title: 'New lesson added',
        message: `"${lesson.title}" was added to ${course.title}`,
        courseId: course._id,
      }
    );

    res.status(201).json(lesson);
  } catch (err) {
    next(err);
  }
}

async function deleteCourse(req, res, next) {
  try {
    const { id } = req.params;
    
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Delete associated lessons, study materials (and who they were shared with), reviews, and progress
    const courseLessons = await Lesson.find({ courseId: id }).select('_id');
    const lessonIds = courseLessons.map((l) => l._id);

    await Promise.all([
      Progress.deleteMany({ $or: [{ courseId: id }, { lessonId: { $in: lessonIds } }] }),
      Lesson.deleteMany({ courseId: id }),
      Resource.deleteMany({ courseId: id }),
      ResourceAccess.deleteMany({ courseId: id }),
      Review.deleteMany({ courseId: id }),
    ]);
    
    // Delete the course
    await Course.findByIdAndDelete(id);

    await activity.log(req, {
      category: 'course',
      action: 'course.deleted',
      summary: `Deleted course "${course.title}" and its lessons`,
      entityType: 'course',
      entityId: course._id,
    });
    
    res.json({ success: true, message: 'Course deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function deleteLesson(req, res, next) {
  try {
    const { id } = req.params;
    
    const lesson = await Lesson.findById(id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const courseId = lesson.courseId;
    const course = await Course.findById(courseId);

    // 1. Remove lesson ID from course.lessons array
    await Course.findByIdAndUpdate(courseId, {
      $pull: { lessons: id },
    });

    // 2. Clean up associated Progress rows for this lesson
    await Progress.deleteMany({ lessonId: id });

    // 3. Delete the lesson document
    await Lesson.findByIdAndDelete(id);

    // 4. Re-sequence the remaining lessons for this course so ordering stays sequential (1, 2, 3...)
    const remainingLessons = await Lesson.find({ courseId }).sort({ order: 1, createdAt: 1 });
    for (let i = 0; i < remainingLessons.length; i++) {
      if (remainingLessons[i].order !== i + 1) {
        remainingLessons[i].order = i + 1;
        await remainingLessons[i].save();
      }
    }

    // 5. Activity log
    await activity.log(req, {
      category: 'course',
      action: 'lesson.deleted',
      summary: `Deleted video lesson "${lesson.title}" from course "${course?.title || courseId}"`,
      entityType: 'course',
      entityId: courseId,
      meta: { lessonId: id, lessonTitle: lesson.title },
    });
    
    res.json({ success: true, message: 'Lesson deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/courses/:id
 *
 * Accepts any subset of the course content fields, so the dashboard can save
 * one panel at a time. Pass `notifyStudents: true` to tell everyone who
 * currently has access that the course content changed.
 */
async function updateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const fields = buildCourseFields(req.body);
    const linkError = validateCourseLinks(fields);
    if (linkError) return res.status(400).json({ error: linkError });

    if (fields.slug) {
      const clash = await Course.findOne({ slug: fields.slug, _id: { $ne: id } });
      if (clash) return res.status(400).json({ error: 'Another course already uses this slug' });
    }

    const before = await Course.findById(id).select('title price originalPrice published');
    if (!before) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = await Course.findByIdAndUpdate(id, fields, { new: true, runValidators: true });

    await logCourseChanges(req, before, course);

    // Going from draft to published is when learners hear about a course.
    if (before.published === false && course.published !== false) {
      await announceCourse(course);
    }

    if (req.body?.notifyStudents) {
      await notifyUsers(
        await learnerIdsWithAccess(course._id),
        {
          type: 'course_update',
          title: 'Course updated',
          message: `"${course.title}" has been updated with new content.`,
          courseId: course._id,
          link: `/my-courses/${course._id}`,
        }
      );
    }

    res.json(course);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/lessons/:id
 * Complete video management: edit title, description, date, module/folder, order,
 * and replace the video file/stream via a new Google Drive link.
 */
async function updateLesson(req, res, next) {
  try {
    const { id } = req.params;
    const { title, description, date, folderName, order, driveLink } = req.body;
    
    const lesson = await Lesson.findById(id);
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const course = await Course.findById(lesson.courseId);
    let videoReplaced = false;

    // Handle replacing the video via a new Google Drive link
    if (driveLink && String(driveLink).trim()) {
      let newDriveFileId = driveService.normaliseFolderId(String(driveLink).trim());
      if (!newDriveFileId) {
        return res.status(400).json({ error: 'Invalid Google Drive link provided for video replacement.' });
      }

      // Check if another lesson in the same course already uses this file
      const clash = await Lesson.findOne({
        courseId: lesson.courseId,
        driveFileId: newDriveFileId,
        _id: { $ne: id },
      });
      if (clash) {
        return res.status(400).json({
          error: `That Drive video is already used in this course by lesson "${clash.title}".`,
        });
      }

      // Fetch metadata from Google Drive
      let driveMetadata;
      try {
        driveMetadata = await driveService.getVideoMetadata(newDriveFileId);
        if (driveMetadata.shortcutTargetId) {
          newDriveFileId = driveMetadata.shortcutTargetId;
          driveMetadata = await driveService.getVideoMetadata(newDriveFileId);
        }
      } catch (err) {
        console.error('[admin] Failed to fetch replacement drive metadata:', err.message);
        const errorMessage =
          err.status === 404
            ? 'Drive file was not found, or is not shared with the service account.'
            : err.status === 403
            ? 'Google refused access to this file. Check that the Drive API is enabled.'
            : err.message || 'Could not fetch Drive metadata. Ensure the file is shared with the service account.';
        return res.status(400).json({ error: errorMessage });
      }

      if (driveMetadata.mimeType === 'application/vnd.google-apps.folder') {
        return res.status(400).json({
          error: `That link is a Drive folder ("${driveMetadata.name}"), not a video file.`,
        });
      }
      if (!String(driveMetadata.mimeType).startsWith('video/')) {
        return res.status(400).json({
          error: `"${driveMetadata.name}" is not a video file. Please paste a link to a video file.`,
        });
      }
      if (!driveMetadata.canDownload) {
        return res.status(400).json({
          error: `"${driveMetadata.name}" has downloading turned off in Google Drive. Please enable downloading permissions.`,
        });
      }

      lesson.driveFileId = newDriveFileId;
      lesson.driveFileName = driveMetadata.name;
      lesson.driveWebViewLink = driveMetadata.webViewLink;
      lesson.mimeType = driveMetadata.mimeType;
      lesson.duration = driveMetadata.durationSeconds || lesson.duration;
      if (driveMetadata.folderId) lesson.folderId = driveMetadata.folderId;
      if (driveMetadata.folderName && (!folderName || folderName === 'General')) {
        lesson.folderName = driveMetadata.folderName;
      }
      videoReplaced = true;
    }

    if (title !== undefined) lesson.title = String(title).trim();
    if (description !== undefined) lesson.description = String(description).trim();
    if (date !== undefined) lesson.date = date;
    if (folderName !== undefined) lesson.folderName = String(folderName).trim() || 'General';
    if (order !== undefined && Number.isFinite(Number(order)) && Number(order) > 0) {
      lesson.order = Number(order);
    }

    await lesson.save();

    await activity.log(req, {
      category: 'course',
      action: videoReplaced ? 'lesson.video_replaced' : 'lesson.updated',
      summary: videoReplaced
        ? `Replaced video file for lesson "${lesson.title}" in course "${course?.title || lesson.courseId}"`
        : `Updated video lesson details for "${lesson.title}" in course "${course?.title || lesson.courseId}"`,
      entityType: 'course',
      entityId: lesson.courseId,
      meta: {
        lessonId: lesson._id,
        videoReplaced,
        newDuration: lesson.duration,
        module: lesson.folderName,
      },
    });

    res.json(lesson);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/admin/courses/:courseId/lessons/reorder
 * Reorder videos/lessons within a course and persist order to the database.
 */
async function reorderLessons(req, res, next) {
  try {
    const { courseId } = req.params;
    const { lessonIds, lessonOrders } = req.body || {};

    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    let itemsToUpdate = [];
    if (Array.isArray(lessonIds) && lessonIds.length > 0) {
      itemsToUpdate = lessonIds.map((id, index) => ({ id: String(id), order: index + 1 }));
    } else if (Array.isArray(lessonOrders) && lessonOrders.length > 0) {
      itemsToUpdate = lessonOrders.map((item) => ({ id: String(item.id || item._id), order: Number(item.order) }));
    } else {
      return res.status(400).json({ error: 'lessonIds or lessonOrders array is required' });
    }

    // Verify all lesson IDs belong to this course
    const existingLessons = await Lesson.find({ courseId }).select('_id');
    const existingIdSet = new Set(existingLessons.map((l) => String(l._id)));

    for (const item of itemsToUpdate) {
      if (!existingIdSet.has(item.id)) {
        return res.status(400).json({ error: `Lesson ${item.id} does not belong to this course.` });
      }
    }

    // Bulk update lesson orders
    const bulkOps = itemsToUpdate.map((item) => ({
      updateOne: {
        filter: { _id: item.id, courseId },
        update: { $set: { order: item.order } },
      },
    }));

    if (bulkOps.length > 0) {
      await Lesson.bulkWrite(bulkOps);
    }

    // Keep course.lessons array in the updated order
    const sortedLessons = await Lesson.find({ courseId }).sort({ order: 1, createdAt: 1 });
    course.lessons = sortedLessons.map((l) => l._id);
    await course.save();

    await activity.log(req, {
      category: 'course',
      action: 'course.lessons_reordered',
      summary: `Reordered ${sortedLessons.length} lessons in course "${course.title}"`,
      entityType: 'course',
      entityId: course._id,
    });

    res.json({ success: true, lessons: sortedLessons });
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/courses/stats — enrolled-student count per course, for the admin overview chart. */
async function getCourseStats(req, res, next) {
  try {
    const [courses, counts, lessonCounts] = await Promise.all([
      Course.find().select('title slug').sort({ createdAt: 1 }),
      CourseAccess.aggregate([
        { $match: { active: true } },
        { $group: { _id: '$courseId', count: { $sum: 1 } } },
      ]),
      Lesson.aggregate([{ $group: { _id: '$courseId', count: { $sum: 1 } } }]),
    ]);

    const enrolledByCourse = new Map(counts.map((r) => [String(r._id), r.count]));
    const lessonsByCourse = new Map(lessonCounts.map((r) => [String(r._id), r.count]));

    res.json(
      courses.map((course) => ({
        courseId: course._id,
        title: course.title,
        enrolledCount: enrolledByCourse.get(String(course._id)) || 0,
        lessonCount: lessonsByCourse.get(String(course._id)) || 0,
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/students */
async function listStudents(req, res, next) {
  try {
    // $ne (not $eq 'student') also matches accounts created before the role
    // field existed, which never got it persisted to their stored document.
    const students = await User.find({ role: { $ne: 'admin' }, status: { $ne: 'deleted' } }).sort({ createdAt: -1 });
    const grantCounts = await CourseAccess.aggregate([
      { $match: { active: true } },
      { $group: { _id: '$studentId', count: { $sum: 1 } } },
    ]);
    const countByStudent = new Map(grantCounts.map((r) => [String(r._id), r.count]));

    res.json(
      students.map((student) => ({
        ...student.toJSON(),
        accessCount: countByStudent.get(String(student._id)) || 0,
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** GET /api/admin/students/:studentId/access */
async function getStudentAccess(req, res, next) {
  try {
    const { studentId } = req.params;

    const student = await User.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const [courses, grants] = await Promise.all([
      Course.find().sort({ createdAt: 1 }),
      CourseAccess.find({ studentId, active: true }).select('courseId'),
    ]);
    const grantedCourseIds = new Set(grants.map((g) => String(g.courseId)));

    res.json(
      courses.map((course) => ({
        courseId: course._id,
        title: course.title,
        slug: course.slug,
        granted: grantedCourseIds.has(String(course._id)),
      }))
    );
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/access  body: { studentId, courseId } */
async function grantAccess(req, res, next) {
  try {
    const { studentId, courseId } = req.body || {};
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'studentId and courseId are required' });
    }

    const [student, course] = await Promise.all([User.findById(studentId), Course.findById(courseId)]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const { grant, alreadyActive } = await grantCourseAccess(student._id, course, { by: req.user._id, source: 'manual' });

    if (!alreadyActive) {
      await activity.log(req, {
        category: 'enrolment',
        action: 'enrolment.manual',
        summary: `Granted ${student.name} access to "${course.title}"`,
        entityType: 'user',
        entityId: student._id,
        meta: { courseId: String(course._id) },
      });
    }

    res.json(grant);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/access  body: { studentId, courseId } */
async function revokeAccess(req, res, next) {
  try {
    const { studentId, courseId } = req.body || {};
    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'studentId and courseId are required' });
    }

    const [course, student] = await Promise.all([Course.findById(courseId), User.findById(studentId)]);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const grant = await revokeCourseAccess(studentId, course);
    if (!grant) return res.status(404).json({ error: 'No access grant found for this student/course' });

    await activity.log(req, {
      category: 'enrolment',
      action: 'enrolment.revoked',
      summary: `Revoked ${student?.name || 'a learner'}'s access to "${course.title}"`,
      entityType: 'user',
      entityId: studentId,
      meta: { courseId: String(course._id) },
    });

    res.json(grant);
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/access/bulk  body: { studentIds: [], courseId } */
async function bulkGrantAccess(req, res, next) {
  try {
    const { studentIds, courseId } = req.body || {};
    if (!Array.isArray(studentIds) || !studentIds.length || !courseId) {
      return res.status(400).json({ error: 'studentIds (non-empty array) and courseId are required' });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    let granted = 0;
    for (const studentId of studentIds) {
      const { alreadyActive } = await grantCourseAccess(studentId, course, {
        by: req.user._id,
        source: 'bulk',
        notifyStaff: false,
      });
      if (!alreadyActive) granted += 1;
    }

    await activity.log(req, {
      category: 'enrolment',
      action: 'enrolment.bulk',
      summary: `Bulk-enrolled ${granted} learner${granted === 1 ? '' : 's'} in "${course.title}"`,
      entityType: 'course',
      entityId: course._id,
    });

    res.json({ success: true, granted });
  } catch (err) {
    next(err);
  }
}

// What the admin composer is allowed to send. Everything else in the
// Notification enum is raised by the system itself (revoked access, new
// lessons, milestones) and is not sendable by hand.
const SENDABLE_TYPES = new Set([
  'announcement',
  'course_update',
  'task',
  'event',
  'certificate',
  'payment',
  'new_course',
  'access_granted',
]);

const DEFAULT_TITLES = {
  announcement: 'Announcement',
  course_update: 'Course update',
  task: 'Task assigned',
  event: 'Upcoming event',
  certificate: 'Certificate update',
  payment: 'Payment pending',
  new_course: 'New course available',
  access_granted: 'Course access granted',
};

/** Where a notification lands when the admin leaves the link empty. */
function defaultLink(type, courseId) {
  // My Courses is where PendingEnrollments shows what is still unpaid.
  if (type === 'payment') return '/my-courses';
  if (type === 'new_course') return `/courses/${courseId}`;
  if (type === 'access_granted') return `/my-courses/${courseId}`;
  return '';
}

/**
 * Who a composer notification reaches when no single student is picked.
 *
 *   payment    — students with a pending enrolment (for the course, if set)
 *   new_course — every student who does not already have that course
 *   otherwise  — students with access to the course, or every student
 */
async function resolveAudience(type, courseId) {
  if (type === 'payment') {
    return Enrollment.distinct('studentId', { status: 'pending', ...(courseId ? { courseId } : {}) });
  }

  if (courseId && type !== 'new_course') return learnerIdsWithAccess(courseId);

  if (type === 'new_course') {
    // Full Access learners already have every course.
    return activeLearnerIds({ _id: { $nin: await liveLearnerIds(courseId) }, fullAccess: { $ne: true } });
  }
  return activeLearnerIds();
}

/** Learners whose access to a course is on and not expired. */
async function liveLearnerIds(courseId) {
  const grants = await CourseAccess.find({ courseId, active: true }).select('studentId active expiresAt');
  return grants.filter(isGrantLive).map((g) => g.studentId);
}

/** Tells every learner a course is now available. Returns how many were told. */
async function announceCourse(course) {
  // Full Access learners already have it, so "new course" is news only to the rest.
  const recipients = await activeLearnerIds({
    _id: { $nin: await liveLearnerIds(course._id) },
    fullAccess: { $ne: true },
  });
  await notifyUsers(
    recipients,
    {
      type: 'new_course',
      title: 'New course available',
      message: `"${course.title}" is now available${course.price > 0 ? ` (${rupees(course.price)})` : ' — free'}. Take a look and enrol.`,
      courseId: course._id,
      link: `/courses/${course._id}`,
    },
    { setting: 'learner.newCourse' }
  );
  return recipients.length;
}

/** Writes the pricing / publishing entries the activity log tracks. */
async function logCourseChanges(req, before, after) {
  if (before.price !== after.price || before.originalPrice !== after.originalPrice) {
    await activity.log(req, {
      category: 'pricing',
      action: 'course.price_changed',
      summary: `Changed the price of "${after.title}" from ${rupees(before.price)} to ${rupees(after.price)}${
        before.originalPrice !== after.originalPrice ? ` (list price ${rupees(before.originalPrice)} → ${rupees(after.originalPrice)})` : ''
      }`,
      entityType: 'course',
      entityId: after._id,
      meta: { from: before.price, to: after.price },
    });
  }
  if ((before.published !== false) !== (after.published !== false)) {
    await activity.log(req, {
      category: 'publishing',
      action: after.published !== false ? 'course.published' : 'course.unpublished',
      summary: `${after.published !== false ? 'Published' : 'Unpublished'} "${after.title}"`,
      entityType: 'course',
      entityId: after._id,
    });
  }
}

/**
 * POST /api/admin/notifications
 * body: { studentId?, courseId?, message, type?, title?, link? }
 *
 * Targets one student, or the audience resolveAudience picks for the type.
 * `new_course` needs a courseId; `access_granted` needs both ids and grants
 * the access as well, so the notification is never ahead of reality.
 */
async function broadcastNotification(req, res, next) {
  try {
    const { studentId, courseId, message, type, title, link } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message is required' });

    const resolvedType = SENDABLE_TYPES.has(type) ? type : 'announcement';

    // Granting access is a Super Admin action, even from the composer.
    if (resolvedType === 'access_granted' && req.user.staffRole() !== 'super_admin') {
      return res.status(403).json({ error: 'Only a Super Admin can grant course access' });
    }

    if (resolvedType === 'new_course' && !courseId) {
      return res.status(400).json({ error: 'Pick the course that was added' });
    }
    if (resolvedType === 'access_granted' && (!studentId || !courseId)) {
      return res.status(400).json({ error: 'Pick the student and the course to grant access to' });
    }

    const payload = {
      type: resolvedType,
      title: String(title || '').trim() || DEFAULT_TITLES[resolvedType],
      message: String(message).trim(),
      courseId,
      // An in-app path only — an absolute URL here would turn every
      // notification into an open redirect off the dashboard.
      link: typeof link === 'string' && link.startsWith('/') ? link : defaultLink(resolvedType, courseId),
    };

    if (resolvedType === 'access_granted') {
      const [student, course] = await Promise.all([User.findById(studentId), Course.findById(courseId)]);
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (!course) return res.status(404).json({ error: 'Course not found' });

      // The grant carries the composed text as its own notification.
      const { alreadyActive } = await grantCourseAccess(student._id, course, {
        by: req.user._id,
        source: 'manual',
        learnerNotice: { title: payload.title, message: payload.message },
      });
      if (!alreadyActive) {
        await activity.log(req, {
          category: 'enrolment',
          action: 'enrolment.manual',
          summary: `Granted ${student.name} access to "${course.title}" from the notification composer`,
          entityType: 'user',
          entityId: student._id,
        });
        return res.json({ success: true, targeted: 1 });
      }
    }

    if (studentId) {
      await notifyUser(studentId, payload);
      return res.json({ success: true, targeted: 1 });
    }

    const ids = await resolveAudience(resolvedType, courseId);
    await notifyUsers(ids, payload);
    res.json({ success: true, targeted: ids.length });
  } catch (err) {
    next(err);
  }
}

const RESOURCE_TYPES = ['pdf', 'doc', 'slides', 'link'];

/**
 * Validates a study-material body. With `partial`, only the fields present
 * are checked (an edit). Returns { fields } or { error }.
 */
function buildResourceFields(body = {}, { partial = false } = {}) {
  const fields = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (!title) return { error: 'Give the material a title.' };
    if (title.length > 160) return { error: 'Keep the title under 160 characters.' };
    fields.title = title;
  }
  if (body.description !== undefined) fields.description = String(body.description).trim().slice(0, 1000);
  if (!partial || body.url !== undefined) {
    const link = checkUrl(body.url, { allowEmpty: false, label: 'The material link' });
    if (link.error) return { error: link.error };
    fields.url = normaliseDriveLink(link.value);
  }
  if (!partial || body.type !== undefined) {
    const type = body.type || 'pdf';
    if (!RESOURCE_TYPES.includes(type)) return { error: 'Type must be PDF, Document, Slides or Link.' };
    fields.type = type;
  }
  return { fields };
}

/** POST /api/admin/resources  body: { courseId, title, description, url, type } */
async function addResource(req, res, next) {
  try {
    const { courseId } = req.body || {};
    if (!courseId || !mongoose.isValidObjectId(courseId)) return res.status(400).json({ error: 'Choose a course.' });

    const { fields, error } = buildResourceFields(req.body);
    if (error) return res.status(400).json({ error });

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const resource = await Resource.create({ courseId, ...fields });

    // Learners who can open the course see the new material straight away.
    await notifyUsers(await learnerIdsWithAccess(course._id), {
      type: 'course_update',
      title: 'New study material',
      message: `"${resource.title}" was added to ${course.title}.`,
      courseId: course._id,
      link: '/resources',
    });

    await activity.log(req, {
      category: 'course',
      action: 'resource.created',
      summary: `Added study material "${resource.title}" to "${course.title}"`,
      entityType: 'course',
      entityId: course._id,
    });

    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/resources/:id */
async function updateResource(req, res, next) {
  try {
    const { fields, error } = buildResourceFields(req.body, { partial: true });
    if (error) return res.status(400).json({ error });

    const resource = await Resource.findByIdAndUpdate(req.params.id, fields, { new: true, runValidators: true });
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    res.json(resource);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/resources/:id — also withdraws it from anyone it was shared with. */
async function deleteResource(req, res, next) {
  try {
    const resource = await Resource.findByIdAndDelete(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });
    await ResourceAccess.deleteMany({ resourceId: resource._id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createCourse,
  addLesson,
  getCourseLessons,
  reorderLessons,
  deleteCourse,
  deleteLesson,
  updateCourse,
  updateLesson,
  getCourseStats,
  listStudents,
  getStudentAccess,
  grantAccess,
  revokeAccess,
  bulkGrantAccess,
  broadcastNotification,
  addResource,
  updateResource,
  deleteResource,
};
