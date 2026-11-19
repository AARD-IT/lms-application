const path = require('path');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const StudentCertification = require('../models/StudentCertification');
const StudentResume = require('../models/StudentResume');
const StudentPortfolio = require('../models/StudentPortfolio');
const StoredFile = require('../models/StoredFile');
const User = require('../models/User');
const activity = require('../services/activityService');
const certificateService = require('../services/certificateService');
const { courseAccessFor } = require('../services/enrolmentService');
const { notifyUser, notifyAdmins } = require('../services/notificationService');
const { generateDocumentFilename, MIME_MAP } = require('../middleware/fileUpload');

/**
 * Task submissions, domain projects, student certifications, resumes, and portfolios.
 */

/** Drive, Docs, Sheets, Slides and Colab all count as Drive links. */
const DRIVE_HOSTS = /^(drive|docs|colab\.research)\.google\.com$/i;

function validateDriveLink(raw) {
  const value = String(raw || '').trim();
  if (!value) return { error: 'A Google Drive link is required.' };

  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: 'That does not look like a link. Paste the full https:// URL.' };
  }

  if (url.protocol !== 'https:') {
    return { error: 'The link must start with https://' };
  }
  if (!DRIVE_HOSTS.test(url.hostname.replace(/^www\./, ''))) {
    return {
      error: 'Use a Google Drive link (drive.google.com, docs.google.com or colab.research.google.com).',
    };
  }

  return { value: url.href };
}

