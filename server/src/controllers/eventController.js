const Event = require('../models/Event');
const { sanitizeHtml } = require('../utils/sanitizeHtml');
const { notifyUsers, activeLearnerIds } = require('../services/notificationService');
const activity = require('../services/activityService');
const { learnerIdsWithAccess } = require('../services/enrolmentService');

/** Fields the admin dashboard may set on an event. */
function buildFields(body = {}) {
  const fields = {};

  for (const key of ['title', 'summary', 'location', 'joinUrl', 'host', 'thumbnailUrl']) {
    if (body[key] !== undefined) fields[key] = String(body[key]).trim();
  }

  if (body.type !== undefined) fields.type = String(body.type);
  if (body.published !== undefined) fields.published = Boolean(body.published);

  if (body.mode !== undefined) {
    const cleanMode = String(body.mode).toLowerCase().trim();
    if (['online', 'offline', 'hybrid'].includes(cleanMode)) {
      fields.mode = cleanMode;
    }
  } else if (body.location !== undefined) {
    const loc = String(body.location).toLowerCase();
    if (loc.includes('hybrid')) fields.mode = 'hybrid';
    else if (loc.includes('offline') || loc.includes('campus') || loc.includes('hall') || loc.includes('office') || loc.includes('room')) {
      fields.mode = 'offline';
    } else {
      fields.mode = 'online';
    }
  }

  if (body.descriptionHtml !== undefined) {
    fields.descriptionHtml = sanitizeHtml(String(body.descriptionHtml));
  }

  for (const key of ['startsAt', 'endsAt']) {
    if (body[key] === undefined) continue;
    if (!body[key]) {
      fields[key] = null;
      continue;
    }
    const date = new Date(body[key]);
    if (!Number.isNaN(date.getTime())) fields[key] = date;
  }

  // Empty string means "not tied to a course"; undefined means "leave alone".
  if (body.courseId !== undefined) fields.courseId = body.courseId || null;

  return fields;
}

/**
 * The joining link is withheld until the event is near, so a link posted
 * weeks ahead cannot circulate before it is meant to.
 */
const JOIN_WINDOW_MS = 24 * 60 * 60 * 1000;

function forStudent(event) {
  const json = event.toJSON ? event.toJSON() : { ...event };
  const startsAt = new Date(json.startsAt).getTime();
  const withinWindow = startsAt - Date.now() <= JOIN_WINDOW_MS;

  if (!withinWindow) {
    delete json.joinUrl;
    json.joinUrlAvailableAt = new Date(startsAt - JOIN_WINDOW_MS);
  }

  if (!json.mode) {
    const loc = String(json.location || '').toLowerCase();
    if (loc.includes('hybrid')) json.mode = 'hybrid';
    else if (loc.includes('offline') || loc.includes('campus') || loc.includes('hall') || loc.includes('office')) {
      json.mode = 'offline';
    } else {
      json.mode = 'online';
    }
  }

  return json;
}

/** Sends student notification when an event is published or announced */
async function sendEventNotification(event) {
  try {
    const recipients = event.courseId ? await learnerIdsWithAccess(event.courseId) : await activeLearnerIds();
    if (!recipients || !recipients.length) return;

    const starts = new Date(event.startsAt);
    const dateStr = starts.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const startTimeStr = starts.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    const endTimeStr = event.endsAt
      ? new Date(event.endsAt).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      : '';
    const timeSpan = endTimeStr ? `${startTimeStr} – ${endTimeStr}` : startTimeStr;
    const modeLabel = event.mode ? `[${event.mode.toUpperCase()}]` : '';
    const locInfo = event.location ? ` · ${event.location}` : '';

    await notifyUsers(
      recipients,
      {
        type: 'event',
        title: `New Event: ${event.title}`,
        message: `${modeLabel} ${dateStr} at ${timeSpan}${locInfo}. ${event.summary || 'Click to view event details.'}`,
        courseId: event.courseId || undefined,
        link: `/events?id=${event._id}`,
      },
      { setting: 'learner.newEvent' }
    );
  } catch (err) {
    console.error('[EventNotification] Error notifying learners:', err.message);
  }
}

