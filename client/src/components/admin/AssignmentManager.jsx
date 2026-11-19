import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  ClipboardList,
  ExternalLink,
  Eye,
  FileCode,
  FileText,
  Link2,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  createAssignment,
  deleteAssignment,
  getAdminAssignments,
  getStudents,
  toErrorMessage,
  updateAssignment,
} from '../../api/client';
import Button from '../common/Button.jsx';
import Input from '../common/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { EmptyRow, LoadingRow, Panel, Pill, formatDate, useFlash } from './ui.jsx';

/**
 * Admin CRUD for student-specific assignments.
 * Tasks are assigned to specific, individually selected students.
 * Enrolled students only see tasks specifically assigned to them.
 */

const DOMAIN_OPTIONS = [
  { value: 'Python', label: 'Python' },
  { value: 'SQL', label: 'SQL' },
  { value: 'Power BI', label: 'Power BI' },
  { value: 'Data Science', label: 'Data Science' },
  { value: 'Gen AI', label: 'Gen AI' },
];

const CATEGORY_SUGGESTIONS = [
  'Data Analysis & Cleaning',
  'Complex Joins & Query Optimization',
  'Executive KPI Dashboard',
  'Algorithm & Problem Solving',
  'DAX Calculations & Modeling',
  'Database Normalization',
  'Machine Learning Pipeline',
  'Project',
  'Capstone',
];

const DOMAIN_DEFAULTS = {
  Python: {
    objective: 'Design and implement an end-to-end Python data pipeline, analytical script, or machine learning model with clean, documented code and verifiable outputs.',
    detailedInstructions: `1. Environment & Setup:
- Use Python 3.10+ or Google Colab.
- Import standard libraries (pandas, numpy, matplotlib/seaborn, scikit-learn).

2. Ingestion & Preprocessing:
- Load dataset, verify schemas, handle null values, and remove duplicates.
- Perform exploratory data analysis (EDA) with statistical summaries and visualizations.

3. Core Logic & Modeling:
- Build modular functions or clean OOP classes for the data workflow.
- Document functions with docstrings explaining parameters and outputs.

4. Deliverable Preparation:
- Upload code to GitHub or Google Drive.
- Ensure link sharing permissions are set to "Anyone with the link – Viewer".`,
    deliverables: [
      { label: 'Dataset Google Drive link', required: true, description: 'Direct link to dataset with Viewer permissions' },
      { label: 'Python Source Code (GitHub / Drive link)', required: true, description: 'Clean .py scripts or Jupyter Notebook (.ipynb)' },
      { label: 'Output / Model Results', required: false, description: 'Visual charts, metrics report, or console logs' },
      { label: 'Project Documentation', required: false, description: 'Brief PDF or Word document explaining approach' },
    ],
    resources: [
      { title: 'Google Colab Environment', url: 'https://colab.research.google.com', type: 'guide' },
      { title: 'Python PEP-8 Code Style Guide', url: 'https://peps.python.org/pep-0008/', type: 'documentation' },
    ],
    submissionGuidelines: 'Ensure all Google Drive or GitHub links are set to "Anyone with the link – Viewer". Maximum file upload size 50 MB.',
    allowedFileTypes: '.py, .ipynb, .pdf, .docx, link',
    maxFileSize: '50MB',
  },
  SQL: {
    objective: 'Develop high-performance SQL queries, data models, and analytical views solving core business questions with measurable execution efficiency.',
    detailedInstructions: `1. Database & Schema Ingestion:
- Import provided tables into PostgreSQL / MySQL / SQL Server.
- Inspect primary keys, foreign keys, and indexes.

2. Query Implementation:
- Write optimized queries using CTEs, Window functions, and appropriate JOIN types.
- Ensure proper filtering in WHERE clauses to leverage index scans.

3. Optimization & Explain Plan:
- Analyze execution cost using EXPLAIN ANALYZE before and after adding indexes.
- Record execution time differences.`,
    deliverables: [
      { label: 'Database / Dataset Link', required: true, description: 'Link to SQL dump, DDL scripts, or dataset' },
      { label: 'Optimized SQL Queries (.sql or link)', required: true, description: 'Formatted queries with inline explanatory comments' },
      { label: 'Query Execution Results', required: true, description: 'Result table screenshot or output logs' },
      { label: 'Performance Comparison & Notes', required: false, description: 'Before vs After optimization cost metrics' },
    ],
    resources: [
      { title: 'PostgreSQL Performance Optimization Guide', url: 'https://www.postgresql.org/docs/current/performance-tips.html', type: 'documentation' },
      { title: 'SQL Query Formatter', url: 'https://sqlformat.org/', type: 'guide' },
    ],
    submissionGuidelines: 'Upload .sql files or provide GitHub / Google Drive links with Viewer access. Keep files under 25 MB.',
    allowedFileTypes: '.sql, .csv, .pdf, .txt, link',
    maxFileSize: '25MB',
  },
  'Power BI': {
    objective: 'Design an executive-ready, interactive Power BI report with robust data modeling, dynamic DAX measures, and intuitive visual storytelling.',
    detailedInstructions: `1. Data Modeling:
- Build a clean Star Schema with 1-to-many single-direction relationships.
- Hide foreign key columns and format date dimensions.

2. DAX Calculations:
- Create dedicated Measure Tables.
- Calculate business metrics (YoY, MoM, Margin %, Target variances).

3. Dashboard Design:
- Design executive summary cards, categorical breakdowns, and trend visuals.
- Implement bookmarks, drill-through, and interactive slicers.`,
    deliverables: [
      { label: 'Dataset Google Drive Link', required: true, description: 'Source Excel or CSV dataset' },
      { label: 'Power BI Dashboard File (.pbix upload or link)', required: true, description: 'Interactive .pbix file or Power BI Service link' },
      { label: 'Executive Summary & KPI Explanation', required: true, description: 'Document explaining key findings and DAX measures' },
      { label: 'Dashboard PDF Export & Screenshots', required: false, description: 'Visual export of dashboard pages' },
    ],
    resources: [
      { title: 'Microsoft Power BI Guidance', url: 'https://learn.microsoft.com/en-us/power-bi/guidance/', type: 'documentation' },
      { title: 'DAX Reference Guide', url: 'https://dax.guide/', type: 'documentation' },
    ],
    submissionGuidelines: 'Upload .pbix directly or link via Google Drive (Viewer permissions). Include PDF export if file exceeds 50 MB.',
    allowedFileTypes: '.pbix, .pdf, .png, .jpg, link',
    maxFileSize: '100MB',
  },
};

