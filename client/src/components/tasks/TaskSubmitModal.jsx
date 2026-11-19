import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Database,
  FileCode,
  FileText,
  Github,
  Link2,
  ListChecks,
  Loader2,
  Terminal,
  UploadCloud,
  X,
} from 'lucide-react';
import { createSubmission, uploadSubmissionFile, toErrorMessage } from '../../api/client';
import Button from '../common/Button.jsx';
import Input from '../common/Input.jsx';

/**
 * Structured Work Submission Modal
 * Dynamically conforms to the task's technical domain and configured deliverables.
 * Only deliverables marked as required by the admin are mandatory; optional remain optional.
 */
export default function TaskSubmitModal({
  open,
  onClose,
  task,
  onSuccess,
}) {
  const [form, setForm] = useState({
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
    customFields: {},
  });

  const [uploadingField, setUploadingField] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const domain = task?.domain || 'Python';

  useEffect(() => {
    if (!task) return;
    setForm({
      title: task.title || '',
      category: task.category || 'Project',
      description: '',
      datasetLink: '',
      sourceCodeLink: '',
      sourceCodeFile: '',
      dashboardFile: '',
      documentationFile: '',
      outputResults: '',
      screenshots: [],
      customFields: {},
    });
    setError('');
  }, [task, open]);

  if (!task) return null;

  const deliverables = Array.isArray(task.deliverables) ? task.deliverables : [];
  const requiredDeliverables = deliverables.filter((d) => d.required);

  const handleFileUpload = async (file, field) => {
    if (!file) return;
    setUploadingField(field);
    setError('');
    try {
      const res = await uploadSubmissionFile(file);
      const fileUrl = res.url || res.fileUrl || res.path;
      setForm((prev) => ({ ...prev, [field]: fileUrl }));
    } catch (err) {
      setError(`Upload failed: ${toErrorMessage(err)}`);
    } finally {
      setUploadingField('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Build structured deliverable data
      const deliverablesData = deliverables.map((d) => {
        const lbl = d.label.toLowerCase();
        let val = '';
        if (lbl.includes('dataset')) val = form.datasetLink;
        else if (lbl.includes('code') || lbl.includes('sql') || lbl.includes('script')) val = form.sourceCodeLink || form.sourceCodeFile;
        else if (lbl.includes('dashboard') || lbl.includes('pbix')) val = form.dashboardFile;
        else if (lbl.includes('doc')) val = form.documentationFile;
        else if (lbl.includes('output') || lbl.includes('result') || lbl.includes('kpi')) val = form.outputResults;
        else if (form.customFields[d.label]) val = form.customFields[d.label];

        return {
          label: d.label,
          value: val,
          fileUrl: form.customFields[`${d.label}_file`] || '',
        };
      });

      const payload = {
        assignmentId: task.id || task._id,
        domain: domain,
        category: domain,
        taskCategory: form.category,
        title: form.title,
        description: form.description || `Submission for assigned task: ${task.title}`,
        datasetLink: form.datasetLink,
        sourceCodeLink: form.sourceCodeLink,
        sourceCodeFile: form.sourceCodeFile,
        dashboardFile: form.dashboardFile,
        documentationFile: form.documentationFile,
        outputResults: form.outputResults,
        screenshots: form.screenshots,
        deliverablesData,
      };

      const created = await createSubmission(payload);
      onSuccess?.(created, task);
      onClose();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const DomainIcon = domain === 'SQL' ? Database : domain === 'Power BI' ? BarChart3 : Terminal;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink-950/60 backdrop-blur-xs"
          />

          {/* Modal Panel */}
          <motion.div
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`Submit Work for ${task.title}`}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative my-8 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-pop overflow-hidden"
          >
            {/* Modal Header */}
            <div className="border-b border-ink-100 bg-surface-muted/30 px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-50 text-primary-600">
                  <DomainIcon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-bold text-base text-ink-900 leading-snug">
                    Submit Work: {task.title}
                  </h3>
                  <p className="text-xs text-ink-500">
                    Fulfilling {domain} assignment • {requiredDeliverables.length} required deliverable(s)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body / Scrollable Form */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Deliverable Requirements Overview Banner */}
              {deliverables.length > 0 && (
                <div className="rounded-xl border border-primary-200/80 bg-primary-50/30 p-3.5 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-primary-800">
                    <ListChecks className="h-4 w-4" />
                    <span>Configured Assignment Deliverables:</span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {deliverables.map((d, i) => (
                      <li key={i} className="flex items-center gap-1.5 text-ink-700">
                        <span className={`h-1.5 w-1.5 rounded-full ${d.required ? 'bg-rose-500' : 'bg-slate-400'}`} />
                        <span className="font-semibold">{d.label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${d.required ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                          {d.required ? 'Required' : 'Optional'}
                        </span>
                        {d.description && <span className="text-ink-400 text-[11px]">— {d.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Title & Notes */}
              <div className="space-y-3">
                <Input
                  label="Submission Title *"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Week 4 - Optimized Queries Final"
                />

                <div>
                  <label className="field-label" htmlFor="submit-notes">
                    Notes / Approach Summary <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="submit-notes"
                    required
                    rows={2}
                    className="field-input text-xs resize-y"
                    placeholder="Briefly describe your solution, tools, and results..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>

              {/* Domain Deliverables */}
              {domain === 'Python' && (
                <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/20 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                    <Terminal className="h-4 w-4 text-blue-600" />
                    Python Deliverables
                  </h4>

                  <Input
                    label="Dataset Google Drive Link *"
                    required
                    icon={Link2}
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={form.datasetLink}
                    onChange={(e) => setForm({ ...form, datasetLink: e.target.value })}
                    hint="Set sharing access to 'Anyone with link - Viewer'"
                  />

                  <Input
                    label="Source Code GitHub / Drive Link *"
                    required
                    icon={Github}
                    type="url"
                    placeholder="https://github.com/... or https://drive.google.com/..."
                    value={form.sourceCodeLink}
                    onChange={(e) => setForm({ ...form, sourceCodeLink: e.target.value })}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Project Documentation (Optional)</label>
                      <div className="flex items-center gap-2">
                        <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="modal-py-doc">
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{uploadingField === 'documentationFile' ? 'Uploading...' : 'Upload PDF / Doc'}</span>
                        </label>
                        <input
                          id="modal-py-doc"
                          type="file"
                          accept=".pdf,.docx,.doc"
                          className="sr-only"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'documentationFile')}
                        />
                      </div>
                      {form.documentationFile && <p className="mt-1 text-[11px] text-emerald-600 truncate">✓ Document uploaded</p>}
                    </div>

                    <div>
                      <label className="field-label">Model Results / Outputs (Optional)</label>
                      <Input
                        placeholder="Link or summary metrics"
                        value={form.outputResults}
                        onChange={(e) => setForm({ ...form, outputResults: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {domain === 'SQL' && (
                <div className="space-y-4 rounded-xl border border-cyan-100 bg-cyan-50/20 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-900 flex items-center gap-1.5">
                    <Database className="h-4 w-4 text-cyan-600" />
                    SQL Deliverables
                  </h4>

                  <Input
                    label="Dataset / Schema Link *"
                    required
                    icon={Link2}
                    type="url"
                    placeholder="https://drive.google.com/... or DB link"
                    value={form.datasetLink}
                    onChange={(e) => setForm({ ...form, datasetLink: e.target.value })}
                    hint="Set sharing access to 'Anyone with link - Viewer'"
                  />

                  <div>
                    <label className="field-label">SQL Source Code Link or Upload (.sql) *</label>
                    <Input
                      icon={Github}
                      placeholder="https://github.com/... or Drive link"
                      value={form.sourceCodeLink}
                      onChange={(e) => setForm({ ...form, sourceCodeLink: e.target.value })}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <label className="btn btn-secondary cursor-pointer text-xs" htmlFor="modal-sql-file">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>{uploadingField === 'sourceCodeFile' ? 'Uploading...' : 'Upload .sql file'}</span>
                      </label>
                      <input
                        id="modal-sql-file"
                        type="file"
                        accept=".sql,.txt"
                        className="sr-only"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'sourceCodeFile')}
                      />
                      {form.sourceCodeFile && <span className="text-[11px] text-emerald-600 truncate">✓ .sql file uploaded</span>}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Execution Results Link / Summary</label>
                      <Input
                        placeholder="Results link or execution log"
                        value={form.outputResults}
                        onChange={(e) => setForm({ ...form, outputResults: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="field-label">Performance Comparison Doc (Optional)</label>
                      <div className="flex items-center gap-2">
                        <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="modal-sql-doc">
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{uploadingField === 'documentationFile' ? 'Uploading...' : 'Upload Notes'}</span>
                        </label>
                        <input
                          id="modal-sql-doc"
                          type="file"
                          accept=".pdf,.docx,.doc"
                          className="sr-only"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'documentationFile')}
                        />
                      </div>
                      {form.documentationFile && <p className="mt-1 text-[11px] text-emerald-600 truncate">✓ Doc uploaded</p>}
                    </div>
                  </div>
                </div>
              )}

              {domain === 'Power BI' && (
                <div className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/20 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <BarChart3 className="h-4 w-4 text-amber-600" />
                    Power BI Deliverables
                  </h4>

                  <Input
                    label="Dataset Google Drive Link *"
                    required
                    icon={Link2}
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={form.datasetLink}
                    onChange={(e) => setForm({ ...form, datasetLink: e.target.value })}
                    hint="Set sharing access to 'Anyone with link - Viewer'"
                  />

                  <div>
                    <label className="field-label">Power BI Dashboard (.pbix) File or Link *</label>
                    <Input
                      icon={Link2}
                      placeholder="Google Drive link or Power BI Web link"
                      value={form.dashboardFile}
                      onChange={(e) => setForm({ ...form, dashboardFile: e.target.value })}
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <label className="btn btn-secondary cursor-pointer text-xs" htmlFor="modal-pbix-file">
                        <UploadCloud className="h-3.5 w-3.5" />
                        <span>{uploadingField === 'dashboardFile' ? 'Uploading...' : 'Upload .pbix File'}</span>
                      </label>
                      <input
                        id="modal-pbix-file"
                        type="file"
                        accept=".pbix"
                        className="sr-only"
                        onChange={(e) => handleFileUpload(e.target.files[0], 'dashboardFile')}
                      />
                      {form.dashboardFile && form.dashboardFile.startsWith('/uploads') && (
                        <span className="text-[11px] text-emerald-600 truncate">✓ .pbix file uploaded</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="field-label">Executive Summary / KPI Notes</label>
                      <Input
                        placeholder="DAX measure summary or findings"
                        value={form.outputResults}
                        onChange={(e) => setForm({ ...form, outputResults: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="field-label">Dashboard PDF / Screenshots (Optional)</label>
                      <div className="flex items-center gap-2">
                        <label className="btn btn-secondary cursor-pointer w-full text-xs" htmlFor="modal-pbix-doc">
                          <UploadCloud className="h-3.5 w-3.5" />
                          <span>{uploadingField === 'documentationFile' ? 'Uploading...' : 'Upload PDF'}</span>
                        </label>
                        <input
                          id="modal-pbix-doc"
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg"
                          className="sr-only"
                          onChange={(e) => handleFileUpload(e.target.files[0], 'documentationFile')}
                        />
                      </div>
                      {form.documentationFile && <p className="mt-1 text-[11px] text-emerald-600 truncate">✓ Visual uploaded</p>}
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Action Footer */}
              <div className="pt-3 border-t border-ink-100 flex items-center justify-end gap-2.5">
                <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={submitting} className="gap-2">
                  <UploadCloud className="h-4 w-4" />
                  Submit Work
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