/** POST /api/submissions */
async function createSubmission(req, res, next) {
  try {
    const {
      domain,
      category,
      taskCategory,
      title,
      description,
      driveLink,
      assignmentId,
      datasetLink,
      sourceCodeLink,
      sourceCodeFile,
      dashboardFile,
      documentationFile,
      outputResults,
      screenshots,
      deliverablesData,
    } = req.body || {};
    let { courseId } = req.body || {};

    const trimmedTitle = String(title || '').trim().slice(0, 160);
    const trimmedDescription = String(description || '').trim();

    if (!trimmedTitle) {
      return res.status(400).json({ error: 'Task title is required.' });
    }
    if (!trimmedDescription) {
      return res.status(400).json({ error: 'Add a short description of what you are submitting.' });
    }
    if (trimmedDescription.length > 3000) {
      return res.status(400).json({ error: 'Keep the description under 3000 characters.' });
    }

    // Work handed in against an assignment belongs to that assignment's course.
    let assignment = null;
    if (assignmentId) {
      assignment = await Assignment.findOne({ _id: assignmentId, published: true });
      if (!assignment) return res.status(400).json({ error: 'That assignment is no longer open.' });

      // SECURITY CHECK: Verify student is an authorized recipient of this task
      const isAssigned =
        Array.isArray(assignment.assignedStudentIds) &&
        assignment.assignedStudentIds.some((id) => id.toString() === req.user._id.toString());
      const hadPrior = !isAssigned && (await Submission.exists({ studentId: req.user._id, assignmentId: assignment._id }));

      if (!isAssigned && !hadPrior) {
        return res.status(403).json({ error: 'You are not an authorized recipient of this task.' });
      }

      if (assignment.courseId) courseId = assignment.courseId;
    }

    // 1. Technical Domain Submissions (Python, SQL, Power BI)
    if (domain) {
      if (domain === 'Data Science' || domain === 'Gen AI') {
        return res.status(400).json({
          error: `Submissions for ${domain} are currently disabled (Update Soon).`,
        });
      }

      if (!['Python', 'SQL', 'Power BI'].includes(domain)) {
        return res.status(400).json({ error: 'Invalid technical domain selected.' });
      }

      // If assignment has custom deliverables configured, enforce only required ones
      if (assignment && Array.isArray(assignment.deliverables) && assignment.deliverables.length > 0) {
        const requiredDelivs = assignment.deliverables.filter((d) => d.required);
        const submittedMap = new Map();
        if (Array.isArray(deliverablesData)) {
          deliverablesData.forEach((d) => {
            if (d && d.label && (d.value || d.fileUrl)) {
              submittedMap.set(d.label.toLowerCase().trim(), d.value || d.fileUrl);
            }
          });
        }
        for (const reqD of requiredDelivs) {
          const lbl = reqD.label.toLowerCase().trim();
          const hasInCustom = submittedMap.has(lbl);
          const hasInFields =
            (lbl.includes('dataset') && Boolean(datasetLink)) ||
            ((lbl.includes('code') || lbl.includes('script') || lbl.includes('sql') || lbl.includes('quer')) &&
              (Boolean(sourceCodeLink) || Boolean(sourceCodeFile))) ||
            ((lbl.includes('dashboard') || lbl.includes('pbix')) && Boolean(dashboardFile)) ||
            (lbl.includes('doc') && Boolean(documentationFile)) ||
            ((lbl.includes('output') || lbl.includes('result') || lbl.includes('kpi')) && Boolean(outputResults)) ||
            (lbl.includes('screenshot') && Array.isArray(screenshots) && screenshots.length > 0);

          if (!hasInCustom && !hasInFields) {
            return res.status(400).json({ error: `Required deliverable missing: "${reqD.label}".` });
          }
        }
      } else {
        // Standard domain-specific validation rules
        if (domain === 'Python') {
          if (!String(datasetLink || '').trim()) {
            return res.status(400).json({ error: 'Dataset Google Drive link is required for Python submissions.' });
          }
          if (!String(sourceCodeLink || '').trim()) {
            return res.status(400).json({ error: 'Source code GitHub or Google Drive link is required for Python.' });
          }
        } else if (domain === 'SQL') {
          if (!String(datasetLink || '').trim()) {
            return res.status(400).json({ error: 'Database / Dataset link is required for SQL submissions.' });
          }
          if (!String(sourceCodeLink || '').trim() && !String(sourceCodeFile || '').trim()) {
            return res.status(400).json({ error: 'SQL source code (.sql file or GitHub / Drive link) is required.' });
          }
        } else if (domain === 'Power BI') {
          if (!String(datasetLink || '').trim()) {
            return res.status(400).json({ error: 'Dataset Google Drive link is required for Power BI submissions.' });
          }
          if (!String(dashboardFile || '').trim()) {
            return res.status(400).json({ error: 'Dashboard file (.pbix upload or Google Drive link) is required.' });
          }
        }
      }
    } else {
      // Legacy generic submission path
      if (!Submission.CATEGORIES.includes(category)) {
        return res.status(400).json({ error: 'Choose a category from the list.' });
      }
      const link = validateDriveLink(driveLink);
      if (link.error) return res.status(400).json({ error: link.error });
    }

    // Ensure fallback driveLink is populated for backward compatibility
    const resolvedDriveLink =
      String(driveLink || '').trim() ||
      String(datasetLink || '').trim() ||
      String(sourceCodeLink || '').trim() ||
      String(dashboardFile || '').trim() ||
      'https://drive.google.com';

    if (courseId) {
      const access = await courseAccessFor(req.user, courseId);
      if (!access.allowed && access.reason === 'suspended') {
        return res.status(403).json({ error: 'Your access to this course is suspended' });
      }
    }

    const resolvedCategory =
      category && Submission.CATEGORIES.includes(category)
        ? category
        : domain && Submission.CATEGORIES.includes(domain)
          ? domain
          : 'Project';

    const submission = await Submission.create({
      studentId: req.user._id,
      domain: domain || 'Python',
      category: resolvedCategory,
      taskCategory: String(taskCategory || '').trim(),
      title: trimmedTitle,
      description: trimmedDescription,
      driveLink: resolvedDriveLink,
      datasetLink: String(datasetLink || '').trim(),
      sourceCodeLink: String(sourceCodeLink || '').trim(),
      sourceCodeFile: String(sourceCodeFile || '').trim(),
      dashboardFile: String(dashboardFile || '').trim(),
      documentationFile: String(documentationFile || '').trim(),
      outputResults: String(outputResults || '').trim(),
      screenshots: Array.isArray(screenshots) ? screenshots.map((s) => String(s).trim()).filter(Boolean) : [],
      deliverablesData: Array.isArray(deliverablesData) ? deliverablesData : [],
      courseId: courseId || undefined,
      assignmentId: assignment?._id,
    });

    const what = assignment ? `"${assignment.title}"` : `${domain || resolvedCategory} task`;
    await notifyAdmins(
      {
        type: 'submission',
        title: 'Task submitted — awaiting review',
        message: `${req.user.name} submitted ${what}${submission.title ? `: ${submission.title}` : ''}.`,
        link: '/admin/tasks',
      },
      { setting: 'admin.taskSubmitted' }
    );

    res.status(201).json(submission);
  } catch (err) {
    next(err);
  }
}

