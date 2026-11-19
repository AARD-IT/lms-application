const mongoose = require('mongoose');

/**
 * Learner resumes uploaded or updated within the Task Submission module.
 * Keeps version history so previous versions are retained for admin reference.
 */
const studentResumeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, default: 'My Resume' },
    fileUrl: { type: String, default: '', trim: true },
    fileName: { type: String, default: '', trim: true },
    fileSize: { type: Number, default: 0 },
    resumeLink: { type: String, default: '', trim: true },
    version: { type: Number, default: 1 },
    isLatest: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

studentResumeSchema.index({ studentId: 1, isLatest: 1 });
studentResumeSchema.index({ studentId: 1, version: -1 });

studentResumeSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StudentResume', studentResumeSchema);
