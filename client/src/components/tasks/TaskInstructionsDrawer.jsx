import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileCode,
  FileText,
  FolderGit2,
  HelpCircle,
  Info,
  Layers,
  Link2,
  ListChecks,
  Sparkles,
  Target,
  Terminal,
  UploadCloud,
  X,
} from 'lucide-react';
import Button from '../common/Button.jsx';
import Badge from '../common/Badge.jsx';

/**
 * Standard curriculum defaults if a legacy task has no custom deliverables defined in DB.
 */
const DEFAULT_DOMAIN_DELIVERABLES = {
  Python: [
    { label: 'Dataset Google Drive link', required: true, description: 'Direct link to raw/cleaned dataset with Viewer permissions' },
    { label: 'Python Source Code (GitHub / Drive link)', required: true, description: 'Clean .py scripts or Jupyter notebook' },
    { label: 'Output / Model Results', required: false, description: 'Evaluation metrics, execution logs, or visualization plots' },
    { label: 'Project Documentation', required: false, description: 'Brief architecture summary or PDF report' },
  ],
  SQL: [
    { label: 'Database / Dataset Link', required: true, description: 'Link to SQL dump, DDL scripts, or database schema' },
    { label: 'Optimized SQL Queries (.sql or link)', required: true, description: 'Well-commented SQL queries containing indexes and CTEs' },
    { label: 'Query Execution Results', required: true, description: 'Output tables or screenshot evidence of execution plans' },
    { label: 'Performance Comparison & Notes', required: false, description: 'Before vs After indexing cost metrics' },
  ],
  'Power BI': [
    { label: 'Dataset Google Drive Link', required: true, description: 'Raw source spreadsheet or database extract' },
    { label: 'Power BI Dashboard File (.pbix upload or link)', required: true, description: 'Interactive .pbix file or Power BI Service link' },
    { label: 'Executive Summary & KPI Explanation', required: true, description: 'Document explaining business findings and DAX logic' },
    { label: 'Dashboard PDF Export & Screenshots', required: false, description: 'Visual export of all dashboard views' },
  ],
};

