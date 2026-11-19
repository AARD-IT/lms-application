import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileCode,
  FileText,
  Filter,
  Globe,
  RotateCcw,
  Search,
  Sparkles,
  Terminal,
  UserRound,
  X,
} from 'lucide-react';
import {
  getAdminAssignments,
  getAllSubmissions,
  getSubmissionCategories,
  resolveMediaUrl,
  reviewSubmission,
  toErrorMessage,
} from '../../api/client';
import Button from '../common/Button.jsx';
import { AdminTabs, EmptyRow, FilterBar, FilterField, LoadingRow, Panel, Pill, formatDate, useFlash } from './ui.jsx';

/**
 * The review queue for learner task submissions.
 *
 * Supports filtering by domain, student asset/certification, course,
 * task, category and learner search.
 */

const STATUS_META = {
  submitted: { label: 'New', tone: 'blue' },
  under_review: { label: 'Reviewing', tone: 'blue' },
  accepted: { label: 'Completed', tone: 'green' },
  needs_revision: { label: 'Needs changes', tone: 'amber' },
};

const STATUS_TABS = [
  { value: '', label: 'All', key: 'all' },
  { value: 'submitted', label: 'New' },
  { value: 'under_review', label: 'Reviewing' },
  { value: 'accepted', label: 'Completed' },
  { value: 'needs_revision', label: 'Needs changes' },
];

const ASSET_FILTERS = [
  { value: '', label: 'All student submissions' },
  { value: 'py_task', label: 'Python task submitted' },
  { value: 'sql_task', label: 'SQL task submitted' },
  { value: 'pbi_task', label: 'Power BI task submitted' },
  { value: 'py_cert', label: 'Python certified students' },
  { value: 'sql_cert', label: 'SQL certified students' },
  { value: 'pbi_cert', label: 'Power BI certified students' },
  { value: 'databricks_cert', label: 'Databricks certified students' },
  { value: 'hackerrank', label: 'HackerRank certified students' },
  { value: 'hackerearth', label: 'HackerEarth certified students' },
  { value: 'multi_cert', label: 'Multiple domain certifications (2+)' },
  { value: 'py_and_databricks', label: 'Python + Databricks certified students' },
  { value: 'resume', label: 'Latest resume available' },
  { value: 'portfolio', label: 'Portfolio available' },
  { value: 'ai_doc', label: 'AI Architecture document uploaded' },
];

const NO_FILTERS = { courseId: '', assignmentId: '', category: '', domain: '', assetFilter: '', student: null };

