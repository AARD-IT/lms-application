const mongoose = require('mongoose');

const TECHNOLOGIES = [
  'Python',
  'SQL',
  'Power BI',
  'Data Analytics',
  'Data Science',
  'Machine Learning',
  'Generative AI',
  'Other',
];

const STATUSES = [
  'open',
  'under_review',
  'awaiting_student_response',
  'resolved',
  'closed',
];

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['student', 'admin'], required: true },
    senderName: { type: String, required: true },
    message: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changerName: { type: String, default: '' },
    note: { type: String, default: '' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentName: { type: String, required: true, trim: true },
    studentEmail: { type: String, required: true, trim: true, lowercase: true },
    technology: { type: String, enum: TECHNOLOGIES, required: true, index: true },
    issueDescription: { type: String, required: true, trim: true },
    proofDriveLink: { type: String, required: true, trim: true },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messages: { type: [messageSchema], default: [] },
    statusHistory: { type: [statusHistorySchema], default: [] },
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

/**
 * Generates a clean sequential ticket ID: AA-TKT-1001, AA-TKT-1002, etc.
 */
supportTicketSchema.statics.generateTicketId = async function () {
  const last = await this.findOne({}, { ticketId: 1 }).sort({ createdAt: -1 });
  let nextNum = 1001;
  if (last && last.ticketId) {
    const match = last.ticketId.match(/AA-TKT-(\d+)/);
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }
  return `AA-TKT-${nextNum}`;
};

supportTicketSchema.statics.TECHNOLOGIES = TECHNOLOGIES;
supportTicketSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

