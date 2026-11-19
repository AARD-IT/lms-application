const mongoose = require('mongoose');

/**
 * Uploaded task documents, resumes, certifications and project files,
 * stored safely in MongoDB to persist across restarts and deploys.
 */
const storedFileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true, index: true },
    originalName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StoredFile', storedFileSchema);
