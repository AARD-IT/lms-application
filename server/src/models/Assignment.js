const mongoose = require('mongoose');

/**
 * A task the admin sets for learners, with a due date.
 * Tasks are assigned to specific individual learners (assignedStudentIds).
 * Learners hand work in against it from the Task Submission page (Submission.assignmentId).
 */
const DOMAINS = ['Python', 'SQL', 'Power BI', 'Data Science', 'Gen AI', ''];

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // Technical domain: Python, SQL, Power BI, Data Science, Gen AI
    domain: {
      type: String,
      enum: DOMAINS,
      default: '',
      index: true,
    },

    // Task category (e.g. Data Analysis, KPI Dashboard, Capstone, etc.)
    category: { type: String, default: '', trim: true },

    // Optional: tie it to one course
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', index: true },

    // Specific individual students assigned to this task
    assignedStudentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],

    dueDate: { type: Date },
    maxScore: { type: Number, default: 100, min: 1 },

    // Full structured instructions and deliverables
    objective: { type: String, default: '', trim: true },
    detailedInstructions: { type: String, default: '', trim: true },
    deliverables: [
      {
        label: { type: String, required: true, trim: true },
        required: { type: Boolean, default: true },
        description: { type: String, default: '', trim: true },
      },
    ],
    resources: [
      {
        title: { type: String, required: true, trim: true },
        url: { type: String, required: true, trim: true },
        type: { type: String, default: 'link', trim: true },
      },
    ],
    submissionGuidelines: { type: String, default: '', trim: true },
    allowedFileTypes: [{ type: String, trim: true }],
    maxFileSize: { type: String, default: '25MB', trim: true },

    published: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assignmentSchema.index({ assignedStudentIds: 1, published: 1 });

assignmentSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

const Assignment = mongoose.model('Assignment', assignmentSchema);
Assignment.DOMAINS = DOMAINS;

module.exports = Assignment;

