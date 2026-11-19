const mongoose = require('mongoose');

/**
 * Learner portfolio links and AI Architecture Consultation documents.
 */
const studentPortfolioSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    portfolioUrl: { type: String, default: '', trim: true },
    githubUrl: { type: String, default: '', trim: true },
    linkedinUrl: { type: String, default: '', trim: true },
    projectLink: { type: String, default: '', trim: true },

    aiConsultation: {
      title: { type: String, default: '', trim: true },
      consultationDate: { type: Date },
      documentUrl: { type: String, default: '', trim: true },
      documentName: { type: String, default: '', trim: true },
      notes: { type: String, default: '', trim: true },
      uploadedAt: { type: Date },
    },
  },
  { timestamps: true }
);

studentPortfolioSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StudentPortfolio', studentPortfolioSchema);