export default function SubmissionReview({ courses = [], refreshKey = 0, focus }) {
  const flash = useFlash();
  const [submissions, setSubmissions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('submitted');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [categories, setCategories] = useState([]);
  // Quick interactive multi-domain cert filters
  const [selectedCertDomains, setSelectedCertDomains] = useState([]);
  const [selectedCertOrg, setSelectedCertOrg] = useState('');
  const [selectedMultiDomains, setSelectedMultiDomains] = useState(false);

  // Per-row drafts, so typing in one row never touches another.
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);

  // Debounce the search box so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    getAdminAssignments().then(setAssignments).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    getSubmissionCategories()
      .then((meta) => setCategories(meta.categories || []))
      .catch(() => {});
  }, []);

  // "View submissions" on a task in the list above jumps here, filtered to it.
  useEffect(() => {
    if (!focus) return;
    setFilters({ ...NO_FILTERS, courseId: focus.courseId || '', assignmentId: focus.assignmentId || '' });
    setStatus('');
    setQuery('');
    setSearch('');
    document.getElementById('submissions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  const toggleCertDomain = (domainName) => {
    setSelectedCertDomains((prev) =>
      prev.includes(domainName) ? prev.filter((d) => d !== domainName) : [...prev, domainName]
    );
  };

  const showError = flash.error;
  useEffect(() => {
    setLoading(true);
    const params = { summary: '1' };
    if (status) params.status = status;
    if (filters.courseId) params.courseId = filters.courseId;
    if (filters.assignmentId) params.assignmentId = filters.assignmentId;
    if (filters.category) params.category = filters.category;
    if (filters.domain) params.domain = filters.domain;
    if (filters.student) params.studentId = filters.student.id;
    if (search) params.search = search;

    if (filters.assetFilter) {
      if (filters.assetFilter === 'py_task') params.domain = 'Python';
      else if (filters.assetFilter === 'sql_task') params.domain = 'SQL';
      else if (filters.assetFilter === 'pbi_task') params.domain = 'Power BI';
      else if (filters.assetFilter === 'py_cert') params.certDomain = 'Python';
      else if (filters.assetFilter === 'sql_cert') params.certDomain = 'SQL';
      else if (filters.assetFilter === 'pbi_cert') params.certDomain = 'Power BI';
      else if (filters.assetFilter === 'databricks_cert') params.certDomain = 'Databricks';
      else if (filters.assetFilter === 'hackerrank') params.certOrg = 'HackerRank';
      else if (filters.assetFilter === 'hackerearth') params.certOrg = 'HackerEarth';
      else if (filters.assetFilter === 'multi_cert') params.multipleDomains = '1';
      else if (filters.assetFilter === 'py_and_databricks') params.certDomains = 'Python,Databricks';
      else if (filters.assetFilter === 'resume') params.hasResume = '1';
      else if (filters.assetFilter === 'portfolio') params.hasPortfolio = '1';
      else if (filters.assetFilter === 'ai_doc') params.hasAiDoc = '1';
    }

    // Combine with quick interactive cert domain buttons
    if (selectedCertDomains.length > 0) {
      params.certDomains = selectedCertDomains.join(',');
    }
    if (selectedCertOrg) {
      params.certOrg = selectedCertOrg;
    }
    if (selectedMultiDomains) {
      params.multipleDomains = '1';
    }

    let stale = false;
    getAllSubmissions(params)
      .then((data) => {
        if (stale) return;
        setSubmissions(data.submissions || []);
        setCounts(data.counts || null);
      })
      .catch((err) => !stale && showError(toErrorMessage(err)))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [
    status,
    filters,
    search,
    selectedCertDomains,
    selectedCertOrg,
    selectedMultiDomains,
    refreshKey,
    showError,
  ]);

  // Task dropdown follows the course chosen: that course's tasks, plus tasks for everyone.
  const taskOptions = useMemo(() => {
    if (!filters.courseId || filters.courseId === 'none') return assignments;
    return assignments.filter((a) => !a.courseId || a.courseId._id === filters.courseId);
  }, [assignments, filters.courseId]);

  const setFilter = (key, value) =>
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // A course change can strand the chosen task in another course.
      if (key === 'courseId' && prev.assignmentId && prev.assignmentId !== 'none') {
        const task = assignments.find((a) => a.id === prev.assignmentId);
        if (task?.courseId && task.courseId._id !== value) next.assignmentId = '';
      }
      return next;
    });

  const filtered = Boolean(
    filters.courseId ||
      filters.assignmentId ||
      filters.category ||
      filters.domain ||
      filters.assetFilter ||
      filters.student ||
      selectedCertDomains.length > 0 ||
      selectedCertOrg ||
      selectedMultiDomains ||
      search
  );
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setSelectedCertDomains([]);
    setSelectedCertOrg('');
    setSelectedMultiDomains(false);
    setQuery('');
    setSearch('');
  };

  const draftOf = (s) => drafts[s.id] || {};
  const setDraft = (s, patch) => setDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], ...patch } }));

  const handleReview = async (submission, nextStatus) => {
    const draft = draftOf(submission);
    const scoreText = draft.score ?? (submission.score ?? '');
    const feedback = draft.feedback ?? submission.feedback ?? '';
    if (nextStatus === 'needs_revision' && !feedback.trim()) {
      flash.error('Add feedback so the learner knows what to change.');
      return;
    }
    setSavingId(submission.id);

    try {
      const updated = await reviewSubmission(submission.id, {
        status: nextStatus,
        feedback,
        score: scoreText === '' ? null : Number(scoreText),
      });

      // A filtered view should drop a row that no longer matches it.
      setSubmissions((prev) =>
        status && updated.status !== status
          ? prev.filter((s) => s.id !== submission.id)
          : prev.map((s) =>
              s.id === submission.id
                ? { ...s, ...updated, studentId: s.studentId, courseId: s.courseId, assignmentId: s.assignmentId }
                : s
            )
      );
      if (updated.status !== submission.status) {
        setCounts((prev) =>
          prev ? { ...prev, [submission.status]: Math.max(0, (prev[submission.status] || 0) - 1), [updated.status]: (prev[updated.status] || 0) + 1 } : prev
        );
      }
      setDrafts((prev) => ({ ...prev, [submission.id]: undefined }));
      flash.success(
        nextStatus === 'under_review'
          ? 'Marked as reviewing.'
          : `${nextStatus === 'accepted' ? 'Marked completed' : 'Sent back for changes'} — ${submission.studentId?.name || 'the learner'} has been notified.`
      );
    } catch (err) {
      flash.error(toErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  };

  const tabs = STATUS_TABS.map((t) => ({ ...t, count: counts ? counts[t.key || t.value] : undefined }));

  return (
    <Panel
      id="submissions"
      icon={ClipboardCheck}
      title="Review queue"
      description="Learner work submitted as Drive links. Mark it completed or ask for changes — your feedback and score are sent to the learner."
      bodyClassName=""
    >
      <FilterBar>
        <FilterField label="Find a student" className="lg:min-w-[14rem] lg:flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" aria-hidden="true" />
            <input
              type="search"
              className="admin-field w-full pl-9"
              placeholder="Name, email or submission title"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </FilterField>
        <FilterField label="Course" className="lg:w-52">
          <select className="admin-field" value={filters.courseId} onChange={(e) => setFilter('courseId', e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>{c.title}</option>
            ))}
            <option value="none">Not course-specific</option>
          </select>
        </FilterField>
        <FilterField label="Task" className="lg:w-56">
          <select className="admin-field" value={filters.assignmentId} onChange={(e) => setFilter('assignmentId', e.target.value)}>
            <option value="">All tasks</option>
            {taskOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {!filters.courseId ? ` — ${a.courseId?.title || 'All learners'}` : ''}
              </option>
            ))}
            <option value="none">Not for a set task</option>
          </select>
        </FilterField>
        <FilterField label="Domain" className="lg:w-40">
          <select className="admin-field" value={filters.domain} onChange={(e) => setFilter('domain', e.target.value)}>
            <option value="">All domains</option>
            <option value="Python">Python</option>
            <option value="SQL">SQL</option>
            <option value="Power BI">Power BI</option>
            <option value="Databricks">Databricks</option>
          </select>
        </FilterField>
        <FilterField label="Student Filter" className="lg:min-w-[16rem]">
          <select className="admin-field" value={filters.assetFilter} onChange={(e) => setFilter('assetFilter', e.target.value)}>
            {ASSET_FILTERS.map((af) => (
              <option key={af.value} value={af.value}>
                {af.label}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Category" className="lg:w-44">
          <select className="admin-field" value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </FilterField>
        {filtered && (
          <Button size="sm" variant="ghost" onClick={clearFilters} className="lg:mb-0.5">
            <X className="h-4 w-4" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </FilterBar>

      {/* Quick Interactive Combined Certification Filters */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 bg-surface-muted/40 px-5 py-2.5 sm:px-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-600 mr-1 flex items-center gap-1">
          <Award className="h-3.5 w-3.5 text-primary-600" />
          Combined Cert Filter:
        </span>

        {[
          { id: 'Python', label: 'Python' },
          { id: 'SQL', label: 'SQL' },
          { id: 'Power BI', label: 'Power BI' },
          { id: 'Databricks', label: 'Databricks' },
        ].map((d) => {
          const isSelected = selectedCertDomains.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggleCertDomain(d.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition flex items-center gap-1 ${
                isSelected
                  ? 'bg-primary-600 text-white shadow-2xs'
                  : 'bg-white border border-ink-200 text-ink-700 hover:border-primary-300'
              }`}
            >
              <span>{d.label}</span>
              {isSelected && <Check className="h-3 w-3" />}
            </button>
          );
        })}

        {[
          { id: 'HackerRank', label: 'HackerRank' },
          { id: 'HackerEarth', label: 'HackerEarth' },
        ].map((org) => {
          const isSelected = selectedCertOrg === org.id;
          return (
            <button
              key={org.id}
              type="button"
              onClick={() => setSelectedCertOrg((prev) => (prev === org.id ? '' : org.id))}
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition flex items-center gap-1 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white border border-ink-200 text-ink-700 hover:border-indigo-300'
              }`}
            >
              <span>{org.label}</span>
              {isSelected && <Check className="h-3 w-3" />}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSelectedMultiDomains((prev) => !prev)}
          className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition flex items-center gap-1 ${
            selectedMultiDomains
              ? 'bg-purple-600 text-white shadow-2xs'
              : 'bg-white border border-ink-200 text-ink-700 hover:border-purple-300'
          }`}
        >
          <span>Multiple Domains (2+)</span>
          {selectedMultiDomains && <Check className="h-3 w-3" />}
        </button>

        {(selectedCertDomains.length > 0 || selectedCertOrg || selectedMultiDomains) && (
          <button
            type="button"
            onClick={() => {
              setSelectedCertDomains([]);
              setSelectedCertOrg('');
              setSelectedMultiDomains(false);
            }}
            className="text-[11px] font-semibold text-red-600 hover:underline ml-2"
          >
            Reset Cert Filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-5 py-3 sm:px-6">
        <AdminTabs tabs={tabs} value={status} onChange={setStatus} />
        {filters.student && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pl-3 pr-1 text-[12.5px] font-medium text-primary-800">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
            {filters.student.name}
            <button
              type="button"
              onClick={() => setFilter('student', null)}
              aria-label={`Stop filtering by ${filters.student.name}`}
              className="rounded-full p-1 hover:bg-primary-100"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>

      {flash.node && <div className="px-5 pt-4 sm:px-6">{flash.node}</div>}

      {loading && submissions.length === 0 ? (
        <LoadingRow label="Loading submissions…" />
      ) : submissions.length === 0 ? (
        <EmptyRow
          icon={ClipboardCheck}
          title={filtered || status ? 'Nothing matches these filters' : 'No submissions yet'}
          description={filtered ? 'Try clearing a filter or choosing another status.' : undefined}
        />
      ) : (
        <div className={`divide-y divide-ink-100 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {submissions.map((submission) => {
            const meta = STATUS_META[submission.status] || STATUS_META.submitted;
            const draft = draftOf(submission);
            const maxScore = submission.assignmentId?.maxScore || 100;
            const late =
              submission.assignmentId?.dueDate && new Date(submission.createdAt) > new Date(submission.assignmentId.dueDate);
            const busy = savingId === submission.id;
            const learner = submission.studentId;

            return (
              <article key={submission.id} className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                      {submission.domain && (
                        <Pill tone={submission.domain === 'Python' ? 'blue' : submission.domain === 'SQL' ? 'cyan' : 'amber'}>
                          {submission.domain}
                        </Pill>
                      )}
                      <Pill tone="gray">{submission.taskCategory || submission.category}</Pill>
                      {submission.courseId?.title && <Pill tone="blue">{submission.courseId.title}</Pill>}
                      {late && <Pill tone="red">Submitted late</Pill>}

                      {/* Student asset indicators */}
                      {submission.studentAssets?.resume && (
                        <Pill tone="green">Resume: v{submission.studentAssets.resume.version}</Pill>
                      )}
                      {submission.studentAssets?.certifications?.length > 0 && (
                        <Pill tone="purple">{submission.studentAssets.certifications.length} Cert(s)</Pill>
                      )}
                      {submission.studentAssets?.portfolio?.aiConsultation?.documentUrl && (
                        <Pill tone="purple">AI Doc Uploaded</Pill>
                      )}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-ink-900">
                      {submission.assignmentId?.title || submission.title || 'Untitled submission'}
                    </p>
                    {submission.assignmentId && submission.title && (
                      <p className="text-[13px] font-medium text-ink-700">{submission.title}</p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px]">
                      {learner ? (
                        <Link to={`/admin/learners/${learner.id}`} className="font-medium text-primary-700 hover:text-primary-800">
                          {learner.name}
                        </Link>
                      ) : (
                        'Unknown learner'
                      )}
                      {learner?.email && <span className="text-ink-500">· {learner.email}</span>}
                      {learner && filters.student?.id !== learner.id && (
                        <button
                          type="button"
                          onClick={() => setFilter('student', { id: learner.id, name: learner.name })}
                          className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-500 transition hover:bg-primary-50 hover:text-primary-700"
                        >
                          <Filter className="h-3 w-3" aria-hidden="true" />
                          All by this student
                        </button>
                      )}
                    </p>
                    <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-600">{submission.description}</p>

                    {submission.studentAssets?.certifications?.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-ink-500 flex items-center gap-1">
                          <Award className="h-3 w-3 text-indigo-600" />
                          Credentials:
                        </span>
                        {submission.studentAssets.certifications.map((c, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.5 text-[10.5px] font-medium text-indigo-900"
                            title={`${c.name} (${c.issuingOrg})`}
                          >
                            <span className="font-semibold text-indigo-700">{c.domain}:</span>
                            <span className="truncate max-w-[160px]">{c.name}</span>
                            {c.certificationLevel && (
                              <span className="rounded bg-indigo-100/70 px-1 text-[9.5px] font-bold text-indigo-800">
                                {c.certificationLevel}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="mt-2 text-[11px] text-ink-400">
                      Submitted {formatDate(submission.createdAt, true)}
                      {submission.assignmentId?.dueDate ? ` · due ${formatDate(submission.assignmentId.dueDate, true)}` : ''}
                      {submission.reviewedAt && submission.status !== 'submitted' ? ` · reviewed ${formatDate(submission.reviewedAt, true)}` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {submission.datasetLink && (
                      <Button href={submission.datasetLink} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        Dataset
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {submission.sourceCodeLink && (
                      <Button href={submission.sourceCodeLink} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        Code Link
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {submission.sourceCodeFile && (
                      <Button href={resolveMediaUrl(submission.sourceCodeFile)} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        .sql File
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {submission.dashboardFile && (
                      <Button href={resolveMediaUrl(submission.dashboardFile)} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        Dashboard
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {submission.documentationFile && (
                      <Button href={resolveMediaUrl(submission.documentationFile)} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        Doc
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    )}
                    {submission.driveLink && !submission.datasetLink && !submission.sourceCodeLink && (
                      <Button href={submission.driveLink} target="_blank" rel="noopener noreferrer" size="sm" variant="secondary">
                        Open submission
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 rounded-lg border border-ink-100 bg-ink-50/50 p-4 md:grid-cols-[1fr_9rem]">
                  <div>
                    <label className="field-label" htmlFor={`feedback-${submission.id}`}>Feedback to the learner</label>
                    <textarea
                      id={`feedback-${submission.id}`}
                      className="field-input min-h-[70px] resize-y bg-white"
                      value={draft.feedback ?? submission.feedback ?? ''}
                      onChange={(e) => setDraft(submission, { feedback: e.target.value })}
                      maxLength={2000}
                      placeholder="What was good, what to change…"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`score-${submission.id}`}>Score / {maxScore}</label>
                    <input
                      id={`score-${submission.id}`}
                      type="number"
                      min={0}
                      max={maxScore}
                      className="field-input bg-white"
                      value={draft.score ?? (submission.score ?? '')}
                      onChange={(e) => setDraft(submission, { score: e.target.value })}
                      placeholder="—"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <Button size="sm" loading={busy} disabled={busy} onClick={() => handleReview(submission, 'accepted')}>
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {submission.status === 'accepted' ? 'Save — completed' : 'Mark completed'}
                    </Button>
                    <Button size="sm" variant="secondary" loading={busy} disabled={busy} onClick={() => handleReview(submission, 'needs_revision')}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {submission.status === 'needs_revision' ? 'Save — needs changes' : 'Request changes'}
                    </Button>
                    {submission.status === 'submitted' && (
                      <Button size="sm" variant="ghost" loading={busy} disabled={busy} onClick={() => handleReview(submission, 'under_review')}>
                        Mark reviewing
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
