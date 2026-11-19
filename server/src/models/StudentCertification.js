const mongoose = require('mongoose');

/**
 * Professional / technical certifications submitted by learners
 * (e.g. HackerRank Python, HackerEarth SQL, Microsoft Power BI, etc.)
 */
const studentCertificationSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    issuingOrg: { type: String, required: true, trim: true },
    domain: {
      type: String,
      enum: ['Python', 'SQL', 'Power BI', 'Databricks', 'Additional'],
      required: true,
      index: true,
    },
    // Allows customizing the category display name for 'Additional' or special certifications
    customDomainName: { type: String, default: '', trim: true },
    certificationLevel: { type: String, default: '', trim: true }, // e.g. Associate, Professional, Fundamentals, Specialist
    fileUrl: { type: String, default: '', trim: true },
    verificationUrl: { type: String, default: '', trim: true },
    issueDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['submitted', 'verified', 'needs_update'],
      default: 'submitted',
      index: true,
    },
  },
  { timestamps: true }
);

studentCertificationSchema.index({ studentId: 1, domain: 1 });

studentCertificationSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StudentCertification', studentCertificationSchema);
