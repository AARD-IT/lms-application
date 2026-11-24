const mongoose = require('mongoose');

const ticketNotificationSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, index: true },
    ticketObjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket' },
    notificationType: {
      type: String,
      enum: ['ticket_created', 'admin_reply', 'student_reply', 'status_updated'],
      required: true,
      index: true,
    },
    recipient: { type: String, required: true, trim: true },
    recipientRole: { type: String, enum: ['company_support', 'student', 'admin'], default: 'student' },
    subject: { type: String, default: '' },
    deliveryStatus: { type: String, enum: ['sent', 'failed'], required: true, index: true },
    provider: { type: String, default: '' },
    sentAt: { type: Date, default: Date.now },
    errorDetails: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TicketNotification', ticketNotificationSchema);

