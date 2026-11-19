const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const Submission = require('../models/Submission');
const User = require('../models/User');
const activity = require('../services/activityService');
const { grantedCourseIds, learnerIdsWithAccess } = require('../services/enrolmentService');
const { notifyUsers, activeLearnerIds } = require('../services/notificationService');
const { emailNewTask, describeDelivery, formatDue } = require('../services/taskEmailService');

/**
 * Assignments: student-specific tasks with a due date.
 * Tasks are assigned to specific individual learners (assignedStudentIds).
 * Publishing one notifies ONLY the assigned learners in the app and by email.
 */

function buildFields(body = {}) {
  const fields = {};
  if (body.title !== undefined) fields.title = String(body.title).trim().slice(0, 160);
  if (body.description !== undefined) fields.description = String(body.description).trim().slice(0, 4000);
  if (body.domain !== undefined) fields.domain = String(body.domain).trim();
  if (body.category !== undefined) fields.category = String(body.category).trim();
  if (body.courseId !== undefined) fields.courseId = body.courseId || null;
  if (body.published !== undefined) fields.published = Boolean(body.published);

  if (body.assignedStudentIds !== undefined) {
    let ids = [];
    if (Array.isArray(body.assignedStudentIds)) {
      ids = body.assignedStudentIds;
    } else if (typeof body.assignedStudentIds === 'string' && body.assignedStudentIds.trim()) {
      ids = [body.assignedStudentIds.trim()];
    }
    // Filter and sanitize into valid mongoose ObjectIds
    fields.assignedStudentIds = ids
      .map((id) => (typeof id === 'object' && id?._id ? id._id : id))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
  }

  if (body.maxScore !== undefined && body.maxScore !== '') {
    const max = Number(body.maxScore);
    if (Number.isFinite(max) && max >= 1 && max <= 1000) fields.maxScore = Math.round(max);
  }
  if (body.dueDate !== undefined) {
    if (!body.dueDate) fields.dueDate = null;
    else {
      const date = new Date(body.dueDate);
      if (!Number.isNaN(date.getTime())) fields.dueDate = date;
    }
  }

  // Full structured instructions and deliverables
  if (body.objective !== undefined) fields.objective = String(body.objective).trim();
  if (body.detailedInstructions !== undefined) fields.detailedInstructions = String(body.detailedInstructions).trim();

  if (body.deliverables !== undefined) {
    let delivs = [];
    if (Array.isArray(body.deliverables)) {
      delivs = body.deliverables;
    } else if (typeof body.deliverables === 'string') {
      try {
        delivs = JSON.parse(body.deliverables);
      } catch {
        delivs = [];
      }
    }
    fields.deliverables = delivs
      .filter((d) => d && (d.label || d.name))
      .map((d) => ({
        label: String(d.label || d.name).trim(),
        required: d.required !== false && d.required !== 'false',
        description: String(d.description || '').trim(),
      }));
  }

  if (body.resources !== undefined) {
    let resList = [];
    if (Array.isArray(body.resources)) {
      resList = body.resources;
    } else if (typeof body.resources === 'string') {
      try {
        resList = JSON.parse(body.resources);
      } catch {
        resList = [];
      }
    }
    fields.resources = resList
      .filter((r) => r && (r.title || r.name) && r.url)
      .map((r) => ({
        title: String(r.title || r.name).trim(),
        url: String(r.url).trim(),
        type: String(r.type || 'link').trim(),
      }));
  }

  if (body.submissionGuidelines !== undefined) {
    fields.submissionGuidelines = String(body.submissionGuidelines).trim();
  }

  if (body.allowedFileTypes !== undefined) {
    if (Array.isArray(body.allowedFileTypes)) {
      fields.allowedFileTypes = body.allowedFileTypes.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof body.allowedFileTypes === 'string') {
      fields.allowedFileTypes = body.allowedFileTypes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }

  if (body.maxFileSize !== undefined) {
    fields.maxFileSize = String(body.maxFileSize).trim();
  }
  return fields;
}

// In Indian time, not the server's (UTC on Render): "14 Nov 2026, 6:00 pm IST".
const dueText = formatDue;

/**
 * Tells a newly published task's assigned learners about it, through both channels.
 * Returns { notified, email } — how many in-app notifications were created,
 * and the email delivery summary.
 */
async function announce(assignment) {
  // Notify specifically assigned learners ONLY
  let recipients = [];
  if (Array.isArray(assignment.assignedStudentIds) && assignment.assignedStudentIds.length > 0) {
    recipients = assignment.assignedStudentIds.map((id) => (typeof id === 'object' && id._id ? id._id : id));
  }

  // If no students are specifically assigned, do not notify anyone
  if (recipients.length === 0) {
    return { notified: 0, email: { status: 'no_recipients' } };
  }

  const course = assignment.courseId ? await Course.findById(assignment.courseId).select('title') : null;

  // In-app: stored, pushed to anyone online, and there at their next sign-in.
  const inApp = await notifyUsers(
    recipients,
    {
      type: 'task',
      title: 'New task assigned',
      message:
        `"${assignment.title}"${assignment.domain ? ` [${assignment.domain}]` : ''}${course ? ` for ${course.title}` : ''}` +
        (assignment.dueDate ? ` — due ${dueText(assignment.dueDate)}.` : '.'),
      courseId: assignment.courseId || undefined,
      link: '/tasks',
    },
    // The dedicated task email below replaces the generic email copy.
    { setting: 'learner.newTask', emailCopy: false }
  );

  // Email: its own channel, so it reaches learners who are signed out.
  const email = await emailNewTask(assignment, { course, recipientIds: recipients });

  return { notified: inApp.length, email };
}

/** "and notified 12 learners in the app, emailed 12 learners" for the activity log. */
function announcementSummary({ notified, email }) {
  const parts = [`notified ${notified} learner${notified === 1 ? '' : 's'} in the app`];
  const delivery = describeDelivery(email);
  if (delivery) parts.push(delivery);
  return parts.join(', ');
}

/* -------------------------------------------------------------- learner */

/**
 * GET /api/assignments — student-specific task list.
 * STRICT: Returns ONLY tasks specifically assigned to the currently authenticated student.
 * Tasks assigned to other students or unassigned tasks are NEVER returned.
 * Legacy submissions made by this student are safely preserved.
 */
async function listForLearner(req, res, next) {
  try {
    const studentId = req.user._id;

    // Check for any legacy submissions this student already made (preserve historical access)
    const priorSubmissions = await Submission.find({
      studentId,
      assignmentId: { $ne: null },
    }).select('assignmentId');
    const submittedAssignmentIds = priorSubmissions
      .map((s) => s.assignmentId)
      .filter((id) => Boolean(id) && mongoose.Types.ObjectId.isValid(id));

    // Filter strictly to tasks assigned to this student (or historical tasks they submitted to)
    const filter = {
      published: true,
      $or: [
        { assignedStudentIds: studentId },
        ...(submittedAssignmentIds.length > 0 ? [{ _id: { $in: submittedAssignmentIds } }] : []),
      ],
    };

    // Respect course suspensions
    const suspendedAccesses = await CourseAccess.find({ studentId, suspended: true }).select('courseId');
    const suspendedCourseIds = suspendedAccesses.map((a) => a.courseId).filter(Boolean);
    if (suspendedCourseIds.length > 0) {
      filter.courseId = { $nin: suspendedCourseIds };
    }

    const assignments = await Assignment.find(filter)
      .populate('courseId', 'title')
      .sort({ dueDate: 1, createdAt: -1 });

    const mine = await Submission.find({
      studentId,
      assignmentId: { $in: assignments.map((a) => a._id) },
    }).select('assignmentId status score createdAt feedback');

    const latest = new Map();
    for (const s of mine) {
      const key = String(s.assignmentId);
      if (!latest.has(key) || s.createdAt > latest.get(key).createdAt) latest.set(key, s);
    }

    res.json(
      assignments.map((a) => {
        const submission = latest.get(String(a._id));
        return {
          ...a.toJSON(),
          mySubmission: submission
            ? {
                status: submission.status,
                score: submission.score,
                feedback: submission.feedback,
                createdAt: submission.createdAt,
              }
            : null,
        };
      })
    );
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/assignments/:id — fetch single assigned task details.
 * SECURITY: Verifies that the authenticated student is an authorized recipient.
 */
async function getAssignment(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid task ID' });
    }

    const assignment = await Assignment.findOne({ _id: req.params.id, published: true }).populate('courseId', 'title');
    if (!assignment) return res.status(404).json({ error: 'Task not found or not published' });

    // Authorization check
    const isAssigned =
      Array.isArray(assignment.assignedStudentIds) &&
      assignment.assignedStudentIds.some((id) => id.toString() === req.user._id.toString());

    const hadPrior = !isAssigned && (await Submission.exists({ studentId: req.user._id, assignmentId: assignment._id }));

    if (!isAssigned && !hadPrior) {
      return res.status(403).json({ error: 'You are not authorized to view this task' });
    }

    const submission = await Submission.findOne({ studentId: req.user._id, assignmentId: assignment._id })
      .sort({ createdAt: -1 })
      .select('status score feedback createdAt');

    res.json({
      ...assignment.toJSON(),
      mySubmission: submission
        ? {
            status: submission.status,
            score: submission.score,
            feedback: submission.feedback,
            createdAt: submission.createdAt,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------- admin */

/** GET /api/admin/assignments */
async function listAll(_req, res, next) {
  try {
    const [assignments, counts] = await Promise.all([
      Assignment.find()
        .populate('courseId', 'title')
        .populate('assignedStudentIds', 'name email role phone')
        .sort({ createdAt: -1 })
        .limit(300),
      Submission.aggregate([
        { $match: { assignmentId: { $ne: null } } },
        {
          $group: {
            _id: '$assignmentId',
            total: { $sum: 1 },
            awaiting: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'under_review']] }, 1, 0] } },
          },
        },
      ]),
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c]));

    res.json(
      assignments.map((a) => {
        const assignedStudents = (a.assignedStudentIds || []).map((s) => ({
          id: s._id || s.id,
          name: s.name,
          email: s.email,
        }));
        return {
          ...a.toJSON(),
          assignedStudents,
          submissionCount: countBy.get(String(a._id))?.total || 0,
          awaitingReview: countBy.get(String(a._id))?.awaiting || 0,
          audienceCount: assignedStudents.length,
        };
      })
    );
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/assignments  body: { title, description, domain?, category?, courseId?, assignedStudentIds, dueDate?, maxScore?, published? } */
async function create(req, res, next) {
  try {
    const fields = buildFields(req.body);
    if (!fields.title) return res.status(400).json({ error: 'Give the task a title' });

    fields.assignedStudentIds = fields.assignedStudentIds || [];

    const assignment = await Assignment.create({ published: true, ...fields, createdBy: req.user._id });
    const announced = assignment.published ? await announce(assignment) : null;

    await activity.log(req, {
      category: 'task',
      action: 'task.created',
      summary: `Created task "${assignment.title}" for ${assignment.assignedStudentIds.length} student(s)${
        assignment.dueDate ? ` due ${dueText(assignment.dueDate)}` : ''
      }${announced ? ` and ${announcementSummary(announced)}` : ' as a draft'}`,
      entityType: 'assignment',
      entityId: assignment._id,
      ...(announced ? { meta: { email: announced.email } } : {}),
    });

    res.status(201).json({ ...assignment.toJSON(), notified: announced?.notified || 0, email: announced?.email || null });
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/assignments/:id — publishing a draft announces it. */
async function update(req, res, next) {
  try {
    const before = await Assignment.findById(req.params.id);
    if (!before) return res.status(404).json({ error: 'Task not found' });

    const fields = buildFields(req.body);

    const assignment = await Assignment.findByIdAndUpdate(req.params.id, fields, {
      new: true,
      runValidators: true,
    }).populate('assignedStudentIds', 'name email role');

    const announced = !before.published && assignment.published ? await announce(assignment) : null;

    await activity.log(req, {
      category: 'task',
      action: 'task.updated',
      summary: `Updated task "${assignment.title}"${announced ? ` and published it: ${announcementSummary(announced)}` : ''}`,
      entityType: 'assignment',
      entityId: assignment._id,
      ...(announced ? { meta: { email: announced.email } } : {}),
    });

    res.json({ ...assignment.toJSON(), notified: announced?.notified || 0, email: announced?.email || null });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/assignments/:id — submissions keep their content, lose the link. */
async function remove(req, res, next) {
  try {
    const assignment = await Assignment.findByIdAndDelete(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Task not found' });
    await Submission.updateMany({ assignmentId: assignment._id }, { $unset: { assignmentId: 1 } });

    await activity.log(req, {
      category: 'task',
      action: 'task.deleted',
      summary: `Deleted task "${assignment.title}"`,
      entityType: 'assignment',
      entityId: assignment._id,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listForLearner, getAssignment, listAll, create, update, remove };
