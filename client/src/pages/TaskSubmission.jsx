import { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  Bot,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  FolderGit2,
  Github,
  Globe,
  Info,
  Layers,
  LineChart,
  Link2,
  Linkedin,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';

import {
  addCertification,
  createSubmission,
  deleteCertification,
  deleteResume,
  getAssignments,
  getMyCertifications,
  getMyPortfolio,
  getMyResume,
  getMySubmissions,
  getSubmissionCategories,
  getSubmissionOverview,
  resolveMediaUrl,
  savePortfolio,
  saveResume,
  toErrorMessage,
  uploadSubmissionFile,
  withdrawSubmission,
} from '../api/client';

import { usePageMeta } from '../components/layout/DashboardLayout.jsx';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Input from '../components/common/Input.jsx';
import TaskInstructionsDrawer from '../components/tasks/TaskInstructionsDrawer.jsx';
import TaskSubmitModal from '../components/tasks/TaskSubmitModal.jsx';

/**
 * Task Submission Module — Analytics Avenue LMS
 * Redesigned into 4 organized sections:
 * 1. Task Submission (Domain-specific: Python, SQL, Power BI)
 * 2. Certifications (HackerRank, HackerEarth, Microsoft, etc.)
 * 3. Resume (Version-controlled PDF uploads & links)
 * 4. Portfolio & AI Consultation (Portfolio URLs & AI Architecture Consultation)
 */

const DOMAINS = [
  {
    id: 'Python',
    label: 'Python',
    icon: Terminal,
    status: 'LIVE',
    enabled: true,
    description: 'Data analysis, automation scripts, and ML algorithms',
    gradient: 'from-blue-600 to-indigo-700',
    accentColor: 'text-blue-600',
    categories: [
      'Data Analysis & Cleaning',
      'Automation & Scripting',
      'Web Scraping & APIs',
      'Exploratory Data Analysis (EDA)',
      'Machine Learning Pipeline',
      'Algorithm & Problem Solving',
      'Other Python Project',
    ],
  },
  {
    id: 'SQL',
    label: 'SQL',
    icon: Database,
    status: 'LIVE',
    enabled: true,
    description: 'Relational database queries, optimization & schema design',
    gradient: 'from-cyan-600 to-blue-700',
    accentColor: 'text-cyan-600',
    categories: [
      'Query Optimization & Indexing',
      'Complex Joins & Subqueries',
      'Database Design & Normalization',
      'Stored Procedures & Triggers',
      'Window Functions & CTEs',
      'ETL & Data Warehousing',
      'Other SQL Project',
    ],
  },
  {
    id: 'Power BI',
    label: 'Power BI',
    icon: BarChart3,
    status: 'LIVE',
    enabled: true,
    description: 'Interactive business dashboards, DAX metrics & visuals',
    gradient: 'from-amber-500 to-orange-600',
    accentColor: 'text-amber-600',
    categories: [
      'Executive KPI Dashboard',
      'Financial & Revenue Analytics',
      'Sales & Marketing Performance',
      'HR & Operations Metrics',
      'DAX Calculations & Data Modeling',
      'Interactive Drill-Through Report',
      'Other Power BI Report',
    ],
  },
  {
    id: 'Data Science',
    label: 'Data Science',
    icon: LineChart,
    status: 'UPDATE SOON',
    enabled: false,
    description: 'Statistical modeling, predictive analytics & hypothesis testing',
    gradient: 'from-purple-600 to-violet-800',
    accentColor: 'text-purple-600',
    categories: [],
  },
  {
    id: 'Gen AI',
    label: 'Gen AI',
    icon: Bot,
    status: 'UPDATE SOON',
    enabled: false,
    description: 'LLM applications, RAG pipelines & prompt engineering',
    gradient: 'from-fuchsia-600 to-pink-700',
    accentColor: 'text-fuchsia-600',
    categories: [],
  },
];

const STATUS_META = {
  submitted: { label: 'Submitted', tone: 'neutral', icon: Clock },
  under_review: { label: 'Under Review', tone: 'primary', icon: Clock },
  accepted: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  needs_revision: { label: 'Needs Changes', tone: 'warning', icon: RotateCcw },
};

const formatDate = (val) => {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDue = (value) =>
  new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function TaskSubmission() {
  usePageMeta('Task Submission', 'Submit your technical domain work, certifications, resume, and portfolio.');

  const [activeTab, setActiveTab] = useState('tasks');
  const [activeDomain, setActiveDomain] = useState('Python');

  // Loading & data states
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [overview, setOverview] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [resumeData, setResumeData] = useState({ latest: null, history: [] });
  const [portfolioData, setPortfolioData] = useState({
    portfolioUrl: '',
    githubUrl: '',
    linkedinUrl: '',
    projectLink: '',
    aiConsultation: null,
  });

  // Selected task drawer for instructions and structured submit
  const [instructionTask, setInstructionTask] = useState(null);
  const [submitModalTask, setSubmitModalTask] = useState(null);

  // --- Task Form State ---
  const [taskForm, setTaskForm] = useState({
    title: '',
    category: '',
    description: '',
    datasetLink: '',
    sourceCodeLink: '',
    sourceCodeFile: '',
    dashboardFile: '',
    documentationFile: '',
    outputResults: '',
    screenshots: [],
    assignmentId: '',
  });
  const [submittingTask, setSubmittingTask] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskSuccess, setTaskSuccess] = useState('');

  // --- File Upload State helper ---
  const [uploadingField, setUploadingField] = useState(null);

  // --- Certification Modal/Form State ---
  const [showCertModal, setShowCertModal] = useState(false);
  const [certForm, setCertForm] = useState({
    name: '',
    issuingOrg: 'HackerRank',
    domain: 'Python',
    customDomainName: '',
    certificationLevel: '',
    fileUrl: '',
    verificationUrl: '',
    issueDate: new Date().toISOString().split('T')[0],
  });
  const [submittingCert, setSubmittingCert] = useState(false);
  const [certError, setCertError] = useState('');
  const [certSuccess, setCertSuccess] = useState('');

  // --- Resume Form State ---
  const [resumeForm, setResumeForm] = useState({
    title: 'Data Analyst Resume',
    fileUrl: '',
    fileName: '',
    fileSize: 0,
    resumeLink: '',
  });
  const [submittingResume, setSubmittingResume] = useState(false);
  const [resumeError, setResumeError] = useState('');
  const [resumeSuccess, setResumeSuccess] = useState('');

  // --- Portfolio & AI Form State ---
  const [portfolioForm, setPortfolioForm] = useState({
    portfolioUrl: '',
    githubUrl: '',
    linkedinUrl: '',
    projectLink: '',
  });
  const [aiForm, setAiForm] = useState({
    title: '',
    consultationDate: '',
    documentUrl: '',
    documentName: '',
    notes: '',
  });
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [portfolioMsg, setPortfolioMsg] = useState({ error: '', success: '' });
  const [aiMsg, setAiMsg] = useState({ error: '', success: '' });

  // Initial Data Fetch
  const loadData = async () => {
    try {
      setLoading(true);
      const [overviewData, mySubs, myTasks, myCerts, myResume, myPort] = await Promise.all([
        getSubmissionOverview().catch(() => null),
        getMySubmissions().catch(() => []),
        getAssignments().catch(() => []),
        getMyCertifications().catch(() => []),
        getMyResume().catch(() => ({ latest: null, history: [] })),
        getMyPortfolio().catch(() => ({})),
      ]);

      setOverview(overviewData);
      setSubmissions(mySubs);
      setAssignments(myTasks);
      setCertifications(myCerts);
      setResumeData(myResume);

      if (myPort) {
        setPortfolioData(myPort);
        setPortfolioForm({
          portfolioUrl: myPort.portfolioUrl || '',
          githubUrl: myPort.githubUrl || '',
          linkedinUrl: myPort.linkedinUrl || '',
          projectLink: myPort.projectLink || '',
        });
        if (myPort.aiConsultation) {
          setAiForm({
            title: myPort.aiConsultation.title || '',
            consultationDate: myPort.aiConsultation.consultationDate
              ? new Date(myPort.aiConsultation.consultationDate).toISOString().split('T')[0]
              : '',
            documentUrl: myPort.aiConsultation.documentUrl || '',
            documentName: myPort.aiConsultation.documentName || '',
            notes: myPort.aiConsultation.notes || '',
          });
        }
      }
      setLoading(false);
    } catch (err) {
      setLoadError(toErrorMessage(err));
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Generic direct file upload helper
  const handleFileUpload = async (file, fieldKey, targetSetter) => {
    if (!file) return;
    setUploadingField(fieldKey);
    try {
      const res = await uploadSubmissionFile(file);
      targetSetter((prev) => ({
        ...prev,
        [fieldKey]: res.url,
        ...(fieldKey === 'sourceCodeFile' ? { sourceCodeFileName: res.originalName } : {}),
        ...(fieldKey === 'dashboardFile' ? { dashboardFileName: res.originalName } : {}),
        ...(fieldKey === 'fileUrl' ? { fileName: res.originalName, fileSize: res.size } : {}),
        ...(fieldKey === 'documentUrl' ? { documentName: res.originalName } : {}),
      }));
    } catch (err) {
      alert(toErrorMessage(err) || 'Upload failed. Please try a different file.');
    } finally {
      setUploadingField(null);
    }
  };

  // --- Task Submission Submit ---
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    setSubmittingTask(true);
    setTaskError('');
    setTaskSuccess('');

    try {
      const payload = {
        domain: activeDomain,
        category: activeDomain, // Map to existing category
        taskCategory: taskForm.category,
        title: taskForm.title,
        description: taskForm.description,
        datasetLink: taskForm.datasetLink,
        sourceCodeLink: taskForm.sourceCodeLink,
        sourceCodeFile: taskForm.sourceCodeFile,
        dashboardFile: taskForm.dashboardFile,
        documentationFile: taskForm.documentationFile,
        outputResults: taskForm.outputResults,
        screenshots: taskForm.screenshots,
        assignmentId: taskForm.assignmentId || undefined,
      };

      const created = await createSubmission(payload);
      setSubmissions((prev) => [created, ...prev]);
      setTaskSuccess(`Your ${activeDomain} task "${created.title}" was submitted successfully!`);
      setTaskForm({
        title: '',
        category: '',
        description: '',
        datasetLink: '',
        sourceCodeLink: '',
        sourceCodeFile: '',
        dashboardFile: '',
        documentationFile: '',
        outputResults: '',
        screenshots: [],
        assignmentId: '',
      });

      // Refresh overview and assignment cards
      getSubmissionOverview().then(setOverview).catch(() => {});
      getAssignments().then(setAssignments).catch(() => {});
    } catch (err) {
      setTaskError(toErrorMessage(err));
    } finally {
      setSubmittingTask(false);
    }
  };

  // --- Task Withdrawal ---
  const handleWithdrawTask = async (id) => {
    if (!window.confirm('Withdraw this submission? You can submit it again later.')) return;
    try {
      await withdrawSubmission(id);
      setSubmissions((prev) => prev.filter((s) => s.id !== id && s._id !== id));
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      alert(toErrorMessage(err));
    }
  };

  // --- Certification Submit ---
  const handleCertSubmit = async (e) => {
    e.preventDefault();
    setSubmittingCert(true);
    setCertError('');
    setCertSuccess('');

    try {
      const created = await addCertification(certForm);
      setCertifications((prev) => [created, ...prev]);
      setCertSuccess(`Certificate "${created.name}" added successfully.`);
      setShowCertModal(false);
      setCertForm({
        name: '',
        issuingOrg: 'HackerRank',
        domain: activeDomain === 'Data Science' || activeDomain === 'Gen AI' ? 'Python' : activeDomain,
        customDomainName: '',
        certificationLevel: '',
        fileUrl: '',
        verificationUrl: '',
        issueDate: new Date().toISOString().split('T')[0],
      });
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      setCertError(toErrorMessage(err));
    } finally {
      setSubmittingCert(false);
    }
  };

  // --- Delete Certificate ---
  const handleDeleteCert = async (id) => {
    if (!window.confirm('Remove this certificate?')) return;
    try {
      await deleteCertification(id);
      setCertifications((prev) => prev.filter((c) => c._id !== id && c.id !== id));
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      alert(toErrorMessage(err));
    }
  };

  // --- Resume Submit ---
  const handleResumeSubmit = async (e) => {
    e.preventDefault();
    setSubmittingResume(true);
    setResumeError('');
    setResumeSuccess('');

    try {
      const created = await saveResume(resumeForm);
      setResumeData((prev) => ({
        latest: created,
        history: [created, ...(prev.history || [])],
      }));
      setResumeSuccess('Resume updated to latest version.');
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      setResumeError(toErrorMessage(err));
    } finally {
      setSubmittingResume(false);
    }
  };

  // --- Delete Resume Version ---
  const handleDeleteResume = async (id) => {
    if (!window.confirm('Delete this resume version?')) return;
    try {
      await deleteResume(id);
      const updated = await getMyResume();
      setResumeData(updated);
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      alert(toErrorMessage(err));
    }
  };

  // --- Portfolio Submit ---
  const handlePortfolioSubmit = async (e) => {
    e.preventDefault();
    setSavingPortfolio(true);
    setPortfolioMsg({ error: '', success: '' });

    try {
      const updated = await savePortfolio(portfolioForm);
      setPortfolioData(updated);
      setPortfolioMsg({ error: '', success: 'Portfolio links saved.' });
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      setPortfolioMsg({ error: toErrorMessage(err), success: '' });
    } finally {
      setSavingPortfolio(false);
    }
  };

  // --- AI Architecture Consultation Submit ---
  const handleAiSubmit = async (e) => {
    e.preventDefault();
    setSavingAi(true);
    setAiMsg({ error: '', success: '' });

    try {
      const updated = await savePortfolio({
        ...portfolioForm,
        aiConsultation: aiForm,
      });
      setPortfolioData(updated);
      setAiMsg({ error: '', success: 'AI Consultation details and document saved.' });
      getSubmissionOverview().then(setOverview).catch(() => {});
    } catch (err) {
      setAiMsg({ error: toErrorMessage(err), success: '' });
    } finally {
      setSavingAi(false);
    }
  };

  const activeDomainObj = DOMAINS.find((d) => d.id === activeDomain) || DOMAINS[0];

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-600 shadow-xs">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              Task Submission
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-ink-600">
            Submit domain tasks, professional certifications, resume, and portfolio projects for evaluation.
          </p>
        </div>

        {/* Global Action Shortcut */}
        <div className="flex items-center gap-2">
          {activeTab === 'certifications' && (
            <Button size="sm" onClick={() => setShowCertModal(true)}>
              <Plus className="h-4 w-4" />
              Add Certification
            </Button>
          )}
        </div>
      </div>

      {/* 2. Top Overview Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Task Submissions */}
        <div className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Task Submissions
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <FileCode className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold tabular-nums text-ink-900">
              {overview?.taskCounts?.total ?? submissions.length}
            </span>
            <span className="ml-1.5 text-xs text-ink-500">total tasks</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-ink-100 text-[11px]">
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">
              {overview?.taskCounts?.accepted ?? 0} Approved
            </span>
            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">
              {overview?.taskCounts?.under_review ?? 0} In Review
            </span>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
              {overview?.taskCounts?.needs_revision ?? 0} Revisions
            </span>
          </div>
        </div>

        {/* Card 2: Certifications */}
        <div className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Certifications
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-purple-50 text-purple-600">
              <Award className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-bold tabular-nums text-ink-900">
              {overview?.certCounts?.total ?? certifications.length}
            </span>
            <span className="ml-1.5 text-xs text-ink-500">verified certs</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-ink-100 text-[11px] text-ink-600">
            <span>Python: {overview?.certCounts?.byDomain?.Python ?? 0}</span>
            <span>•</span>
            <span>SQL: {overview?.certCounts?.byDomain?.SQL ?? 0}</span>
            <span>•</span>
            <span>Power BI: {overview?.certCounts?.byDomain?.['Power BI'] ?? 0}</span>
          </div>
        </div>

        {/* Card 3: Resume */}
        <div className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Resume
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <span className="text-base font-bold text-ink-900">
              {resumeData.latest ? `v${resumeData.latest.version} Active` : 'Not Uploaded'}
            </span>
            <span className="block text-xs text-ink-500">
              {resumeData.latest ? `Updated ${formatDate(resumeData.latest.updatedAt)}` : 'Add latest PDF'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-ink-100 text-[11px]">
            {resumeData.latest ? (
              <a
                href={resolveMediaUrl(resumeData.latest.fileUrl || resumeData.latest.resumeLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary-600 hover:text-primary-700"
              >
                <span>View resume</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('resume')}
                className="font-semibold text-primary-600 hover:text-primary-700"
              >
                Upload now &rarr;
              </button>
            )}
            <span className="text-ink-400">{resumeData.history?.length || 0} versions</span>
          </div>
        </div>

        {/* Card 4: Portfolio & AI */}
        <div className="card flex flex-col justify-between p-5 transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Portfolio & AI
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-50 text-cyan-600">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <span className="text-base font-bold text-ink-900">
              {portfolioData?.aiConsultation?.documentUrl ? 'AI Doc Uploaded' : 'AI Pending'}
            </span>
            <span className="block text-xs text-ink-500">
              {[
                portfolioData?.githubUrl && 'GitHub',
                portfolioData?.linkedinUrl && 'LinkedIn',
                portfolioData?.portfolioUrl && 'Site',
              ]
                .filter(Boolean)
                .join(', ') || 'No links connected'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-ink-100 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveTab('portfolio')}
              className="font-semibold text-primary-600 hover:text-primary-700"
            >
              Manage links &rarr;
            </button>
            <span className="font-medium text-emerald-600">
              {portfolioData?.aiConsultation?.documentUrl ? 'Completed' : 'Session Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Technical Domain Status Overview Banner */}
      <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Technical Domain Status Overview
            </h2>
          </div>
          <span className="text-[11px] text-ink-400">Evaluated by coordinator</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
          {DOMAINS.map((domain) => {
            const domainStatus =
              overview?.domainStatuses?.[domain.id] ||
              (domain.enabled ? 'Not Started' : 'Update Soon');

            const isApproved = domainStatus === 'Approved';
            const isReview = domainStatus === 'Under Review';
            const isSubmitted = domainStatus === 'Submitted';
            const isRejected = domainStatus === 'Rejected';
            const isUpcoming = domainStatus === 'Update Soon';

            const statusTone = isApproved
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : isReview
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : isSubmitted
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : isRejected
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : isUpcoming
                      ? 'bg-slate-50 text-slate-500 border-slate-200'
                      : 'bg-ink-50 text-ink-600 border-ink-200';

            return (
              <div
                key={domain.id}
                className={`flex flex-col justify-between rounded-lg border p-3 ${
                  domain.enabled ? 'border-ink-100 bg-surface-muted/60' : 'border-ink-100/60 bg-ink-50/40 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-semibold text-xs text-ink-900">{domain.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      domain.status === 'LIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {domain.status}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                  <span className="text-[11px] text-ink-500">Status:</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
                    {domainStatus}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Tab Navigation (4 Tabs) */}
      <div className="border-b border-ink-100">
        <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto" aria-label="Submission sections">
          {[
            { id: 'tasks', label: 'Task Submission', icon: FileCode, count: submissions.length },
            { id: 'certifications', label: 'Certifications', icon: Award, count: certifications.length },
            { id: 'resume', label: 'Resume', icon: FileText, badge: resumeData.latest ? 'v' + resumeData.latest.version : null },
            { id: 'portfolio', label: 'Portfolio & AI Consultation', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex items-center gap-2 border-b-2 px-3.5 py-3 text-sm font-semibold transition ${
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-primary-600' : 'text-ink-400 group-hover:text-ink-600'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] tabular-nums ${
                      active ? 'bg-primary-50 text-primary-700' : 'bg-ink-100 text-ink-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ============================================================== */}
      {/* SECTION 1: TASK SUBMISSION                                      */}
      {/* ============================================================== */}
      {activeTab === 'tasks' && (
        <div className="space-y-8">
          {/* 3. Technical Domain Selection Cards */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900">
                  Select Technical Domain
                </h3>
                <p className="text-xs text-ink-500">
                  Choose your domain to submit the corresponding project files and links.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
              {DOMAINS.map((domain) => {
                const Icon = domain.icon;
                const isSelected = activeDomain === domain.id;
                const isDisabled = !domain.enabled;

                return (
                  <button
                    key={domain.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (domain.enabled) {
                        setActiveDomain(domain.id);
                        setTaskForm((prev) => ({ ...prev, category: '' }));
                      }
                    }}
                    className={`relative flex flex-col justify-between rounded-xl p-4 text-left transition-all ${
                      isDisabled
                        ? 'cursor-not-allowed border border-ink-100 bg-ink-50/50 opacity-60'
                        : isSelected
                          ? 'border-2 border-primary-600 bg-primary-50/20 shadow-md ring-2 ring-primary-100'
                          : 'border border-ink-100 bg-white hover:border-primary-200 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={`grid h-10 w-10 place-items-center rounded-lg ${
                          isSelected ? 'bg-primary-600 text-white shadow-xs' : 'bg-ink-100 text-ink-700'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          domain.status === 'LIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {domain.status}
                      </span>
                    </div>

                    <div className="mt-4">
                      <h4 className="font-bold text-sm text-ink-900">{domain.label}</h4>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-500">
                        {domain.description}
                      </p>
                    </div>

                    {isSelected && (
                      <span className="mt-3 flex items-center gap-1 text-[11px] font-bold text-primary-700">
                        <Check className="h-3.5 w-3.5" />
                        Active Domain
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Student-Specific Assigned Tasks Section */}
          <div className="card p-5 sm:p-6 shadow-card border-l-4 border-l-primary-600">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
              <div className="flex items-center gap-2.5">
                <ClipboardList className="h-5 w-5 text-primary-600" />
                <div>
                  <h3 className="text-base font-bold text-ink-900">Your Assigned Tasks</h3>
                  <p className="text-xs text-ink-500">
                    Tasks assigned specifically to you. Each student receives individual assignments tailored to their curriculum.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">
                {assignments.length} assigned
              </span>
            </div>

            {assignments.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-ink-200 bg-surface-muted/30 p-8 text-center">
                <ClipboardList className="mx-auto h-10 w-10 text-ink-300" />
                <h4 className="mt-3 text-sm font-bold text-ink-800">No tasks assigned yet.</h4>
                <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
                  Your assigned tasks will appear here once your instructor or administrator assigns them.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {assignments.map((task) => {
                  const isSelected = taskForm.assignmentId === task.id;
                  const overdue = task.dueDate && new Date(task.dueDate) < new Date();
                  const submission = task.mySubmission;

                  return (
                    <div
                      key={task.id}
                      className={`relative flex flex-col justify-between rounded-xl border p-4 transition ${
                        isSelected
                          ? 'border-primary-500 bg-primary-50/40 shadow-xs ring-1 ring-primary-500'
                          : 'border-ink-200 bg-white hover:border-ink-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-primary-100/80 px-2 py-0.5 text-[10.5px] font-bold text-primary-800 uppercase tracking-wide">
                            {task.domain || 'Python'}
                          </span>

                          {submission ? (
                            submission.status === 'accepted' ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800">
                                Completed {typeof submission.score === 'number' ? `(${submission.score}/${task.maxScore || 100})` : ''}
                              </span>
                            ) : submission.status === 'needs_revision' ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">
                                Needs Changes
                              </span>
                            ) : (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10.5px] font-bold text-blue-800">
                                Under Review
                              </span>
                            )
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700">
                              Pending Submission
                            </span>
                          )}
                        </div>

                        <h4 className="mt-2.5 font-bold text-sm text-ink-900 leading-snug">{task.title}</h4>
                        {task.category && (
                          <p className="text-[11px] font-medium text-ink-500 mt-0.5">Category: {task.category}</p>
                        )}

                        {task.description && (
                          <p className="mt-2 line-clamp-2 text-xs text-ink-600 leading-relaxed">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-ink-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="text-[11px] text-ink-500">
                          {task.dueDate ? (
                            <span className={`flex items-center gap-1 ${overdue ? 'font-bold text-red-600' : ''}`}>
                              <CalendarClock className="h-3.5 w-3.5" />
                              {formatDate(task.dueDate)}
                            </span>
                          ) : (
                            <span className="text-ink-400">No deadline</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                          <button
                            type="button"
                            onClick={() => setInstructionTask(task)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-semibold text-ink-700 hover:border-ink-300 hover:bg-ink-50 transition shadow-2xs"
                            title="View complete task instructions and deliverables"
                          >
                            <Eye className="h-3.5 w-3.5 text-ink-500" />
                            View Instructions
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (task.domain && ['Python', 'SQL', 'Power BI'].includes(task.domain)) {
                                setActiveDomain(task.domain);
                              }
                              setSubmitModalTask(task);
                              setTaskForm((prev) => ({
                                ...prev,
                                assignmentId: task.id,
                                title: task.title,
                                category: task.category || prev.category,
                              }));
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-primary-600 text-white'
                                : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                            }`}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            {isSelected ? 'Selected' : submission ? 'Update' : 'Submit Work'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Domain Form Container */}
          <div id="task-submission-form-container" className="card scroll-mt-24 p-6 sm:p-7 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-50 text-primary-600">
                  <activeDomainObj.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-ink-900">
                    {activeDomain} Task Submission
                  </h3>
                  <p className="text-xs text-ink-500">
                    Submit your code, dataset, and deliverables for {activeDomain}.
                  </p>
                </div>
              </div>

              {/* Assignment Picker (if student is fulfilling a specific task) */}
              {assignments.length > 0 && (
                <div className="w-full sm:w-auto">
                  <select
                    className="field-input py-1.5 text-xs sm:w-64"
                    value={taskForm.assignmentId}
                    onChange={(e) => {
                      const taskId = e.target.value;
                      const task = assignments.find((a) => a.id === taskId);
                      if (task && task.domain && ['Python', 'SQL', 'Power BI'].includes(task.domain)) {
                        setActiveDomain(task.domain);
                      }
                      setTaskForm((prev) => ({
                        ...prev,
                        assignmentId: taskId,
                        title: task ? task.title : prev.title,
                        category: task?.category || prev.category,
                      }));
                    }}
                  >
                    <option value="">Independent domain project</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        Assigned: {a.title} {a.dueDate ? `(Due ${formatDate(a.dueDate)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* If an assigned task is selected, show instructions banner */}
            {taskForm.assignmentId && (
              (() => {
                const selected = assignments.find((a) => a.id === taskForm.assignmentId);
                if (!selected) return null;
                return (
                  <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50/50 p-4 text-xs">
                    <div className="flex items-center justify-between gap-2 border-b border-primary-200/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-primary-800">Fulfilling Assigned Task:</span>
                        <span className="font-semibold text-ink-900">{selected.title}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setInstructionTask(selected)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-700 hover:text-primary-900 underline"
                        >
                          <Eye className="h-3 w-3" />
                          View Instructions
                        </button>
                        <button
                          type="button"
                          onClick={() => setTaskForm((prev) => ({ ...prev, assignmentId: '' }))}
                          className="text-[11px] font-semibold text-ink-500 hover:text-ink-800 underline"
                        >
                          Switch to independent project
                        </button>
                      </div>
                    </div>
                    {selected.description && (
                      <p className="mt-2 text-ink-700 whitespace-pre-line leading-relaxed">
                        {selected.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-ink-600">
                      {selected.dueDate && <span><strong>Due:</strong> {formatDate(selected.dueDate, true)}</span>}
                      <span><strong>Max Score:</strong> {selected.maxScore || 100}</span>
                      {selected.mySubmission?.status && (
                        <span><strong>Current Status:</strong> {selected.mySubmission.status.replace('_', ' ')}</span>
                      )}
                    </div>
                  </div>
                );
              })()
            )}

            <form onSubmit={handleTaskSubmit} className="mt-6 space-y-5">
              {taskError && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{taskError}</span>
                </div>
              )}

              {taskSuccess && (
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{taskSuccess}</span>
                </div>
              )}

              {/* Row 1: Title and Category */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="task-title">
                    Task Title <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="task-title"
                    required
                    placeholder={`e.g. ${
                      activeDomain === 'Python'
                        ? 'Customer Churn Machine Learning Pipeline'
                        : activeDomain === 'SQL'
                          ? 'E-Commerce Database Optimization & ETL'
                          : 'Executive Sales & Revenue KPI Dashboard'
                    }`}
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="task-category">
                    Task Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="task-category"
                    required
                    className="field-input"
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                  >
                    <option value="" disabled>
                      Select {activeDomain} category…
                    </option>
                    {activeDomainObj.categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Description */}
              <div>
                <label className="field-label" htmlFor="task-description">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="task-description"
                  required
                  rows={3}
                  className="field-input resize-y text-xs sm:text-sm"
                  placeholder="Detail your approach, key findings, tools utilized, and implementation specifics..."
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  maxLength={3000}
                />
                <span className="mt-1 block text-right text-[11px] text-ink-400">
                  {taskForm.description.length}/3000 characters
                </span>
              </div>

              {/* Domain Specific Inputs */}
              {activeDomain === 'Python' && (
                <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/30 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-900">
                    <Terminal className="h-4 w-4 text-blue-600" />
                    Python Deliverables
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="py-dataset">
                        Dataset Google Drive Link <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="py-dataset"
                        icon={Link2}
                        type="url"
                        required
                        placeholder="https://drive.google.com/..."
                        value={taskForm.datasetLink}
                        onChange={(e) => setTaskForm({ ...taskForm, datasetLink: e.target.value })}
                        hint="Set sharing access to 'Anyone with link - Viewer'."
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="py-code">
                        Source Code GitHub / Google Drive Link <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="py-code"
                        icon={Github}
                        type="url"
                        required
                        placeholder="https://github.com/... or https://drive.google.com/..."
                        value={taskForm.sourceCodeLink}
                        onChange={(e) => setTaskForm({ ...taskForm, sourceCodeLink: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Optional Project Documentation */}
                    <div>
                      <label className="field-label" htmlFor="py-doc-upload">Project Documentation (PDF/DOCX)</label>
                      <div className="flex items-center gap-2">
                        <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="py-doc-upload">
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{uploadingField === 'documentationFile' ? 'Uploading...' : 'Upload Doc'}</span>
                        </label>
                        <input
                          id="py-doc-upload"
                          type="file"
                          accept=".pdf,.docx,.doc"
                          className="sr-only"
                          onChange={(e) =>
                            handleFileUpload(e.target.files[0], 'documentationFile', setTaskForm)
                          }
                        />
                      </div>
                      {taskForm.documentationFile && (
                        <p className="mt-1 truncate text-[11px] text-emerald-600">✓ Uploaded doc</p>
                      )}
                    </div>

                    {/* Optional Output / Results */}
                    <div>
                      <label className="field-label">Output / Results Link or Text</label>
                      <Input
                        placeholder="Link to Colab / Results"
                        value={taskForm.outputResults}
                        onChange={(e) => setTaskForm({ ...taskForm, outputResults: e.target.value })}
                      />
                    </div>

                    {/* Optional Screenshots */}
                    <div>
                      <label className="field-label" htmlFor="py-screenshot-upload">Screenshots / Visuals</label>
                      <div className="flex items-center gap-2">
                        <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="py-screenshot-upload">
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{uploadingField === 'screenshots' ? 'Uploading...' : 'Upload Screenshot'}</span>
                        </label>
                        <input
                          id="py-screenshot-upload"
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp"
                          className="sr-only"
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            try {
                              const res = await uploadSubmissionFile(file);
                              setTaskForm((prev) => ({
                                ...prev,
                                screenshots: [...(prev.screenshots || []), res.url],
                              }));
                            } catch (err) {
                              alert(toErrorMessage(err));
                            }
                          }}
                        />
                      </div>
                      {taskForm.screenshots?.length > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-600">
                          ✓ {taskForm.screenshots.length} screenshot(s) attached
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeDomain === 'SQL' && (
                <div className="space-y-4 rounded-xl border border-cyan-100 bg-cyan-50/30 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-900">
                    <Database className="h-4 w-4 text-cyan-600" />
                    SQL Deliverables
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="sql-db-link">
                        Database / Dataset Link <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="sql-db-link"
                        icon={Link2}
                        type="url"
                        required
                        placeholder="https://drive.google.com/... or raw dataset URL"
                        value={taskForm.datasetLink}
                        onChange={(e) => setTaskForm({ ...taskForm, datasetLink: e.target.value })}
                        hint="Set sharing access to 'Anyone with link - Viewer'."
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="sql-source-link">
                        SQL Source Code (.sql file OR GitHub / Drive link) <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        <Input
                          id="sql-source-link"
                          icon={FolderGit2}
                          type="url"
                          placeholder="GitHub repository or Google Drive link"
                          value={taskForm.sourceCodeLink}
                          onChange={(e) => setTaskForm({ ...taskForm, sourceCodeLink: e.target.value })}
                        />
                        <div className="flex items-center gap-2">
                          <label className="btn btn-secondary cursor-pointer text-xs w-full" htmlFor="sql-file-upload">
                            <UploadCloud className="h-3.5 w-3.5" />
                            <span>
                              {uploadingField === 'sourceCodeFile'
                                ? 'Uploading .sql file...'
                                : taskForm.sourceCodeFile
                                  ? 'Replace .sql file'
                                  : 'Or upload .sql file directly'}
                            </span>
                          </label>
                          <input
                            id="sql-file-upload"
                            type="file"
                            accept=".sql,.txt"
                            className="sr-only"
                            onChange={(e) =>
                              handleFileUpload(e.target.files[0], 'sourceCodeFile', setTaskForm)
                            }
                          />
                        </div>
                        {taskForm.sourceCodeFile && (
                          <p className="text-[11px] font-medium text-emerald-600">✓ .sql file uploaded</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="field-label">Query Output (Link or text)</label>
                      <Input
                        placeholder="Paste output link / summary"
                        value={taskForm.outputResults}
                        onChange={(e) => setTaskForm({ ...taskForm, outputResults: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="sql-doc-upload">Project Documentation</label>
                      <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="sql-doc-upload">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Upload Documentation</span>
                      </label>
                      <input
                        id="sql-doc-upload"
                        type="file"
                        accept=".pdf,.docx,.doc"
                        className="sr-only"
                        onChange={(e) =>
                          handleFileUpload(e.target.files[0], 'documentationFile', setTaskForm)
                        }
                      />
                      {taskForm.documentationFile && (
                        <p className="mt-1 text-[11px] text-emerald-600">✓ Documentation attached</p>
                      )}
                    </div>

                    <div>
                      <label className="field-label" htmlFor="sql-screenshot-upload">Result Screenshots</label>
                      <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="sql-screenshot-upload">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Upload Screenshots</span>
                      </label>
                      <input
                        id="sql-screenshot-upload"
                        type="file"
                        accept=".png,.jpg,.jpeg"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          try {
                            const res = await uploadSubmissionFile(file);
                            setTaskForm((prev) => ({
                              ...prev,
                              screenshots: [...(prev.screenshots || []), res.url],
                            }));
                          } catch (err) {
                            alert(toErrorMessage(err));
                          }
                        }}
                      />
                      {taskForm.screenshots?.length > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-600">
                          ✓ {taskForm.screenshots.length} screenshot(s) attached
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeDomain === 'Power BI' && (
                <div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/30 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <BarChart3 className="h-4 w-4 text-amber-600" />
                    Power BI Deliverables
                  </h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="pbi-dataset">
                        Dataset Google Drive Link <span className="text-red-500">*</span>
                      </label>
                      <Input
                        id="pbi-dataset"
                        icon={Link2}
                        type="url"
                        required
                        placeholder="https://drive.google.com/..."
                        value={taskForm.datasetLink}
                        onChange={(e) => setTaskForm({ ...taskForm, datasetLink: e.target.value })}
                        hint="Set sharing access to 'Anyone with link - Viewer'."
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="pbi-file-upload">
                        Dashboard File (.pbix file OR Google Drive link) <span className="text-red-500">*</span>
                      </label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <label className="btn btn-secondary cursor-pointer text-xs w-full" htmlFor="pbi-file-upload">
                            <UploadCloud className="h-3.5 w-3.5" />
                            <span>
                              {uploadingField === 'dashboardFile'
                                ? 'Uploading .pbix file...'
                                : taskForm.dashboardFile
                                  ? 'Replace .pbix file'
                                  : 'Upload .pbix Dashboard'}
                            </span>
                          </label>
                          <input
                            id="pbi-file-upload"
                            type="file"
                            accept=".pbix,.zip"
                            className="sr-only"
                            onChange={(e) =>
                              handleFileUpload(e.target.files[0], 'dashboardFile', setTaskForm)
                            }
                          />
                        </div>
                        <Input
                          placeholder="Or paste Google Drive link to .pbix file"
                          value={taskForm.dashboardFile}
                          onChange={(e) => setTaskForm({ ...taskForm, dashboardFile: e.target.value })}
                        />
                        {taskForm.dashboardFile && (
                          <p className="text-[11px] font-medium text-emerald-600">✓ .pbix file configured</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className="field-label" htmlFor="pbi-pdf-upload">Dashboard PDF Export</label>
                      <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="pbi-pdf-upload">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Upload Dashboard PDF</span>
                      </label>
                      <input
                        id="pbi-pdf-upload"
                        type="file"
                        accept=".pdf"
                        className="sr-only"
                        onChange={(e) =>
                          handleFileUpload(e.target.files[0], 'documentationFile', setTaskForm)
                        }
                      />
                      {taskForm.documentationFile && (
                        <p className="mt-1 text-[11px] text-emerald-600">✓ PDF export uploaded</p>
                      )}
                    </div>

                    <div>
                      <label className="field-label" htmlFor="pbi-screenshot-upload">Report Screenshots</label>
                      <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="pbi-screenshot-upload">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>Upload Screenshots</span>
                      </label>
                      <input
                        id="pbi-screenshot-upload"
                        type="file"
                        accept=".png,.jpg,.jpeg"
                        className="sr-only"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          try {
                            const res = await uploadSubmissionFile(file);
                            setTaskForm((prev) => ({
                              ...prev,
                              screenshots: [...(prev.screenshots || []), res.url],
                            }));
                          } catch (err) {
                            alert(toErrorMessage(err));
                          }
                        }}
                      />
                      {taskForm.screenshots?.length > 0 && (
                        <p className="mt-1 text-[11px] text-emerald-600">
                          ✓ {taskForm.screenshots.length} visual(s) attached
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="field-label">Additional Project Link</label>
                      <Input
                        placeholder="Live Power BI link or documentation"
                        value={taskForm.outputResults}
                        onChange={(e) => setTaskForm({ ...taskForm, outputResults: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit CTA */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-ink-100">
                <span className="text-xs text-ink-500">
                  Submissions are reviewed by the domain coordinator. You will receive feedback and scores.
                </span>
                <Button type="submit" loading={submittingTask} disabled={submittingTask}>
                  <Send className="h-4 w-4" />
                  Submit {activeDomain} Task
                </Button>
              </div>
            </form>
          </div>

          {/* Submission History Table */}
          <div className="card p-6 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-ink-900">
                Your Submission History
              </h3>
              <span className="text-xs text-ink-500">{submissions.length} total</span>
            </div>

            {submissions.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No tasks submitted yet"
                description="Select a domain above, fill out the deliverables, and submit your work for coordinator evaluation."
              />
            ) : (
              <div className="divide-y divide-ink-100">
                {submissions.map((sub) => {
                  const meta = STATUS_META[sub.status] || STATUS_META.submitted;
                  const Icon = meta.icon;
                  return (
                    <div key={sub._id || sub.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="primary">{sub.domain || sub.category}</Badge>
                            {sub.taskCategory && (
                              <span className="rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
                                {sub.taskCategory}
                              </span>
                            )}
                            <Badge tone={meta.tone} icon={Icon}>
                              {meta.label}
                            </Badge>
                            {sub.score !== null && sub.score !== undefined && (
                              <span className="text-xs font-bold text-primary-700">
                                Score: {sub.score}/100
                              </span>
                            )}
                          </div>
                          <h4 className="mt-1 font-semibold text-sm text-ink-900">{sub.title}</h4>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-600">
                            {sub.description}
                          </p>
                          <span className="mt-1 block text-[11px] text-ink-400">
                            Submitted on {formatDate(sub.createdAt)}
                          </span>
                        </div>

                        {/* Deliverables Action Links */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {sub.datasetLink && (
                            <a
                              href={sub.datasetLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              title="Dataset Link"
                            >
                              <Link2 className="h-3 w-3" />
                              <span>Dataset</span>
                            </a>
                          )}
                          {sub.sourceCodeLink && (
                            <a
                              href={sub.sourceCodeLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              title="Source Code"
                            >
                              <Github className="h-3 w-3" />
                              <span>Code</span>
                            </a>
                          )}
                          {sub.dashboardFile && (
                            <a
                              href={resolveMediaUrl(sub.dashboardFile)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              title="Dashboard File"
                            >
                              <BarChart3 className="h-3 w-3" />
                              <span>Dashboard</span>
                            </a>
                          )}
                          {sub.status === 'submitted' && (
                            <button
                              type="button"
                              onClick={() => handleWithdrawTask(sub._id || sub.id)}
                              className="text-xs text-red-600 hover:text-red-700 ml-1"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Reviewer Feedback Banner */}
                      {sub.feedback && (
                        <div className="mt-3 rounded-lg border border-primary-100 bg-primary-50/60 p-3 text-xs leading-relaxed text-primary-950">
                          <strong className="font-semibold text-primary-800">Coordinator Feedback: </strong>
                          {sub.feedback}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 2: CERTIFICATIONS                                      */}
      {/* ============================================================== */}
      {activeTab === 'certifications' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-ink-900">Professional Certifications</h3>
              <p className="text-xs text-ink-500">
                Organize your verified credentials across Python, SQL, Power BI, and specialized certifications.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowCertModal(true)}>
              <Plus className="h-4 w-4" />
              Add Certification
            </Button>
          </div>

          {/* Domain Breakdown Tabs / Sections */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                id: 'Python',
                title: 'Python Certifications',
                guidelines: 'HackerRank, HackerEarth & Professional Python Certifications',
                defaultOrg: 'HackerRank',
                badgeTone: 'bg-blue-50 text-blue-700',
              },
              {
                id: 'SQL',
                title: 'SQL Certifications',
                guidelines: 'HackerRank SQL, HackerEarth SQL & Database Certifications',
                defaultOrg: 'HackerRank',
                badgeTone: 'bg-cyan-50 text-cyan-700',
              },
              {
                id: 'Power BI',
                title: 'Power BI Certifications',
                guidelines: 'Microsoft Power BI Certifications (PL-300, etc.)',
                defaultOrg: 'Microsoft',
                badgeTone: 'bg-amber-50 text-amber-700',
              },
              {
                id: 'Databricks',
                title: 'Databricks Certifications',
                guidelines: 'Databricks Certified Data Engineer, ML & Lakehouse Credentials',
                defaultOrg: 'Databricks',
                badgeTone: 'bg-red-50 text-red-700',
              },
              {
                id: 'Additional',
                title: 'Additional / Specialization',
                guidelines: 'Customizable certifications (AWS, GCP, Snowflake, etc.)',
                defaultOrg: 'Other',
                badgeTone: 'bg-purple-50 text-purple-700',
              },
            ].map((section) => {
              const domainKey = section.id;
              const domainCerts = certifications.filter((c) => c.domain === domainKey);
              const customTitle =
                domainKey === 'Additional'
                  ? domainCerts[0]?.customDomainName || section.title
                  : section.title;

              return (
                <div key={domainKey} className="card p-5 shadow-card flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary-600" />
                        <div>
                          <h4 className="font-bold text-sm text-ink-900">{customTitle}</h4>
                          <p className="text-[10.5px] text-ink-400 line-clamp-1">{section.guidelines}</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                        {domainCerts.length}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3">
                      {domainCerts.length === 0 ? (
                        <p className="text-xs text-ink-400 py-3 text-center">
                          No {domainKey} certificates added yet.
                        </p>
                      ) : (
                        domainCerts.map((cert) => (
                          <div
                            key={cert._id || cert.id}
                            className="flex items-center justify-between rounded-lg border border-ink-100 p-3 bg-surface-muted/40"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-xs text-ink-900 truncate">
                                  {cert.name}
                                </span>
                                <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${section.badgeTone}`}>
                                  {cert.issuingOrg}
                                </span>
                                {cert.certificationLevel && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[9.5px] font-semibold text-slate-700">
                                    {cert.certificationLevel}
                                  </span>
                                )}
                              </div>
                              <span className="block text-[11px] text-ink-500 mt-0.5">
                                Issued: {formatDate(cert.issueDate)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {cert.verificationUrl && (
                                <a
                                  href={cert.verificationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-0.5"
                                  title="Verify Certificate"
                                >
                                  <span>Verify</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                              {cert.fileUrl && (
                                <a
                                  href={resolveMediaUrl(cert.fileUrl)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-ink-600 hover:text-ink-900 font-medium inline-flex items-center gap-0.5"
                                  title="View File"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteCert(cert._id || cert.id)}
                                className="text-ink-400 hover:text-red-600 p-1"
                                title="Remove Certificate"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="pt-3 mt-4 border-t border-ink-100">
                    <button
                      type="button"
                      onClick={() => {
                        setCertForm((prev) => ({
                          ...prev,
                          domain: domainKey,
                          issuingOrg: section.defaultOrg,
                          certificationLevel: domainKey === 'Databricks' ? 'Associate' : '',
                        }));
                        setShowCertModal(true);
                      }}
                      className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />
                      Add {domainKey} certificate
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Certificate Modal */}
          {showCertModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
              <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                  <h4 className="font-bold text-base text-ink-900">Add Certificate</h4>
                  <button
                    type="button"
                    onClick={() => setShowCertModal(false)}
                    className="rounded p-1 text-ink-400 hover:text-ink-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={handleCertSubmit} className="mt-4 space-y-4">
                  {certError && (
                    <p className="rounded bg-red-50 p-2.5 text-xs text-red-700">{certError}</p>
                  )}

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="field-label" htmlFor="cert-name">Certificate Name *</label>
                      {certForm.domain === 'Databricks' && (
                        <span className="text-[10px] text-ink-400 font-medium">Quick Suggestions Below</span>
                      )}
                    </div>
                    <Input
                      id="cert-name"
                      required
                      placeholder={
                        certForm.domain === 'Databricks'
                          ? 'e.g. Databricks Certified Data Engineer Associate'
                          : 'e.g. HackerRank Python (Basic) or PL-300 Power BI Data Analyst'
                      }
                      value={certForm.name}
                      onChange={(e) => setCertForm({ ...certForm, name: e.target.value })}
                    />
                    {certForm.domain === 'Databricks' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[
                          'Databricks Certified Data Engineer Associate',
                          'Databricks Certified Data Engineer Professional',
                          'Databricks Certified Machine Learning Associate',
                          'Databricks Certified Data Analyst Associate',
                          'Databricks Accredited Professional',
                        ].map((title) => (
                          <button
                            key={title}
                            type="button"
                            onClick={() =>
                              setCertForm((prev) => ({
                                ...prev,
                                name: title,
                                issuingOrg: 'Databricks',
                                certificationLevel: title.includes('Professional') ? 'Professional' : 'Associate',
                              }))
                            }
                            className="rounded-sm bg-ink-100/70 hover:bg-red-50 hover:text-red-700 px-1.5 py-0.5 text-[10px] text-ink-600 transition"
                          >
                            + {title.replace('Databricks Certified ', '')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="field-label" htmlFor="cert-org">Issuing Organization *</label>
                      <select
                        id="cert-org"
                        required
                        className="field-input"
                        value={certForm.issuingOrg}
                        onChange={(e) => setCertForm({ ...certForm, issuingOrg: e.target.value })}
                      >
                        <option value="Databricks">Databricks</option>
                        <option value="HackerRank">HackerRank</option>
                        <option value="HackerEarth">HackerEarth</option>
                        <option value="Microsoft">Microsoft</option>
                        <option value="Coursera">Coursera</option>
                        <option value="Other">Other Organization</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="cert-domain">Domain *</label>
                      <select
                        id="cert-domain"
                        required
                        className="field-input"
                        value={certForm.domain}
                        onChange={(e) => {
                          const newDomain = e.target.value;
                          setCertForm({
                            ...certForm,
                            domain: newDomain,
                            issuingOrg:
                              newDomain === 'Databricks'
                                ? 'Databricks'
                                : newDomain === 'Power BI'
                                  ? 'Microsoft'
                                  : newDomain === 'Python' || newDomain === 'SQL'
                                    ? 'HackerRank'
                                    : certForm.issuingOrg,
                            certificationLevel: newDomain === 'Databricks' ? 'Associate' : certForm.certificationLevel,
                          });
                        }}
                      >
                        <option value="Python">Python</option>
                        <option value="SQL">SQL</option>
                        <option value="Power BI">Power BI</option>
                        <option value="Databricks">Databricks</option>
                        <option value="Additional">Additional / Specialization</option>
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="cert-level">Level / Type</label>
                      <select
                        id="cert-level"
                        className="field-input"
                        value={certForm.certificationLevel || ''}
                        onChange={(e) => setCertForm({ ...certForm, certificationLevel: e.target.value })}
                      >
                        <option value="">Select Level</option>
                        <option value="Associate">Associate</option>
                        <option value="Professional">Professional</option>
                        <option value="Fundamentals">Fundamentals</option>
                        <option value="Specialist">Specialist</option>
                        <option value="Accredited">Accredited</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  {certForm.domain === 'Additional' && (
                    <div>
                      <label className="field-label" htmlFor="cert-custom-cat">Custom Domain Category Name</label>
                      <Input
                        id="cert-custom-cat"
                        placeholder="e.g. AWS Cloud Certified / Snowflake / Excel"
                        value={certForm.customDomainName}
                        onChange={(e) => setCertForm({ ...certForm, customDomainName: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label" htmlFor="cert-verify-url">Verification URL</label>
                      <Input
                        id="cert-verify-url"
                        type="url"
                        placeholder="https://www.hackerrank.com/certificates/..."
                        value={certForm.verificationUrl}
                        onChange={(e) => setCertForm({ ...certForm, verificationUrl: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="cert-issue-date">Issue Date</label>
                      <Input
                        id="cert-issue-date"
                        type="date"
                        value={certForm.issueDate}
                        onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="field-label" htmlFor="cert-file-upload">Certificate File (PDF or Image)</label>
                    <div className="flex items-center gap-2">
                      <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="cert-file-upload">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>{uploadingField === 'certFile' ? 'Uploading...' : 'Upload Certificate File'}</span>
                      </label>
                      <input
                        id="cert-file-upload"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        className="sr-only"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'fileUrl', setCertForm)}
                      />
                    </div>
                    {certForm.fileUrl && (
                      <p className="mt-1 text-[11px] font-medium text-emerald-600">✓ File attached</p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-100">
                    <Button variant="secondary" onClick={() => setShowCertModal(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={submittingCert} disabled={submittingCert}>
                      Save Certificate
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 3: RESUME                                              */}
      {/* ============================================================== */}
      {activeTab === 'resume' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-ink-900">Resume Management</h3>
            <p className="text-xs text-ink-500">
              Upload your latest resume and maintain version history for coordinator and placement review.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Latest Active Resume Card */}
            <div className="card p-6 shadow-card lg:col-span-1 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary-700">
                  Active Resume
                </span>
                <div className="mt-4 flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
                    <FileText className="h-6 w-6" />
                  </span>
                  <div>
                    <h4 className="font-bold text-base text-ink-900">
                      {resumeData.latest?.title || 'No active resume'}
                    </h4>
                    <span className="text-xs text-ink-500">
                      {resumeData.latest ? `Version ${resumeData.latest.version}` : 'Upload your first version'}
                    </span>
                  </div>
                </div>

                {resumeData.latest && (
                  <div className="mt-4 space-y-1.5 text-xs text-ink-600 bg-surface-muted p-3 rounded-lg">
                    <p>
                      <strong>Last updated:</strong> {formatDate(resumeData.latest.updatedAt)}
                    </p>
                    {resumeData.latest.fileSize > 0 && (
                      <p>
                        <strong>File size:</strong> {(resumeData.latest.fileSize / 1024 / 1024).toFixed(2)} MB
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                {resumeData.latest?.fileUrl && (
                  <Button
                    href={resolveMediaUrl(resumeData.latest.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="h-4 w-4" />
                    Download Current Resume
                  </Button>
                )}
                {resumeData.latest?.resumeLink && (
                  <Button
                    variant="secondary"
                    href={resumeData.latest.resumeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open External Resume Link
                  </Button>
                )}
              </div>
            </div>

            {/* Right: Upload New Version Form */}
            <div className="card p-6 shadow-card lg:col-span-2">
              <h4 className="font-bold text-sm text-ink-900 border-b border-ink-100 pb-3">
                Upload New Resume Version
              </h4>

              <form onSubmit={handleResumeSubmit} className="mt-4 space-y-4">
                {resumeError && (
                  <p className="rounded bg-red-50 p-2.5 text-xs text-red-700">{resumeError}</p>
                )}
                {resumeSuccess && (
                  <p className="rounded bg-emerald-50 p-2.5 text-xs text-emerald-700">{resumeSuccess}</p>
                )}

                <div>
                  <label className="field-label" htmlFor="resume-title">Resume Title</label>
                  <Input
                    id="resume-title"
                    required
                    placeholder="e.g. Data Analyst Resume - 2026 Edition"
                    value={resumeForm.title}
                    onChange={(e) => setResumeForm({ ...resumeForm, title: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Direct PDF Upload */}
                  <div>
                    <label className="field-label" htmlFor="resume-pdf-upload">Direct PDF Upload</label>
                    <label
                      className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-surface-muted/50 p-4 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50/20 transition"
                      htmlFor="resume-pdf-upload"
                    >
                      <UploadCloud className="h-6 w-6 text-primary-600 mb-1" />
                      <span className="text-xs font-semibold text-ink-800">
                        {uploadingField === 'resumeFile' ? 'Uploading PDF...' : 'Choose PDF File'}
                      </span>
                      <span className="text-[11px] text-ink-400 mt-0.5">PDF up to 15 MB</span>
                    </label>
                    <input
                      id="resume-pdf-upload"
                      type="file"
                      accept=".pdf"
                      className="sr-only"
                      onChange={(e) => handleFileUpload(e.target.files[0], 'fileUrl', setResumeForm)}
                    />
                    {resumeForm.fileUrl && (
                      <p className="mt-1.5 text-xs font-medium text-emerald-600">✓ PDF Attached</p>
                    )}
                  </div>

                  {/* External Resume Link */}
                  <div>
                    <label className="field-label" htmlFor="resume-external-link">Or Google Drive / Cloud Link</label>
                    <Input
                      id="resume-external-link"
                      icon={Link2}
                      type="url"
                      placeholder="https://drive.google.com/..."
                      value={resumeForm.resumeLink}
                      onChange={(e) => setResumeForm({ ...resumeForm, resumeLink: e.target.value })}
                      hint="Ensure viewer permissions are public."
                    />
                  </div>
                </div>

                <div className="pt-2 text-right">
                  <Button type="submit" loading={submittingResume} disabled={submittingResume}>
                    <UploadCloud className="h-4 w-4" />
                    Save & Activate Version
                  </Button>
                </div>
              </form>

              {/* Version History */}
              <div className="mt-8 border-t border-ink-100 pt-5">
                <h5 className="font-bold text-xs uppercase tracking-wider text-ink-700 mb-3">
                  Version History ({resumeData.history?.length || 0})
                </h5>
                <div className="divide-y divide-ink-100">
                  {resumeData.history?.map((r) => (
                    <div key={r._id || r.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-900">v{r.version}</span>
                        <span className="text-ink-600">{r.title}</span>
                        {r.isLatest && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-ink-400">{formatDate(r.createdAt)}</span>
                        {r.fileUrl && (
                          <a
                            href={resolveMediaUrl(r.fileUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:text-primary-700 font-medium"
                          >
                            Download
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteResume(r._id || r.id)}
                          className="text-ink-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 4: PORTFOLIO & AI CONSULTATION                         */}
      {/* ============================================================== */}
      {activeTab === 'portfolio' && (
        <div className="space-y-8">
          <div>
            <h3 className="text-lg font-bold text-ink-900">Portfolio & AI Consultation</h3>
            <p className="text-xs text-ink-500">
              Link your professional online profiles and record your AI Architecture consultation deliverables.
            </p>
          </div>

          {/* Section A: Professional Portfolio Links */}
          <div className="card p-6 shadow-card">
            <h4 className="flex items-center gap-2 font-bold text-base text-ink-900 border-b border-ink-100 pb-3">
              <Globe className="h-5 w-5 text-primary-600" />
              Professional Portfolio Links
            </h4>

            <form onSubmit={handlePortfolioSubmit} className="mt-5 space-y-4">
              {portfolioMsg.error && (
                <p className="rounded bg-red-50 p-2.5 text-xs text-red-700">{portfolioMsg.error}</p>
              )}
              {portfolioMsg.success && (
                <p className="rounded bg-emerald-50 p-2.5 text-xs text-emerald-700">{portfolioMsg.success}</p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="port-website">Portfolio Website URL</label>
                  <Input
                    id="port-website"
                    icon={Globe}
                    type="url"
                    placeholder="https://yourname.dev or portfolio link"
                    value={portfolioForm.portfolioUrl}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, portfolioUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="port-github">GitHub Profile URL</label>
                  <Input
                    id="port-github"
                    icon={Github}
                    type="url"
                    placeholder="https://github.com/yourusername"
                    value={portfolioForm.githubUrl}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, githubUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="port-linkedin">LinkedIn Profile URL</label>
                  <Input
                    id="port-linkedin"
                    icon={Linkedin}
                    type="url"
                    placeholder="https://linkedin.com/in/yourusername"
                    value={portfolioForm.linkedinUrl}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, linkedinUrl: e.target.value })}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="port-project-link">Project Portfolio Link</label>
                  <Input
                    id="port-project-link"
                    icon={FolderGit2}
                    type="url"
                    placeholder="e.g. Notion showcase, Behance, or Google Drive folder"
                    value={portfolioForm.projectLink}
                    onChange={(e) => setPortfolioForm({ ...portfolioForm, projectLink: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-2 text-right">
                <Button type="submit" loading={savingPortfolio} disabled={savingPortfolio}>
                  Save Portfolio Links
                </Button>
              </div>
            </form>
          </div>

          {/* Section B: AI Architecture Consultation */}
          <div className="card p-6 shadow-card">
            <h4 className="flex items-center gap-2 font-bold text-base text-ink-900 border-b border-ink-100 pb-3">
              <Sparkles className="h-5 w-5 text-purple-600" />
              AI Architecture Consultation
            </h4>

            {/* MANDATORY PROMPT TEXT NOTE */}
            <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs leading-relaxed text-purple-950">
              <p className="font-medium">
                During your consultation session, our Data Scientist will discuss your project ideas, technical requirements and implementation approach. The AI Architecture document prepared during the consultation should be uploaded here for future reference.
              </p>
            </div>

            <form onSubmit={handleAiSubmit} className="mt-5 space-y-4">
              {aiMsg.error && <p className="rounded bg-red-50 p-2.5 text-xs text-red-700">{aiMsg.error}</p>}
              {aiMsg.success && <p className="rounded bg-emerald-50 p-2.5 text-xs text-emerald-700">{aiMsg.success}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="ai-doc-title">Document Title *</label>
                  <Input
                    id="ai-doc-title"
                    required
                    placeholder="e.g. End-to-End Enterprise RAG & Predictive Solution"
                    value={aiForm.title}
                    onChange={(e) => setAiForm({ ...aiForm, title: e.target.value })}
                  />
                </div>

                <div>
                  <label className="field-label" htmlFor="ai-consult-date">Consultation Date</label>
                  <Input
                    id="ai-consult-date"
                    type="date"
                    value={aiForm.consultationDate}
                    onChange={(e) => setAiForm({ ...aiForm, consultationDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="ai-doc-upload">Upload AI Architecture Document (PDF/DOCX)</label>
                  <div className="flex items-center gap-2">
                    <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="ai-doc-upload">
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>{uploadingField === 'aiDoc' ? 'Uploading...' : 'Choose Document'}</span>
                    </label>
                    <input
                      id="ai-doc-upload"
                      type="file"
                      accept=".pdf,.docx,.doc"
                      className="sr-only"
                      onChange={(e) => handleFileUpload(e.target.files[0], 'documentUrl', setAiForm)}
                    />
                  </div>
                  {aiForm.documentUrl && (
                    <p className="mt-1 text-[11px] font-medium text-emerald-600">✓ Document attached</p>
                  )}
                </div>

                <div>
                  <label className="field-label" htmlFor="ai-doc-link">Or Document Drive / Cloud Link</label>
                  <Input
                    id="ai-doc-link"
                    icon={Link2}
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={aiForm.documentUrl}
                    onChange={(e) => setAiForm({ ...aiForm, documentUrl: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="ai-notes">Additional Notes</label>
                <textarea
                  id="ai-notes"
                  rows={3}
                  className="field-input text-xs sm:text-sm"
                  placeholder="Key recommendations, next steps, or architectural decisions discussed..."
                  value={aiForm.notes}
                  onChange={(e) => setAiForm({ ...aiForm, notes: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                {aiForm.documentUrl ? (
                  <a
                    href={resolveMediaUrl(aiForm.documentUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Stored Architecture Document</span>
                  </a>
                ) : (
                  <span />
                )}
                <Button type="submit" loading={savingAi} disabled={savingAi}>
                  Save AI Consultation Details
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Instructions Drawer */}
      <TaskInstructionsDrawer
        open={Boolean(instructionTask)}
        onClose={() => setInstructionTask(null)}
        task={instructionTask}
        onSubmitWork={(t) => {
          setInstructionTask(null);
          setSubmitModalTask(t);
        }}
      />

      {/* Structured Submit Modal */}
      <TaskSubmitModal
        open={Boolean(submitModalTask)}
        onClose={() => setSubmitModalTask(null)}
        task={submitModalTask}
        onSuccess={(created, t) => {
          setTaskSuccess(`Your work for "${t.title}" was submitted successfully!`);
          getAssignments().then(setAssignments).catch(() => {});
          getMySubmissions().then(setSubmissions).catch(() => {});
          getSubmissionOverview().then(setOverview).catch(() => {});
        }}
      />
    </div>
  );
}