const EMPTY = {
  title: '',
  description: '',
  domain: 'Python',
  category: 'Project',
  courseId: '',
  dueDate: '',
  maxScore: 100,
  published: true,
  assignedStudentIds: [],
  objective: DOMAIN_DEFAULTS.Python.objective,
  detailedInstructions: DOMAIN_DEFAULTS.Python.detailedInstructions,
  deliverables: DOMAIN_DEFAULTS.Python.deliverables,
  resources: DOMAIN_DEFAULTS.Python.resources,
  submissionGuidelines: DOMAIN_DEFAULTS.Python.submissionGuidelines,
  allowedFileTypes: DOMAIN_DEFAULTS.Python.allowedFileTypes,
  maxFileSize: DOMAIN_DEFAULTS.Python.maxFileSize,
};

/** datetime-local wants local "YYYY-MM-DDTHH:mm"; toISOString would shift by the offset. */
function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function publishOutcome(saved, prefix) {
  const inApp = `${plural(saved.notified || 0, 'student')} notified in the app`;
  const email = saved.email;
  if (!email || email.status === 'no_recipients') return { tone: 'success', message: `${prefix} — ${inApp}.` };

  switch (email.status) {
    case 'sent':
      return { tone: 'success', message: `${prefix} — ${inApp} and ${plural(email.sent, 'email')} sent.` };
    case 'partial':
      return {
        tone: 'warning',
        message: `${prefix} — ${inApp}. ${plural(email.sent, 'email')} sent, ${email.failed} failed${email.error ? `: ${email.error}` : '.'}`,
      };
    case 'not_configured':
      return {
        tone: 'warning',
        message: `${prefix} — ${inApp}, but no emails were sent: email is not set up yet (LMS settings → Email).`,
      };
    case 'disabled':
      return { tone: 'success', message: `${prefix} — ${inApp}. Task emails are switched off in LMS settings → Email.` };
    default:
      return {
        tone: 'warning',
        message: `${prefix} — ${inApp}, but the emails could not be sent${email.error ? `: ${email.error}` : '.'}`,
      };
  }
}