function formatDateTime(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(val) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function TaskInstructionsDrawer({
  open,
  onClose,
  task,
  onSubmitWork,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!task) return null;

  const domain = task.domain || 'Python';
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const submission = task.mySubmission;

  // Resolve deliverables (custom from DB or domain standard fallback)
  const deliverables =
    Array.isArray(task.deliverables) && task.deliverables.length > 0
      ? task.deliverables
      : DEFAULT_DOMAIN_DELIVERABLES[domain] || DEFAULT_DOMAIN_DELIVERABLES.Python;

  const resources = Array.isArray(task.resources) ? task.resources : [];

  // Domain Icon & styling
  const DomainIcon =
    domain === 'SQL' ? Database : domain === 'Power BI' ? BarChart3 : Terminal;
  const domainColor =
    domain === 'SQL'
      ? 'bg-cyan-50 text-cyan-700 border-cyan-200'
      : domain === 'Power BI'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-blue-50 text-blue-700 border-blue-200';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Drawer container aligned to the right */}
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-6 sm:pl-16">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={`Instructions for ${task.title}`}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="relative flex w-screen max-w-2xl sm:max-w-3xl flex-col bg-white shadow-2xl focus:outline-none"
            >
              {/* Top Drawer Header */}
              <div className="border-b border-ink-100 bg-surface-muted/30 px-6 py-5 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${domainColor}`}>
                      <DomainIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${domainColor}`}>
                          {domain}
                        </span>
                        {task.category && (
                          <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                            {task.category}
                          </span>
                        )}
                        {submission ? (
                          submission.status === 'accepted' ? (
                            <span className="rounded-md bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              Completed {typeof submission.score === 'number' ? `(${submission.score}/${task.maxScore || 100})` : ''}
                            </span>
                          ) : submission.status === 'needs_revision' ? (
                            <span className="rounded-md bg-amber-100 border border-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                              Needs Changes
                            </span>
                          ) : (
                            <span className="rounded-md bg-blue-100 border border-blue-200 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                              Under Review
                            </span>
                          )
                        ) : (
                          <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Pending Submission
                          </span>
                        )}
                      </div>

                      <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink-950 sm:text-2xl">
                        {task.title}
                      </h2>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg p-2 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 focus:outline-none"
                    aria-label="Close drawer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Subheader: Metadata Row (Due date, Assigned date, Max score) */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-600 border-t border-ink-100/70 pt-3">
                  <div className="flex items-center gap-1.5">
                    <CalendarClock className={`h-4 w-4 ${isOverdue ? 'text-red-600' : 'text-primary-600'}`} />
                    <span className="text-ink-500">Due:</span>
                    <span className={`font-semibold ${isOverdue ? 'text-red-600 font-bold' : 'text-ink-900'}`}>
                      {task.dueDate ? formatDateTime(task.dueDate) : 'No deadline'}
                    </span>
                    {isOverdue && (
                      <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        OVERDUE
                      </span>
                    )}
                  </div>

                  {task.createdAt && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-ink-400" />
                      <span className="text-ink-500">Assigned:</span>
                      <span className="font-semibold text-ink-900">{formatDateOnly(task.createdAt)}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <span className="text-ink-500">Max Score:</span>
                    <span className="font-semibold text-ink-900">{task.maxScore || 100} pts</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Instruction Body */}
              <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 space-y-7">
                {/* Section B: Task Objective */}
                <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-5">
                  <div className="flex items-center gap-2 text-blue-900">
                    <Target className="h-5 w-5 text-blue-600 shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Task Objective
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink-800">
                    {task.objective ||
                      task.description ||
                      'Develop and deliver a high-quality project adhering to industry best practices, clean architecture, and verifiable outputs.'}
                  </p>
                </div>

                {/* Section C: Detailed Instructions */}
                <div>
                  <div className="flex items-center gap-2 border-b border-ink-100 pb-2.5">
                    <FileText className="h-5 w-5 text-primary-600 shrink-0" />
                    <h3 className="text-base font-bold text-ink-900">
                      Detailed Instructions
                    </h3>
                  </div>

                  <div className="mt-3.5">
                    {task.detailedInstructions ? (
                      <div className="whitespace-pre-wrap rounded-xl border border-ink-100 bg-surface-muted/30 p-5 font-sans text-sm leading-relaxed text-ink-800">
                        {task.detailedInstructions}
                      </div>
                    ) : task.description ? (
                      <div className="whitespace-pre-wrap rounded-xl border border-ink-100 bg-surface-muted/30 p-5 font-sans text-sm leading-relaxed text-ink-800">
                        {task.description}
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50/50 p-5 text-xs text-ink-600">
                        <Info className="h-5 w-5 text-ink-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-ink-800 text-sm">Instructions not provided</h4>
                          <p className="mt-1 leading-relaxed">
                            The administrator or instructor has not provided detailed instructions for this task yet. Please reach out to your instructor or follow the general domain guidelines.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section D: Required & Optional Deliverables */}
                <div>
                  <div className="flex items-center justify-between border-b border-ink-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-5 w-5 text-primary-600 shrink-0" />
                      <h3 className="text-base font-bold text-ink-900">
                        Expected Deliverables
                      </h3>
                    </div>
                    <span className="text-xs text-ink-500">
                      {deliverables.filter((d) => d.required).length} Required
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-2.5">
                    {deliverables.map((deliv, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs hover:border-ink-200 transition"
                      >
                        <div className="mt-0.5 shrink-0">
                          <CheckCircle2
                            className={`h-4 w-4 ${deliv.required ? 'text-primary-600' : 'text-ink-300'}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-ink-900">
                              {deliv.label}
                            </span>
                            {deliv.required ? (
                              <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                Required
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                Optional
                              </span>
                            )}
                          </div>
                          {deliv.description && (
                            <p className="mt-1 text-xs text-ink-600 leading-normal">
                              {deliv.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section E: Resources & Reference Links */}
                <div>
                  <div className="flex items-center gap-2 border-b border-ink-100 pb-2.5">
                    <Link2 className="h-5 w-5 text-primary-600 shrink-0" />
                    <h3 className="text-base font-bold text-ink-900">
                      Resources & Reference Links
                    </h3>
                  </div>

                  <div className="mt-3.5 space-y-2">
                    {resources.length > 0 ? (
                      resources.map((res, idx) => (
                        <a
                          key={idx}
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs hover:border-primary-300 hover:bg-primary-50/20 transition"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary-50 text-primary-600 group-hover:bg-primary-100 transition shrink-0">
                              <ExternalLink className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-xs text-ink-900 group-hover:text-primary-700 truncate">
                                {res.title}
                              </p>
                              <p className="text-[11px] font-mono text-ink-400 truncate">
                                {res.url}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-primary-600 group-hover:translate-x-0.5 transition flex items-center gap-1 shrink-0">
                            Open <ExternalLink className="h-3 w-3" />
                          </span>
                        </a>
                      ))
                    ) : (
                      <div className="rounded-xl border border-ink-100 bg-surface-muted/30 p-4 text-xs text-ink-500 text-center">
                        No external reference links attached to this task.
                      </div>
                    )}
                  </div>
                </div>

                {/* Section F: Submission Guidelines */}
                <div className="rounded-xl border border-ink-200 bg-surface-muted/40 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-ink-900">
                    <AlertCircle className="h-5 w-5 text-primary-600 shrink-0" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">
                      Submission Guidelines
                    </h3>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                    <div className="rounded-lg bg-white p-3 border border-ink-100">
                      <span className="font-bold text-ink-800">Accepted Formats:</span>
                      <p className="mt-0.5 text-ink-600 font-mono text-[11.5px]">
                        {task.allowedFileTypes && task.allowedFileTypes.length > 0
                          ? Array.isArray(task.allowedFileTypes)
                            ? task.allowedFileTypes.join(', ')
                            : task.allowedFileTypes
                          : '.py, .ipynb, .sql, .pbix, .pdf, Google Drive links'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-white p-3 border border-ink-100">
                      <span className="font-bold text-ink-800">Max Upload Size:</span>
                      <p className="mt-0.5 text-ink-600 font-mono text-[11.5px]">
                        {task.maxFileSize || '50MB'} (use Drive links for larger datasets)
                      </p>
                    </div>
                  </div>

                  {task.submissionGuidelines ? (
                    <p className="text-xs text-ink-700 whitespace-pre-wrap leading-relaxed pt-1">
                      {task.submissionGuidelines}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-600 leading-relaxed pt-1">
                      Ensure all Google Drive and cloud links are set to <strong>"Anyone with the link – Viewer"</strong> so reviewers can inspect your deliverables without permission barriers.
                    </p>
                  )}
                </div>
              </div>

              {/* Fixed Bottom Action Bar */}
              <div className="border-t border-ink-100 bg-white px-6 py-4 sm:px-8 flex items-center justify-between gap-3 shadow-pop">
                <Button variant="secondary" onClick={onClose} size="sm">
                  Close
                </Button>

                <Button
                  onClick={() => {
                    onSubmitWork?.(task);
                  }}
                  size="sm"
                  className="gap-2"
                >
                  <UploadCloud className="h-4 w-4" />
                  {submission ? 'Update Work' : 'Submit Work'}
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
