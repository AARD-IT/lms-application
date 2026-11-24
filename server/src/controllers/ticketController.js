const SupportTicket = require('../models/SupportTicket');
const {
  sendNewTicketAdminNotification,
  sendAdminReplyNotification,
  sendStatusUpdateNotification,
  STATUS_LABELS,
} = require('../services/ticketEmailService');
const { notifyAdmins, notifyUser } = require('../services/notificationService');

const GOOGLE_DRIVE_REGEX = /https?:\/\/(drive|docs)\.google\.com\/[^\s]+/i;

const escapeRegex = (val) => String(val || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------- STUDENT APIs */

/**
 * POST /api/tickets
 * Student raises a new ticket.
 */
async function createTicket(req, res, next) {
  try {
    const { technology, issueDescription, proofDriveLink } = req.body || {};

    // Validation
    if (!technology || !SupportTicket.TECHNOLOGIES.includes(technology)) {
      return res.status(400).json({
        error: `Please select a valid technology: ${SupportTicket.TECHNOLOGIES.join(', ')}`,
      });
    }

    const cleanDesc = String(issueDescription || '').trim();
    if (!cleanDesc || cleanDesc.length < 10) {
      return res.status(400).json({
        error: 'Please describe your issue in detail (at least 10 characters).',
      });
    }

    const cleanLink = String(proofDriveLink || '').trim();
    if (!cleanLink || !GOOGLE_DRIVE_REGEX.test(cleanLink)) {
      return res.status(400).json({
        error: 'Please provide a valid Google Drive or Google Docs URL for the proof.',
      });
    }

    const ticketId = await SupportTicket.generateTicketId();

    const ticket = new SupportTicket({
      ticketId,
      studentId: req.user._id,
      studentName: req.user.name,
      studentEmail: req.user.email,
      technology,
      issueDescription: cleanDesc,
      proofDriveLink: cleanLink,
      status: 'open',
      lastActivityAt: new Date(),
      messages: [
        {
          senderId: req.user._id,
          senderRole: 'student',
          senderName: req.user.name,
          message: cleanDesc,
          createdAt: new Date(),
        },
      ],
      statusHistory: [
        {
          status: 'open',
          changedBy: req.user._id,
          changerName: req.user.name,
          note: 'Ticket opened by student',
          changedAt: new Date(),
        },
      ],
    });

    await ticket.save();

    // Fire notifications asynchronously without delaying response
    sendNewTicketAdminNotification(ticket).catch((err) =>
      console.error('[TicketEmail] Failed to send new ticket admin email:', err.message)
    );

    notifyAdmins({
      type: 'support_ticket',
      title: `New Ticket: ${ticket.ticketId}`,
      message: `${req.user.name} submitted a ticket for ${ticket.technology}: "${cleanDesc.slice(0, 80)}${cleanDesc.length > 80 ? '...' : ''}"`,
      link: `/admin/tickets/${ticket._id}`,
    }).catch((err) => console.error('[TicketNotify] Failed to notify admins:', err.message));

    res.status(201).json({
      success: true,
      message: `Support ticket ${ticketId} created successfully.`,
      ticket,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/my-tickets
 * Student gets their own tickets.
 */
async function getMyTickets(req, res, next) {
  try {
    const { status, search } = req.query || {};
    const filter = { studentId: req.user._id };

    if (status && status !== 'all' && SupportTicket.STATUSES.includes(status)) {
      filter.status = status;
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [
        { ticketId: pattern },
        { technology: pattern },
        { issueDescription: pattern },
      ];
    }

    const tickets = await SupportTicket.find(filter)
      .sort({ lastActivityAt: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: tickets.length,
      tickets,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/tickets/:id
 * Retrieve details of a single ticket (student or admin).
 */
async function getTicketById(req, res, next) {
  try {
    const targetId = req.params.ticketId || req.params.id;
    if (!targetId) {
      return res.status(400).json({ error: 'Ticket ID is required' });
    }
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetId);
    const filter = isObjectId ? { _id: targetId } : { ticketId: targetId };

    const ticket = await SupportTicket.findOne(filter)
      .populate('assignedAdminId', 'name email role')
      .lean();

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Authorization: student can only view their own ticket; admin can view all
    if (req.user.role !== 'admin' && String(ticket.studentId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You are not authorized to view this ticket.' });
    }

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tickets/:id/reply
 * Student replies to an existing ticket.
 */
async function studentReply(req, res, next) {
  try {
    const targetId = req.params.ticketId || req.params.id;
    const { message } = req.body || {};

    const cleanMsg = String(message || '').trim();
    if (!cleanMsg || cleanMsg.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid reply message.' });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetId);
    const filter = isObjectId ? { _id: targetId } : { ticketId: targetId };

    const ticket = await SupportTicket.findOne(filter);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (String(ticket.studentId) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You are not authorized to reply to this ticket.' });
    }

    const reply = {
      senderId: req.user._id,
      senderRole: 'student',
      senderName: req.user.name,
      message: cleanMsg,
      createdAt: new Date(),
    };

    ticket.messages.push(reply);
    ticket.lastActivityAt = new Date();

    // If ticket was awaiting student response, switch back to under review
    if (ticket.status === 'awaiting_student_response') {
      ticket.status = 'under_review';
      ticket.statusHistory.push({
        status: 'under_review',
        changedBy: req.user._id,
        changerName: req.user.name,
        note: 'Student replied; status resumed to Under Review',
        changedAt: new Date(),
      });
    }

    await ticket.save();

    notifyAdmins({
      type: 'support_ticket',
      title: `Student Replied: ${ticket.ticketId}`,
      message: `${req.user.name} replied on ticket ${ticket.ticketId}: "${cleanMsg.slice(0, 80)}"`,
      link: `/admin/tickets/${ticket._id}`,
    }).catch((err) => console.error('[TicketNotify] Failed to notify admins of reply:', err.message));

    res.json({
      success: true,
      message: 'Reply sent successfully.',
      ticket,
    });
  } catch (err) {
    next(err);
  }
}

/* --------------------------------------------------------------- ADMIN APIs */

/**
 * GET /api/admin/tickets
 * Admin lists tickets with search, filters and pagination.
 */
async function listAdminTickets(req, res, next) {
  try {
    const { status, technology, search, from, to, page = 1, limit = 50 } = req.query || {};
    const filter = {};

    if (status && status !== 'all' && SupportTicket.STATUSES.includes(status)) {
      filter.status = status;
    }

    if (technology && technology !== 'all' && SupportTicket.TECHNOLOGIES.includes(technology)) {
      filter.technology = technology;
    }

    if (from || to) {
      const range = {};
      if (from) {
        const start = new Date(from);
        if (!Number.isNaN(start.getTime())) range.$gte = start;
      }
      if (to) {
        const end = new Date(to);
        if (!Number.isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          range.$lte = end;
        }
      }
      if (Object.keys(range).length) {
        filter.createdAt = range;
      }
    }

    if (search && String(search).trim()) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');
      filter.$or = [
        { ticketId: pattern },
        { studentName: pattern },
        { studentEmail: pattern },
        { technology: pattern },
        { issueDescription: pattern },
      ];
    }

    const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate('assignedAdminId', 'name email')
        .sort({ lastActivityAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: Number(page),
      limit: Number(limit),
      tickets,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tickets/stats
 * Admin dashboard summary statistics.
 */
async function getAdminTicketStats(req, res, next) {
  try {
    const counts = await SupportTicket.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = {
      total: 0,
      open: 0,
      under_review: 0,
      awaiting_student_response: 0,
      resolved: 0,
      closed: 0,
    };

    counts.forEach((item) => {
      if (stats[item._id] !== undefined) {
        stats[item._id] = item.count;
      }
      stats.total += item.count;
    });

    res.json({ success: true, stats });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/tickets/:id/status
 * Admin updates ticket status.
 */
async function updateTicketStatus(req, res, next) {
  try {
    const targetId = req.params.ticketId || req.params.id;
    const { status, note } = req.body || {};

    if (!status || !SupportTicket.STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Choose one of: ${SupportTicket.STATUSES.join(', ')}`,
      });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetId);
    const filter = isObjectId ? { _id: targetId } : { ticketId: targetId };

    const ticket = await SupportTicket.findOne(filter);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const prevStatus = ticket.status;
    ticket.status = status;
    ticket.assignedAdminId = req.user._id;
    ticket.lastActivityAt = new Date();

    ticket.statusHistory.push({
      status,
      changedBy: req.user._id,
      changerName: req.user.name,
      note: note || `Status updated from ${STATUS_LABELS[prevStatus] || prevStatus} to ${STATUS_LABELS[status] || status}`,
      changedAt: new Date(),
    });

    await ticket.save();

    // Trigger email and in-app notifications
    sendStatusUpdateNotification(ticket, status, note).catch((err) =>
      console.error('[TicketEmail] Failed to send status update email:', err.message)
    );

    notifyUser(ticket.studentId, {
      type: 'support_ticket',
      title: `Ticket Status Updated: ${STATUS_LABELS[status] || status}`,
      message: `Your ticket ${ticket.ticketId} status has been updated to "${STATUS_LABELS[status] || status}".`,
      link: `/my-tickets/${ticket._id}`,
    }).catch((err) => console.error('[TicketNotify] Failed to notify student of status:', err.message));

    res.json({
      success: true,
      message: `Status updated to ${STATUS_LABELS[status] || status}.`,
      ticket,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tickets/:id/reply
 * Admin replies to ticket and optionally updates status.
 */
async function adminReply(req, res, next) {
  try {
    const targetId = req.params.ticketId || req.params.id;
    const { message, newStatus } = req.body || {};

    const cleanMsg = String(message || '').trim();
    if (!cleanMsg || cleanMsg.length < 2) {
      return res.status(400).json({ error: 'Please enter a valid reply message.' });
    }

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(targetId);
    const filter = isObjectId ? { _id: targetId } : { ticketId: targetId };

    const ticket = await SupportTicket.findOne(filter);
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const reply = {
      senderId: req.user._id,
      senderRole: 'admin',
      senderName: req.user.name,
      message: cleanMsg,
      createdAt: new Date(),
    };

    ticket.messages.push(reply);
    ticket.assignedAdminId = req.user._id;
    ticket.lastActivityAt = new Date();

    if (newStatus && SupportTicket.STATUSES.includes(newStatus) && newStatus !== ticket.status) {
      ticket.status = newStatus;
      ticket.statusHistory.push({
        status: newStatus,
        changedBy: req.user._id,
        changerName: req.user.name,
        note: `Status changed to ${STATUS_LABELS[newStatus] || newStatus} upon reply`,
        changedAt: new Date(),
      });
    }

    await ticket.save();

    // Trigger email and in-app notifications
    sendAdminReplyNotification(ticket, cleanMsg, req.user.name).catch((err) =>
      console.error('[TicketEmail] Failed to send admin reply email:', err.message)
    );

    notifyUser(ticket.studentId, {
      type: 'support_ticket',
      title: `Response on Support Ticket ${ticket.ticketId}`,
      message: `${req.user.name} responded: "${cleanMsg.slice(0, 80)}"`,
      link: `/my-tickets/${ticket._id}`,
    }).catch((err) => console.error('[TicketNotify] Failed to notify student of admin reply:', err.message));

    res.json({
      success: true,
      message: 'Reply sent successfully.',
      ticket,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTicket,
  getMyTickets,
  getTicketById,
  studentReply,
  listAdminTickets,
  getAdminTicketStats,
  updateTicketStatus,
  adminReply,
};