export default function AssignmentManager({ courses = [], onChanged, onViewSubmissions }) {
  const { isSuperAdmin } = useAuth();
  const flash = useFlash();
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([getAdminAssignments(), getStudents().catch(() => [])])
      .then(([asmts, stus]) => {
        setAssignments(asmts || []);
        setStudents(stus || []);
      })
      .catch((err) => flash.error(toErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on mount
  }, []);

  const shown = assignments.filter((a) =>
    !courseFilter
      ? true
      : courseFilter === 'all'
        ? !a.courseId
        : String(a.courseId?._id || a.courseId?.id || a.courseId || '') === String(courseFilter)
  );
  const taskCountFor = (courseId) =>
    assignments.filter((a) => String(a.courseId?._id || a.courseId?.id || a.courseId || '') === String(courseId)).length;

  const set = (key) => (event) =>
    setForm((prev) => ({
      ...prev,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const startEdit = (assignment) => {
    setEditingId(assignment.id);
    const assignedIds = (assignment.assignedStudents || assignment.assignedStudentIds || []).map((s) =>
      typeof s === 'object' && (s.id || s._id) ? String(s.id || s._id) : String(s)
    );
    const defaults = DOMAIN_DEFAULTS[assignment.domain] || DOMAIN_DEFAULTS.Python;
    setForm({
      title: assignment.title || '',
      description: assignment.description || '',
      domain: assignment.domain || 'Python',
      category: assignment.category || 'Project',
      courseId: assignment.courseId?._id || assignment.courseId?.id || '',
      assignedStudentIds: assignedIds,
      dueDate: toLocalInput(assignment.dueDate),
      maxScore: assignment.maxScore || 100,
      published: assignment.published,
      objective: assignment.objective !== undefined ? assignment.objective : defaults.objective,
      detailedInstructions:
        assignment.detailedInstructions !== undefined ? assignment.detailedInstructions : defaults.detailedInstructions,
      deliverables:
        Array.isArray(assignment.deliverables) && assignment.deliverables.length > 0
          ? assignment.deliverables
          : defaults.deliverables,
      resources:
        Array.isArray(assignment.resources) && assignment.resources.length > 0
          ? assignment.resources
          : defaults.resources,
      submissionGuidelines:
        assignment.submissionGuidelines !== undefined ? assignment.submissionGuidelines : defaults.submissionGuidelines,
      allowedFileTypes: Array.isArray(assignment.allowedFileTypes)
        ? assignment.allowedFileTypes.join(', ')
        : assignment.allowedFileTypes || defaults.allowedFileTypes,
      maxFileSize: assignment.maxFileSize || defaults.maxFileSize,
    });
    setStudentSearch('');
    setOpen(true);
  };

  const handleDomainChange = (domain) => {
    const defaults = DOMAIN_DEFAULTS[domain];
    setForm((prev) => ({
      ...prev,
      domain,
      ...(defaults && !editingId
        ? {
            objective: defaults.objective,
            detailedInstructions: defaults.detailedInstructions,
            deliverables: defaults.deliverables,
            resources: defaults.resources,
            submissionGuidelines: defaults.submissionGuidelines,
            allowedFileTypes: defaults.allowedFileTypes,
            maxFileSize: defaults.maxFileSize,
          }
        : {}),
    }));
  };

  const applyDomainDefaults = () => {
    const defaults = DOMAIN_DEFAULTS[form.domain] || DOMAIN_DEFAULTS.Python;
    setForm((prev) => ({
      ...prev,
      objective: defaults.objective,
      detailedInstructions: defaults.detailedInstructions,
      deliverables: defaults.deliverables,
      resources: defaults.resources,
      submissionGuidelines: defaults.submissionGuidelines,
      allowedFileTypes: defaults.allowedFileTypes,
      maxFileSize: defaults.maxFileSize,
    }));
  };

  const addDeliverable = () => {
    setForm((prev) => ({
      ...prev,
      deliverables: [...(prev.deliverables || []), { label: '', required: true, description: '' }],
    }));
  };

  const updateDeliverable = (index, field, value) => {
    setForm((prev) => {
      const next = [...(prev.deliverables || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, deliverables: next };
    });
  };

  const removeDeliverable = (index) => {
    setForm((prev) => ({
      ...prev,
      deliverables: (prev.deliverables || []).filter((_, i) => i !== index),
    }));
  };

  const addResource = () => {
    setForm((prev) => ({
      ...prev,
      resources: [...(prev.resources || []), { title: '', url: '', type: 'link' }],
    }));
  };

  const updateResource = (index, field, value) => {
    setForm((prev) => {
      const next = [...(prev.resources || [])];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, resources: next };
    });
  };

  const removeResource = (index) => {
    setForm((prev) => ({
      ...prev,
      resources: (prev.resources || []).filter((_, i) => i !== index),
    }));
  };

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setStudentSearch('');
    setOpen(false);
  };

  // Filter students by name, email, or student ID
  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const email = (s.email || '').toLowerCase();
      const id = String(s.id || s._id || s.studentId || '').toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [students, studentSearch]);

  const toggleStudent = (studentId) => {
    setForm((prev) => {
      const idStr = String(studentId);
      const exists = prev.assignedStudentIds.includes(idStr);
      return {
        ...prev,
        assignedStudentIds: exists
          ? prev.assignedStudentIds.filter((id) => id !== idStr)
          : [...prev.assignedStudentIds, idStr],
      };
    });
  };

  const selectAllFiltered = () => {
    const idsToAdd = filteredStudents.map((s) => String(s.id || s._id));
    setForm((prev) => ({
      ...prev,
      assignedStudentIds: Array.from(new Set([...prev.assignedStudentIds, ...idsToAdd])),
    }));
  };

  const clearStudentSelection = () => {
    setForm((prev) => ({ ...prev, assignedStudentIds: [] }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const isUnassigned = !form.assignedStudentIds || form.assignedStudentIds.length === 0;

    const payload = {
      ...form,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : '',
      courseId: form.courseId || '',
      assignedStudentIds: form.assignedStudentIds || [],
      deliverables: form.deliverables || [],
      resources: form.resources || [],
    };
    try {
      const saved = editingId ? await updateAssignment(editingId, payload) : await createAssignment(payload);
      if (saved.email || saved.notified) {
        const { tone, message } = publishOutcome(saved, `"${saved.title}" assigned`);
        flash[tone](message);
      } else if (isUnassigned) {
        flash.success(`"${saved.title}" saved (unassigned — visible to no students until assigned).`);
      } else {
        flash.success(`"${saved.title}" saved.`);
      }
      reset();
      await load();
      onChanged?.();
    } catch (err) {
      flash.error(toErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const publish = async (assignment) => {
    try {
      const saved = await updateAssignment(assignment.id, { published: true });
      const { tone, message } = publishOutcome(saved, 'Published');
      flash[tone](message);
      load();
    } catch (err) {
      flash.error(toErrorMessage(err));
    }
  };

  const remove = async (assignment) => {
    if (!window.confirm(`Delete "${assignment.title}"? Historical student submissions will be retained.`)) return;
    try {
      await deleteAssignment(assignment.id);
      setAssignments((prev) => prev.filter((a) => a.id !== assignment.id));
      flash.success('Task deleted.');
    } catch (err) {
      flash.error(toErrorMessage(err));
    }
  };

  return (
    <Panel
      icon={CalendarClock}
      title="Tasks & assignments"
      description="Assign targeted tasks to specific students. Only selected students will see their assigned tasks."
      actions={
        isSuperAdmin &&
        !open && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New task
          </Button>
        )
      }
      bodyClassName=""
    >
      {flash.node && <div className="px-5 pt-4 sm:px-6">{flash.node}</div>}

      {open && (
        <form
          onSubmit={onSubmit}
          className="grid gap-5 border-b border-ink-100 bg-ink-50/50 px-5 py-6 sm:px-6 lg:grid-cols-2"
        >
          <div className="lg:col-span-2">
            <h4 className="text-sm font-bold text-ink-900">
              {editingId ? 'Edit Student Task Assignment' : 'Create & Assign Task to Specific Students'}
            </h4>
            <p className="text-xs text-ink-500 mt-0.5">
              Tasks must be assigned to individual students. Enrolled students will only see tasks specifically assigned to them.
            </p>
          </div>

          {/* Row 1: Title and Domain */}
          <Input
            label="Task title *"
            required
            value={form.title}
            onChange={set('title')}
            maxLength={160}
            placeholder="e.g. Week 4 — SQL Complex Query Optimization"
          />

          <div>
            <div className="flex items-center justify-between">
              <label className="field-label" htmlFor="assignment-domain">
                Technical Domain *
              </label>
              <button
                type="button"
                onClick={applyDomainDefaults}
                className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1"
                title="Populate standard curriculum objectives, deliverables, and instructions"
              >
                <Sparkles className="h-3 w-3" />
                Load {form.domain} Template
              </button>
            </div>
            <select
              id="assignment-domain"
              className="field-input"
              value={form.domain}
              onChange={(e) => handleDomainChange(e.target.value)}
            >
              {DOMAIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Row 2: Category and Optional Course */}
          <div>
            <label className="field-label" htmlFor="assignment-category">
              Task Category
            </label>
            <input
              id="assignment-category"
              list="category-suggestions"
              className="field-input"
              value={form.category}
              onChange={set('category')}
              placeholder="e.g. Project / Capstone / EDA"
            />
            <datalist id="category-suggestions">
              {CATEGORY_SUGGESTIONS.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="field-label" htmlFor="assignment-course">
              Associated Course (Optional)
            </label>
            <select id="assignment-course" className="field-input" value={form.courseId} onChange={set('courseId')}>
              <option value="">No course restriction (Domain project)</option>
              {courses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Row 3: Deadline & Max Score */}
          <Input
            label="Deadline / Due date"
            type="datetime-local"
            value={form.dueDate}
            onChange={set('dueDate')}
            hint="Displayed to the assigned student with deadline badges."
          />
          <Input
            label="Maximum score"
            type="number"
            min={1}
            max={1000}
            value={form.maxScore}
            onChange={set('maxScore')}
          />

          {/* Row 4: Student Picker (Search by Name, Email, Student ID) */}
          <div className="lg:col-span-2 rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-ink-900 flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-primary-600" />
                  Assign to Student(s) * (Required)
                </label>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Search by student name, email, or student ID. Select one or multiple students.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
                  {form.assignedStudentIds.length} selected
                </span>
                {form.assignedStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearStudentSelection}
                    className="text-xs text-ink-400 hover:text-red-600 font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Search Input & Action Buttons */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
                <input
                  type="text"
                  className="field-input pl-8 py-1.5 text-xs"
                  placeholder="Search by student name, email, or student ID..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
                {studentSearch && (
                  <button
                    type="button"
                    onClick={() => setStudentSearch('')}
                    className="absolute right-2.5 top-2 text-ink-400 hover:text-ink-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button type="button" size="xs" variant="secondary" onClick={selectAllFiltered}>
                Select all filtered ({filteredStudents.length})
              </Button>
            </div>

            {/* Selected Chips */}
            {form.assignedStudentIds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg bg-surface-muted/50 border border-ink-100">
                {form.assignedStudentIds.map((id) => {
                  const s = students.find((st) => String(st.id || st._id) === String(id));
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-ink-800 border border-ink-200 shadow-2xs"
                    >
                      <span className="font-semibold">{s ? s.name : id}</span>
                      {s?.email && <span className="text-ink-400 text-[10px]">({s.email})</span>}
                      <button
                        type="button"
                        onClick={() => toggleStudent(id)}
                        className="text-ink-400 hover:text-red-600 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Student list checkboxes */}
            <div className="mt-3 max-h-48 overflow-y-auto divide-y divide-ink-100 rounded-lg border border-ink-100">
              {filteredStudents.length === 0 ? (
                <p className="p-4 text-center text-xs text-ink-400">
                  {students.length === 0 ? 'No registered learners found.' : 'No students match your search.'}
                </p>
              ) : (
                filteredStudents.map((st) => {
                  const idStr = String(st.id || st._id);
                  const isChecked = form.assignedStudentIds.includes(idStr);
                  return (
                    <label
                      key={idStr}
                      className={`flex items-center justify-between p-2.5 text-xs cursor-pointer hover:bg-ink-50 transition ${
                        isChecked ? 'bg-primary-50/60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                          checked={isChecked}
                          onChange={() => toggleStudent(idStr)}
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 truncate">{st.name}</p>
                          <p className="text-[11px] text-ink-500 truncate">{st.email}</p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-ink-400 bg-ink-100/70 px-1.5 py-0.5 rounded">
                        ID: {st.studentId || idStr.slice(-6)}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Row 5: Short Description */}
          <div className="lg:col-span-2">
            <label className="field-label" htmlFor="assignment-description">
              Short Description (Card Summary)
            </label>
            <textarea
              id="assignment-description"
              className="field-input min-h-[70px] resize-y text-xs sm:text-sm"
              value={form.description}
              onChange={set('description')}
              maxLength={4000}
              placeholder="Brief summary displayed on the student's task card..."
            />
            <p className="mt-1 text-[11px] text-ink-500">
              This summary is displayed on the student task cards. Full instructions can be viewed in detail when clicking View Instructions.
            </p>
          </div>

          {/* Row 6: Task Objective */}
          <div className="lg:col-span-2 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-blue-600" />
              <label className="text-xs font-bold uppercase tracking-wider text-blue-900" htmlFor="assignment-objective">
                Task Objective
              </label>
            </div>
            <textarea
              id="assignment-objective"
              className="field-input min-h-[60px] resize-y text-xs sm:text-sm bg-white"
              value={form.objective}
              onChange={set('objective')}
              placeholder="What high-level business or engineering outcome is the learner expected to achieve?"
            />
          </div>

          {/* Row 7: Full Detailed Instructions */}
          <div className="lg:col-span-2 rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-ink-900 flex items-center gap-1.5" htmlFor="assignment-detailed">
                <FileText className="h-4 w-4 text-primary-600" />
                Full Detailed Instructions (Preserves Numbering, Bullets & Steps)
              </label>
              <span className="text-[11px] text-ink-500">Line breaks and formatting are preserved</span>
            </div>
            <textarea
              id="assignment-detailed"
              className="field-input min-h-[160px] resize-y font-mono text-xs leading-relaxed"
              value={form.detailedInstructions}
              onChange={set('detailedInstructions')}
              placeholder="1. Step-by-step instructions&#10;2. Technical specifications&#10;• Bullet points and subheadings&#10;• Important architectural notes"
            />
          </div>

          {/* Row 8: Deliverables Configuration */}
          <div className="lg:col-span-2 rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-ink-900 flex items-center gap-1.5">
                  <ListChecks className="h-4 w-4 text-primary-600" />
                  Expected Deliverables
                </label>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Define required vs optional submission items. The student submission form dynamically uses these requirements.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
                  {form.deliverables?.length || 0} configured
                </span>
                <Button type="button" size="xs" variant="secondary" onClick={addDeliverable}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Deliverable
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {(form.deliverables || []).map((deliv, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-ink-100 bg-surface-muted/30 p-2.5 text-xs"
                >
                  <div className="flex-1 min-w-[180px]">
                    <input
                      type="text"
                      className="field-input py-1 text-xs"
                      placeholder="Deliverable label (e.g. Optimized SQL queries)"
                      value={deliv.label}
                      onChange={(e) => updateDeliverable(index, 'label', e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[200px]">
                    <input
                      type="text"
                      className="field-input py-1 text-xs"
                      placeholder="Description / hint (e.g. .sql file with execution plans)"
                      value={deliv.description}
                      onChange={(e) => updateDeliverable(index, 'description', e.target.value)}
                    />
                  </div>

                  <label className="flex items-center gap-1.5 shrink-0 px-2 cursor-pointer font-medium text-ink-700">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-ink-300 text-primary-600"
                      checked={deliv.required}
                      onChange={(e) => updateDeliverable(index, 'required', e.target.checked)}
                    />
                    <span>Required</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => removeDeliverable(index)}
                    className="p-1 text-ink-400 hover:text-red-600 rounded transition shrink-0"
                    title="Remove deliverable"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {(!form.deliverables || form.deliverables.length === 0) && (
                <p className="text-center py-3 text-xs text-ink-400">
                  No deliverables defined. Click "+ Add Deliverable" or load a domain template.
                </p>
              )}
            </div>
          </div>

          {/* Row 9: Resources & Reference Links */}
          <div className="lg:col-span-2 rounded-xl border border-ink-200 bg-white p-4 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-ink-900 flex items-center gap-1.5">
                  <Link2 className="h-4 w-4 text-primary-600" />
                  Resources & Reference Links
                </label>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Datasets, starter repositories, documentation, or tutorial references for the student.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">
                  {form.resources?.length || 0} links
                </span>
                <Button type="button" size="xs" variant="secondary" onClick={addResource}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Link
                </Button>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              {(form.resources || []).map((res, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-ink-100 bg-surface-muted/30 p-2.5 text-xs"
                >
                  <div className="flex-1 min-w-[180px]">
                    <input
                      type="text"
                      className="field-input py-1 text-xs"
                      placeholder="Resource title (e.g. Starter Dataset Drive Link)"
                      value={res.title}
                      onChange={(e) => updateResource(index, 'title', e.target.value)}
                    />
                  </div>

                  <div className="flex-1 min-w-[220px]">
                    <input
                      type="url"
                      className="field-input py-1 text-xs font-mono"
                      placeholder="https://drive.google.com/... or https://github.com/..."
                      value={res.url}
                      onChange={(e) => updateResource(index, 'url', e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeResource(index)}
                    className="p-1 text-ink-400 hover:text-red-600 rounded transition shrink-0"
                    title="Remove resource"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {(!form.resources || form.resources.length === 0) && (
                <p className="text-center py-3 text-xs text-ink-400">
                  No resources attached. Click "+ Add Link" to add Google Drive datasets or documentation.
                </p>
              )}
            </div>
          </div>

          {/* Row 10: Submission Guidelines & Constraints */}
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2 rounded-xl border border-ink-200 bg-surface-muted/30 p-4">
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="assignment-guidelines">
                Submission Guidelines & Naming Conventions
              </label>
              <textarea
                id="assignment-guidelines"
                className="field-input min-h-[60px] resize-y text-xs"
                value={form.submissionGuidelines}
                onChange={set('submissionGuidelines')}
                placeholder="Accepted file formats, Drive sharing permissions (Anyone with link - Viewer), naming rules..."
              />
            </div>

            <Input
              label="Allowed File Formats"
              placeholder=".py, .ipynb, .sql, .pbix, .pdf, link"
              value={form.allowedFileTypes}
              onChange={set('allowedFileTypes')}
              hint="Comma-separated extensions and link types"
            />

            <Input
              label="Maximum Upload Size"
              placeholder="e.g. 25MB, 50MB, 100MB"
              value={form.maxFileSize}
              onChange={set('maxFileSize')}
              hint="Displayed in submission drawer guidelines"
            />
          </div>

          {/* Row 6: Publish check */}
          <label className="flex items-center gap-2 text-[13px] text-ink-700 lg:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-primary-200 text-primary-600"
              checked={form.published}
              onChange={set('published')}
            />
            Publish immediately and notify assigned student(s)
          </label>

          {/* Submit Actions */}
          <div className="flex gap-2 lg:col-span-2">
            <Button type="submit" size="sm" loading={saving}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {editingId ? 'Save task' : form.published ? 'Publish task' : 'Save draft'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </form>
      )}

      {!loading && assignments.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3 sm:px-6">
          <label htmlFor="assignment-filter" className="text-[12px] font-medium text-ink-600">
            Show tasks for
          </label>
          <select
            id="assignment-filter"
            className="admin-field w-auto min-w-[14rem]"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">All courses ({assignments.length})</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title} ({taskCountFor(c._id)})
              </option>
            ))}
            <option value="all">Domain-only tasks ({assignments.filter((a) => !a.courseId).length})</option>
          </select>
        </div>
      )}

      {loading ? (
        <LoadingRow label="Loading tasks…" />
      ) : assignments.length === 0 ? (
        <EmptyRow icon={ClipboardList} title="No tasks yet" description="Create one and assign it to specific students." />
      ) : shown.length === 0 ? (
        <EmptyRow
          icon={ClipboardList}
          title="No tasks for this course yet"
          description={isSuperAdmin ? 'Use "New task" to assign work.' : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table min-w-[50rem]">
            <thead>
              <tr>
                <th>Task</th>
                <th>Domain / Category</th>
                <th>Assigned Students</th>
                <th>Due</th>
                <th>Submissions</th>
                <th>Status</th>
                {isSuperAdmin && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => {
                const overdue = a.dueDate && new Date(a.dueDate) < new Date();
                const assignedList = a.assignedStudents || [];
                const count = assignedList.length;

                return (
                  <tr key={a.id}>
                    <td>
                      <p className="font-medium text-ink-900">{a.title}</p>
                      <p className="text-[11.5px] text-ink-400">Max score {a.maxScore}</p>
                    </td>

                    <td className="text-[13px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-primary-700">{a.domain || 'Python'}</span>
                        <span className="text-[11px] text-ink-500">{a.category || 'Project'}</span>
                        {a.courseId?.title && (
                          <span className="text-[10.5px] text-ink-400 truncate max-w-[140px]">
                            {a.courseId.title}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="text-[13px]">
                      {count === 0 ? (
                        <span className="text-amber-600 text-xs">Unassigned</span>
                      ) : count === 1 ? (
                        <div>
                          <p className="font-medium text-ink-900">{assignedList[0]?.name}</p>
                          <p className="text-[11px] text-ink-400">{assignedList[0]?.email}</p>
                        </div>
                      ) : (
                        <div>
                          <p className="inline-flex items-center gap-1 font-medium text-ink-900">
                            <Users className="h-3.5 w-3.5 text-primary-600" />
                            {count} students
                          </p>
                          <p className="text-[11px] text-ink-400 truncate max-w-[180px]">
                            {assignedList.map((s) => s.name).join(', ')}
                          </p>
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap text-[13px]">
                      {a.dueDate ? (
                        <span className={overdue ? 'font-semibold text-red-600' : ''}>
                          {formatDate(a.dueDate, true)}
                        </span>
                      ) : (
                        'No due date'
                      )}
                    </td>

                    <td className="tabular-nums">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.submissionCount}
                        {a.awaitingReview > 0 && <Pill tone="amber">{a.awaitingReview} to review</Pill>}
                        {a.submissionCount > 0 && onViewSubmissions && (
                          <button
                            type="button"
                            onClick={() => onViewSubmissions(a)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-primary-700 hover:bg-primary-50"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            View
                          </button>
                        )}
                      </div>
                    </td>

                    <td>{a.published ? <Pill tone="green">Published</Pill> : <Pill tone="gray">Draft</Pill>}</td>

                    {isSuperAdmin && (
                      <td>
                        <div className="flex justify-end gap-1">
                          {!a.published && (
                            <Button size="sm" variant="soft" onClick={() => publish(a)}>
                              Publish
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            aria-label={`Edit ${a.title}`}
                            className="rounded-lg p-2 text-primary-600 transition hover:bg-primary-50"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(a)}
                            aria-label={`Delete ${a.title}`}
                            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