/**
 * GET /api/events?scope=upcoming|ongoing|past|all
 * Public: the events list is part of the marketing surface.
 */
async function listEvents(req, res, next) {
  try {
    const scope = req.query.scope || 'upcoming';
    const now = new Date();

    const filter = { published: true };
    let sort = { startsAt: 1 };

    if (scope === 'upcoming') {
      filter.$or = [{ startsAt: { $gte: now } }, { endsAt: { $gte: now } }];
    } else if (scope === 'ongoing') {
      filter.startsAt = { $lte: now };
      filter.$or = [{ endsAt: { $gte: now } }, { endsAt: null }];
    } else if (scope === 'past') {
      filter.$or = [
        { endsAt: { $lt: now } },
        { endsAt: null, startsAt: { $lt: now } },
      ];
      sort = { startsAt: -1 };
    } else if (scope === 'all') {
      sort = { startsAt: -1 };
    }

    const events = await Event.find(filter)
      .populate('courseId', 'title')
      .sort(sort)
      .limit(100);

    res.json(events.map(forStudent));
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/announcement
 * Returns the newest published upcoming or ongoing event for the dashboard announcement card.
 */
async function getLatestAnnouncement(_req, res, next) {
  try {
    const now = new Date();
    // Prioritize newest active upcoming or ongoing event
    const event = await Event.findOne({
      published: true,
      $or: [{ startsAt: { $gte: now } }, { endsAt: { $gte: now } }],
    })
      .populate('courseId', 'title')
      .sort({ createdAt: -1, startsAt: 1 });

    if (!event) return res.json({ event: null });
    res.json({ event: forStudent(event) });
  } catch (err) {
    next(err);
  }
}

/** GET /api/events/:id */
async function getEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event || !event.published) return res.status(404).json({ error: 'Event not found' });
    res.json(forStudent(event));
  } catch (err) {
    next(err);
  }
}

/* ---------------------------------------------------------------- admin */

/** GET /api/admin/events — includes drafts and full join links. */
async function listAllEvents(_req, res, next) {
  try {
    const events = await Event.find().sort({ startsAt: -1 }).limit(200);
    res.json(events);
  } catch (err) {
    next(err);
  }
}

/** POST /api/admin/events */
async function createEvent(req, res, next) {
  try {
    const fields = buildFields(req.body);
    if (!fields.title) return res.status(400).json({ error: 'title is required' });
    if (!fields.startsAt) return res.status(400).json({ error: 'A valid start date/time is required' });

    const event = await Event.create({ ...fields, createdBy: req.user._id });

    // Announce it, either to one course's students or to everyone.
    if (event.published && req.body?.notifyStudents !== false) {
      await sendEventNotification(event);
    }

    await activity.log(req, {
      category: 'course',
      action: 'event.created',
      summary: `Created event "${event.title}"${event.published ? '' : ' (draft)'}`,
      entityType: 'event',
      entityId: event._id,
    });

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
}

/** PUT /api/admin/events/:id */
async function updateEvent(req, res, next) {
  try {
    const existing = await Event.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const wasPublished = existing.published;
    const fields = buildFields(req.body);

    const event = await Event.findByIdAndUpdate(req.params.id, fields, {
      new: true,
      runValidators: true,
    });

    if (event.published && (req.body.notifyStudents || (!wasPublished && req.body.notifyStudents !== false))) {
      await sendEventNotification(event);
    }

    await activity.log(req, {
      category: 'course',
      action: 'event.updated',
      summary: `Updated event "${event.title}"${event.published ? '' : ' (draft)'}`,
      entityType: 'event',
      entityId: event._id,
    });

    res.json(event);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/admin/events/:id */
async function deleteEvent(req, res, next) {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEvents,
  getEvent,
  getLatestAnnouncement,
  listAllEvents,
  createEvent,
  updateEvent,
  deleteEvent,
};