/** GET /api/submissions/mine */
async function listMine(req, res, next) {
  try {
    const submissions = await Submission.find({ studentId: req.user._id })
      .populate('courseId', 'title')
      .populate('assignmentId', 'title maxScore dueDate')
      .sort({ createdAt: -1 });
    res.json(submissions);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/submissions/overview
 * Real-time summary counts and technical domain status overview for the student
 */
async function getOverview(req, res, next) {
  try {
    const studentId = req.user._id;

    const [submissions, certifications, resumes, portfolio] = await Promise.all([
      Submission.find({ studentId }).sort({ createdAt: -1 }),
      StudentCertification.find({ studentId }).sort({ createdAt: -1 }),
      StudentResume.find({ studentId }).sort({ version: -1 }),
      StudentPortfolio.findOne({ studentId }),
    ]);

    // 1. Task submission counts
    const taskCounts = {
      total: submissions.length,
      submitted: submissions.filter((s) => s.status === 'submitted').length,
      under_review: submissions.filter((s) => s.status === 'under_review').length,
      accepted: submissions.filter((s) => s.status === 'accepted').length,
      needs_revision: submissions.filter((s) => s.status === 'needs_revision').length,
    };

    // 2. Technical domain status determination:
    // Statuses: 'Not Started', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Update Soon'
    const statusMap = {
      accepted: 'Approved',
      under_review: 'Under Review',
      submitted: 'Submitted',
      needs_revision: 'Rejected',
    };

    const getDomainStatus = (domainName) => {
      const match = submissions.find(
        (s) => s.domain === domainName || s.category === domainName
      );
      if (!match) return 'Not Started';
      return statusMap[match.status] || 'Submitted';
    };

    const domainStatuses = {
      Python: getDomainStatus('Python'),
      SQL: getDomainStatus('SQL'),
      'Power BI': getDomainStatus('Power BI'),
      'Data Science': 'Update Soon',
      'Gen AI': 'Update Soon',
    };

    // 3. Certifications summary
    const certCounts = {
      total: certifications.length,
      byDomain: {
        Python: certifications.filter((c) => c.domain === 'Python').length,
        SQL: certifications.filter((c) => c.domain === 'SQL').length,
        'Power BI': certifications.filter((c) => c.domain === 'Power BI').length,
        Databricks: certifications.filter((c) => c.domain === 'Databricks').length,
        Additional: certifications.filter((c) => c.domain === 'Additional').length,
      },
    };

    // 4. Resume summary
    const latestResume = resumes.find((r) => r.isLatest) || resumes[0] || null;

    res.json({
      taskCounts,
      domainStatuses,
      certCounts,
      certifications,
      resume: latestResume,
      resumeCount: resumes.length,
      portfolio: portfolio || {
        portfolioUrl: '',
        githubUrl: '',
        linkedinUrl: '',
        projectLink: '',
        aiConsultation: null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/submissions/upload (multipart) */
async function uploadFile(req, res, next) {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'No file was uploaded.' });
    }

    const filename = generateDocumentFilename(req.file.originalname);
    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const contentType = req.file.mimetype || MIME_MAP[ext] || 'application/octet-stream';

    await StoredFile.create({
      filename,
      originalName: req.file.originalname,
      contentType,
      size: req.file.size,
      data: req.file.buffer,
      uploadedBy: req.user._id,
    });

    res.status(201).json({
      url: `/uploads/documents/${filename}`,
      filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: contentType,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /uploads/documents/:filename */
async function serveDocument(req, res, next) {
  try {
    const { filename } = req.params;
    const file = await StoredFile.findOne({ filename });
    if (!file) return res.status(404).json({ error: 'Document not found' });

    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.status(200).send(file.data);
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------------------------- certifications */

/** GET /api/submissions/certifications/mine */
async function listCertifications(req, res, next) {
  try {
    const items = await StudentCertification.find({ studentId: req.user._id }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

/** POST /api/submissions/certifications */
async function addCertification(req, res, next) {
  try {
    const { name, issuingOrg, domain, customDomainName, certificationLevel, fileUrl, verificationUrl, issueDate } = req.body || {};

    const trimmedName = String(name || '').trim();
    const trimmedOrg = String(issuingOrg || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Certificate name is required.' });
    if (!trimmedOrg) return res.status(400).json({ error: 'Issuing organization is required.' });
    if (!['Python', 'SQL', 'Power BI', 'Databricks', 'Additional'].includes(domain)) {
      return res.status(400).json({ error: 'Please choose a valid domain.' });
    }

    const created = await StudentCertification.create({
      studentId: req.user._id,
      name: trimmedName,
      issuingOrg: trimmedOrg,
      domain,
      customDomainName: String(customDomainName || '').trim(),
      certificationLevel: String(certificationLevel || '').trim(),
      fileUrl: String(fileUrl || '').trim(),
      verificationUrl: String(verificationUrl || '').trim(),
      issueDate: issueDate ? new Date(issueDate) : new Date(),
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/submissions/certifications/:id */
async function deleteCertification(req, res, next) {
  try {
    const item = await StudentCertification.findOne({
      _id: req.params.id,
      studentId: req.user._id,
    });
    if (!item) return res.status(404).json({ error: 'Certificate not found' });

    await item.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/* --------------------------------------------------------------------- resume */

/** GET /api/submissions/resume/mine */
async function getResume(req, res, next) {
  try {
    const resumes = await StudentResume.find({ studentId: req.user._id }).sort({ version: -1 });
    const latest = resumes.find((r) => r.isLatest) || resumes[0] || null;
    res.json({ latest, history: resumes });
  } catch (err) {
    next(err);
  }
}

/** POST /api/submissions/resume */
async function uploadResume(req, res, next) {
  try {
    const { title, fileUrl, fileName, fileSize, resumeLink } = req.body || {};

    const trimmedTitle = String(title || '').trim() || 'My Resume';
    if (!fileUrl && !resumeLink) {
      return res.status(400).json({ error: 'Please upload a PDF resume or provide an external link.' });
    }

    // Demote prior versions so this becomes latest
    await StudentResume.updateMany(
      { studentId: req.user._id },
      { $set: { isLatest: false } }
    );

    const count = await StudentResume.countDocuments({ studentId: req.user._id });

    const created = await StudentResume.create({
      studentId: req.user._id,
      title: trimmedTitle,
      fileUrl: String(fileUrl || '').trim(),
      fileName: String(fileName || '').trim(),
      fileSize: Number(fileSize || 0),
      resumeLink: String(resumeLink || '').trim(),
      version: count + 1,
      isLatest: true,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/submissions/resume/:id */
async function deleteResume(req, res, next) {
  try {
    const resume = await StudentResume.findOne({
      _id: req.params.id,
      studentId: req.user._id,
    });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });

    const wasLatest = resume.isLatest;
    await resume.deleteOne();

    if (wasLatest) {
      const prior = await StudentResume.findOne({ studentId: req.user._id }).sort({ version: -1 });
      if (prior) {
        prior.isLatest = true;
        await prior.save();
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/* -------------------------------------------------- portfolio & ai consultation */

/** GET /api/submissions/portfolio/mine */
async function getPortfolio(req, res, next) {
  try {
    const portfolio = await StudentPortfolio.findOne({ studentId: req.user._id });
    res.json(
      portfolio || {
        portfolioUrl: '',
        githubUrl: '',
        linkedinUrl: '',
        projectLink: '',
        aiConsultation: null,
      }
    );
  } catch (err) {
    next(err);
  }
}

/** PUT /api/submissions/portfolio */
async function updatePortfolio(req, res, next) {
  try {
    const update = {};
    if (req.body.portfolioUrl !== undefined) update.portfolioUrl = String(req.body.portfolioUrl).trim();
    if (req.body.githubUrl !== undefined) update.githubUrl = String(req.body.githubUrl).trim();
    if (req.body.linkedinUrl !== undefined) update.linkedinUrl = String(req.body.linkedinUrl).trim();
    if (req.body.projectLink !== undefined) update.projectLink = String(req.body.projectLink).trim();

    if (req.body.aiConsultation) {
      update.aiConsultation = {
        title: String(req.body.aiConsultation.title || '').trim(),
        consultationDate: req.body.aiConsultation.consultationDate
          ? new Date(req.body.aiConsultation.consultationDate)
          : undefined,
        documentUrl: String(req.body.aiConsultation.documentUrl || '').trim(),
        documentName: String(req.body.aiConsultation.documentName || '').trim(),
        notes: String(req.body.aiConsultation.notes || '').trim(),
        uploadedAt: new Date(),
      };
    }

    const portfolio = await StudentPortfolio.findOneAndUpdate(
      { studentId: req.user._id },
      { $set: update },
      { new: true, upsert: true }
    );

    res.json(portfolio);
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/submissions/:id — a student may withdraw work not yet reviewed. */
async function withdraw(req, res, next) {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      studentId: req.user._id,
    });
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    if (submission.status !== 'submitted') {
      return res
        .status(400)
        .json({ error: 'This has already been picked up for review and cannot be withdrawn.' });
    }

    await submission.deleteOne();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/** The categories the form offers — served so the client cannot drift from it. */
async function listCategories(_req, res) {
  res.json({
    domains: Submission.DOMAINS,
    categories: Submission.CATEGORIES,
    statuses: Submission.STATUSES,
  });
}

/* ---------------------------------------------------------------- admin */

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A query-string id, or undefined. Rejects objects such as ?courseId[$ne]=x. */
const queryId = (value) =>
  typeof value === 'string' && mongoose.isValidObjectId(value) && value.length === 24
    ? new mongoose.Types.ObjectId(value)
    : undefined;

/**
 * GET /api/admin/submissions
 * Supports filtering by status, category, domain, courseId, assignmentId, studentId, search
 * plus advanced filters: certDomain, certOrg, hasResume, hasPortfolio, hasAiDoc
 */
async function listAll(req, res, next) {
  try {
    const q = req.query;
    const base = {};

    if (typeof q.domain === 'string' && q.domain) {
      base.$or = [{ domain: q.domain }, { category: q.domain }];
    }
    if (typeof q.category === 'string' && Submission.CATEGORIES.includes(q.category)) {
      base.category = q.category;
    }
    if (q.courseId === 'none') base.courseId = null;
    else if (queryId(q.courseId)) base.courseId = queryId(q.courseId);
    if (q.assignmentId === 'none') base.assignmentId = null;
    else if (queryId(q.assignmentId)) base.assignmentId = queryId(q.assignmentId);
    if (queryId(q.studentId)) base.studentId = queryId(q.studentId);

    // Advanced student asset filters
    const studentFilters = [];

    // Support single or multiple combined certification domains (e.g. Python,Databricks)
    const combinedDomains = (q.certDomains || q.certDomain || '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    for (const d of combinedDomains) {
      const certs = await StudentCertification.find({ domain: d }).select('studentId');
      studentFilters.push(certs.map((c) => c.studentId));
    }

    // Filter students who have certifications across multiple domains (2+)
    if (q.multipleDomains === '1' || q.multipleDomains === 'true' || q.multipleCertDomains === '1') {
      const multiDomainStudents = await StudentCertification.aggregate([
        { $group: { _id: { studentId: '$studentId', domain: '$domain' } } },
        { $group: { _id: '$_id.studentId', domainCount: { $sum: 1 } } },
        { $match: { domainCount: { $gte: 2 } } },
      ]);
      studentFilters.push(multiDomainStudents.map((s) => s._id));
    }

    if (q.certOrg) {
      const orgs = q.certOrg.split(',').map((o) => o.trim()).filter(Boolean);
      for (const org of orgs) {
        const orgPattern = new RegExp(escapeRegex(org), 'i');
        const certs = await StudentCertification.find({ issuingOrg: orgPattern }).select('studentId');
        studentFilters.push(certs.map((c) => c.studentId));
      }
    }
    if (q.hasResume === '1' || q.hasResume === 'true') {
      const resumes = await StudentResume.find({ isLatest: true }).select('studentId');
      studentFilters.push(resumes.map((r) => r.studentId));
    }
    if (q.hasPortfolio === '1' || q.hasPortfolio === 'true') {
      const portfolios = await StudentPortfolio.find({
        $or: [{ portfolioUrl: { $ne: '' } }, { githubUrl: { $ne: '' } }, { projectLink: { $ne: '' } }],
      }).select('studentId');
      studentFilters.push(portfolios.map((p) => p.studentId));
    }
    if (q.hasAiDoc === '1' || q.hasAiDoc === 'true') {
      const portfolios = await StudentPortfolio.find({
        'aiConsultation.documentUrl': { $exists: true, $ne: '' },
      }).select('studentId');
      studentFilters.push(portfolios.map((p) => p.studentId));
    }

    if (studentFilters.length > 0) {
      // Find intersection of student IDs
      let commonIds = studentFilters[0].map(String);
      for (let i = 1; i < studentFilters.length; i++) {
        const set = new Set(studentFilters[i].map(String));
        commonIds = commonIds.filter((id) => set.has(id));
      }
      const objectIds = commonIds.map((id) => new mongoose.Types.ObjectId(id));
      if (base.studentId) {
        base.studentId = { $in: objectIds.filter((id) => id.equals(base.studentId)) };
      } else {
        base.studentId = { $in: objectIds };
      }
    }

    const search = typeof q.search === 'string' ? q.search.trim().slice(0, 100) : '';
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      const students = await User.find({ $or: [{ name: pattern }, { email: pattern }] })
        .select('_id')
        .limit(500);
      const searchMatch = [{ studentId: { $in: students.map((s) => s._id) } }, { title: pattern }];
      if (base.$or) {
        base.$and = [{ $or: base.$or }, { $or: searchMatch }];
        delete base.$or;
      } else {
        base.$or = searchMatch;
      }
    }

    const filter = { ...base };
    if (typeof q.status === 'string' && Submission.STATUSES.includes(q.status)) filter.status = q.status;

    const listing = Submission.find(filter)
      .populate('studentId', 'name email')
      .populate('courseId', 'title')
      .populate('assignmentId', 'title maxScore dueDate')
      .sort({ createdAt: -1 })
      .limit(500);

    const submissions = await listing;

    // Attach student asset indicators for admin review
    const studentIds = [...new Set(submissions.map((s) => s.studentId?._id?.toString()).filter(Boolean))];
    const [certList, resumeList, portfolioList] = await Promise.all([
      StudentCertification.find({ studentId: { $in: studentIds } }).select(
        'studentId domain issuingOrg name certificationLevel verificationUrl fileUrl issueDate'
      ),
      StudentResume.find({ studentId: { $in: studentIds }, isLatest: true }).select('studentId title fileUrl resumeLink version'),
      StudentPortfolio.find({ studentId: { $in: studentIds } }).select('studentId portfolioUrl githubUrl linkedinUrl aiConsultation'),
    ]);

    const certMap = {};
    for (const c of certList) {
      const sid = c.studentId.toString();
      if (!certMap[sid]) certMap[sid] = [];
      certMap[sid].push(c);
    }

    const resumeMap = {};
    for (const r of resumeList) {
      resumeMap[r.studentId.toString()] = r;
    }

    const portfolioMap = {};
    for (const p of portfolioList) {
      portfolioMap[p.studentId.toString()] = p;
    }

    const enrichedSubmissions = submissions.map((s) => {
      const sid = s.studentId?._id?.toString();
      const json = s.toJSON();
      json.studentAssets = {
        certifications: sid ? certMap[sid] || [] : [],
        resume: sid ? resumeMap[sid] || null : null,
        portfolio: sid ? portfolioMap[sid] || null : null,
      };
      return json;
    });

    if (q.summary !== '1') return res.json(enrichedSubmissions);

    const grouped = await Submission.aggregate([
      { $match: base },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(Submission.STATUSES.map((s) => [s, 0]));
    for (const row of grouped) counts[row._id] = row.count;
    counts.all = Object.values(counts).reduce((a, b) => a + b, 0);

    res.json({ submissions: enrichedSubmissions, counts });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/admin/submissions/:id  body: { status, feedback, score } */
async function review(req, res, next) {
  try {
    const { status, feedback, score } = req.body || {};

    if (status !== undefined && !Submission.STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Unknown review status.' });
    }

    const submission = await Submission.findById(req.params.id).populate('assignmentId', 'title maxScore');
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    const maxScore = submission.assignmentId?.maxScore || 100;
    let resolvedScore;
    if (score === null || score === '') resolvedScore = null;
    else if (score !== undefined) {
      resolvedScore = Number(score);
      if (!Number.isFinite(resolvedScore) || resolvedScore < 0 || resolvedScore > maxScore) {
        return res.status(400).json({ error: `Score must be between 0 and ${maxScore}.` });
      }
    }

    const previousStatus = submission.status;
    const previousScore = submission.score;

    if (status !== undefined) submission.status = status;
    if (feedback !== undefined) submission.feedback = String(feedback).trim().slice(0, 2000);
    if (resolvedScore !== undefined) submission.score = resolvedScore;
    submission.reviewedBy = req.user._id;
    submission.reviewedAt = new Date();
    await submission.save();

    const hasScore = submission.score !== null && submission.score !== undefined;
    const statusChanged = status !== undefined && status !== previousStatus;
    const scoreChanged = resolvedScore !== undefined && resolvedScore !== previousScore;

    if (statusChanged || (scoreChanged && submission.status !== 'submitted')) {
      const wording = {
        under_review: 'is being reviewed',
        accepted: 'is marked completed',
        needs_revision: 'needs a few changes — please update it and submit again',
        submitted: 'was reopened',
      }[submission.status];
      const what = submission.assignmentId
        ? `"${submission.assignmentId.title}"`
        : `${submission.domain || submission.category} submission`;
      const reviewed = ['accepted', 'needs_revision'].includes(submission.status);

      await notifyUser(
        submission.studentId,
        {
          type: 'task_review',
          title: reviewed ? 'Task reviewed — feedback ready' : 'Task review update',
          message:
            `Your ${what} ${wording}.` +
            (hasScore ? ` Score: ${submission.score}/${maxScore}.` : '') +
            (submission.feedback ? ` Feedback: ${submission.feedback.slice(0, 120)}` : ''),
          link: '/tasks',
        },
        { setting: reviewed ? 'learner.taskReviewed' : undefined }
      );
    }

    if (statusChanged && submission.status === 'accepted' && submission.courseId) {
      await certificateService
        .issueForCourse(submission.studentId, submission.courseId)
        .catch((err) => console.error('[review] certificate issue failed:', err.message));
    }

    if (statusChanged || scoreChanged) {
      await activity.log(req, {
        category: 'task',
        action: 'task.reviewed',
        summary: `Reviewed a submission: ${submission.status.replace('_', ' ')}${
          hasScore ? `, score ${submission.score}/${maxScore}` : ''
        }`,
        entityType: 'submission',
        entityId: submission._id,
      });
    }

    res.json(submission);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/student-certifications
 * Admin view of all submitted external certifications with advanced multi-domain filtering
 */
async function listAdminCertifications(req, res, next) {
  try {
    const q = req.query || {};
    const filter = {};

    if (q.domain) {
      const domains = q.domain.split(',').map((d) => d.trim()).filter(Boolean);
      if (domains.length === 1) filter.domain = domains[0];
      else if (domains.length > 1) filter.domain = { $in: domains };
    }

    if (q.issuingOrg) {
      filter.issuingOrg = new RegExp(escapeRegex(q.issuingOrg.trim()), 'i');
    }

    let studentFilterIds = null;

    // Filter students who have multiple domain certifications (2+)
    if (q.multipleDomains === '1' || q.multipleDomains === 'true') {
      const multi = await StudentCertification.aggregate([
        { $group: { _id: { studentId: '$studentId', domain: '$domain' } } },
        { $group: { _id: '$_id.studentId', count: { $sum: 1 } } },
        { $match: { count: { $gte: 2 } } },
      ]);
      studentFilterIds = multi.map((m) => m._id);
    }

    // Filter students who have completed all of the specified combined domains (e.g. Python,Databricks)
    if (q.combinedDomains) {
      const reqDomains = q.combinedDomains.split(',').map((d) => d.trim()).filter(Boolean);
      for (const d of reqDomains) {
        const matches = await StudentCertification.find({ domain: d }).distinct('studentId');
        if (!studentFilterIds) {
          studentFilterIds = matches;
        } else {
          const set = new Set(matches.map(String));
          studentFilterIds = studentFilterIds.filter((id) => set.has(String(id)));
        }
      }
    }

    if (studentFilterIds) {
      filter.studentId = { $in: studentFilterIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    if (q.search) {
      const pattern = new RegExp(escapeRegex(q.search.trim()), 'i');
      const matchingUsers = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);
      const orConditions = [{ name: pattern }, { studentId: { $in: userIds } }];
      if (filter.$or) filter.$and = [{ $or: filter.$or }, { $or: orConditions }];
      else filter.$or = orConditions;
    }

    const items = await StudentCertification.find(filter)
      .populate('studentId', 'name email role phone')
      .sort({ createdAt: -1 })
      .limit(500);

    res.json(items);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createSubmission,
  listMine,
  getOverview,
  uploadFile,
  serveDocument,
  listCertifications,
  addCertification,
  deleteCertification,
  getResume,
  uploadResume,
  deleteResume,
  getPortfolio,
  updatePortfolio,
  withdraw,
  listCategories,
  listAll,
  listAdminCertifications,
  review,
};
