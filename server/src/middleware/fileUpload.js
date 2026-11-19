const crypto = require('crypto');
const path = require('path');
const multer = require('multer');

/**
 * Handles learner file uploads for Task Submissions:
 * - Direct PDFs (resumes, documentation, dashboards, certificates)
 * - Word documents (.docx, .doc)
 * - Power BI reports (.pbix)
 * - SQL source code files (.sql)
 * - Images (screenshots, certificates: .jpg, .png, .webp)
 */

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pbix',
  '.sql',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
]);

const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pbix': 'application/octet-stream',
  '.sql': 'text/plain',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

const uploadHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      const err = new Error(
        `File type "${ext || 'unknown'}" is not supported. Please upload a PDF, DOCX, PBIX, SQL, or image file.`
      );
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
}).single('file');

function uploadDocument(req, res, next) {
  uploadHandler(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds the 15 MB limit.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Send the file under the "file" field name.' });
    }
    return res.status(err.status || 400).json({ error: err.message || 'File upload failed.' });
  });
}

function generateDocumentFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.bin';
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

module.exports = {
  uploadDocument,
  generateDocumentFilename,
  MIME_MAP,
};
