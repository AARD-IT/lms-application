import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  LifeBuoy,
  Loader2,
  PlusCircle,
  Ticket,
} from 'lucide-react';
import { createTicket, toErrorMessage } from '../api/client';

const TECHNOLOGIES = [
  'Python',
  'SQL',
  'Power BI',
  'Data Analytics',
  'Data Science',
  'Machine Learning',
  'Generative AI',
  'Other',
];

const GOOGLE_DRIVE_REGEX = /https?:\/\/(drive|docs)\.google\.com\/[^\s]+/i;

export default function RaiseTicket() {
  const navigate = useNavigate();

  const [technology, setTechnology] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [proofDriveLink, setProofDriveLink] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdTicket, setCreatedTicket] = useState(null);

  const isValidDriveLink = GOOGLE_DRIVE_REGEX.test(proofDriveLink.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!technology) {
      setError('Please select the technology related to your issue.');
      return;
    }
    if (!issueDescription.trim() || issueDescription.trim().length < 10) {
      setError('Please provide a detailed description of the issue (at least 10 characters).');
      return;
    }
    if (!proofDriveLink.trim() || !isValidDriveLink) {
      setError('Please provide a valid Google Drive or Google Docs proof link.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await createTicket({
        technology,
        issueDescription: issueDescription.trim(),
        proofDriveLink: proofDriveLink.trim(),
      });

      if (res?.ticket) {
        setCreatedTicket(res.ticket);
      }
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to submit support ticket. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTechnology('');
    setIssueDescription('');
    setProofDriveLink('');
    setError('');
    setCreatedTicket(null);
  };

  return (
    <div className="container max-w-4xl py-6 lg:py-8">
      {/* Top Banner / Breadcrumb */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-600">
            <LifeBuoy className="h-4 w-4" />
            <span>Support Desk</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Raise a Support Ticket
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Encountered an issue with your coursework, tools or projects? Submit a ticket and our mentors will assist you.
          </p>
        </div>

        <Link
          to="/my-tickets"
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50 sm:self-center"
        >
          <Ticket className="h-4 w-4 text-primary-600" />
          <span>My Tickets</span>
        </Link>
      </div>

      {/* Success View */}
      {createdTicket ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <h2 className="mt-4 text-xl font-bold text-ink-900 sm:text-2xl">
              Support Ticket Submitted Successfully!
            </h2>

            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 font-mono text-sm font-bold text-primary-700">
              Ticket ID: {createdTicket.ticketId}
            </div>

            <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-600">
              Your ticket for <strong className="text-ink-900">{createdTicket.technology}</strong> has been assigned to our support team and mentors. We have notified our technical team and you will receive an email update once a mentor responds.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to={`/my-tickets`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
              >
                <span>View My Tickets</span>
                <ArrowRight className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Raise Another Ticket</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Ticket Form */
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Field 1: Technology */}
            <div>
              <label htmlFor="technology" className="block text-sm font-semibold text-ink-800">
                Technology <span className="text-red-500">*</span>
              </label>
              <p className="mt-0.5 text-xs text-ink-500">
                Select the course or technology domain related to your issue.
              </p>
              <select
                id="technology"
                value={technology}
                onChange={(e) => setTechnology(e.target.value)}
                required
                className="mt-2 block w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="" disabled>
                  -- Select Technology --
                </option>
                {TECHNOLOGIES.map((tech) => (
                  <option key={tech} value={tech}>
                    {tech}
                  </option>
                ))}
              </select>
            </div>

            {/* Field 2: Cause / Issue Description */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="issueDescription" className="block text-sm font-semibold text-ink-800">
                  Cause / Issue Description <span className="text-red-500">*</span>
                </label>
                <span className="text-xs text-ink-400">
                  {issueDescription.length} characters
                </span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                Clearly describe what happened, any error messages encountered, and the steps to reproduce.
              </p>
              <textarea
                id="issueDescription"
                rows={5}
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                required
                placeholder="Example: While running the Pandas merge command on exercise 4, I am encountering a KeyError on the customer_id column. Here is the code snippet I executed and the traceback..."
                className="mt-2 block w-full rounded-xl border border-ink-200 bg-white p-3.5 text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            {/* Field 3: Attach Proof (Google Drive Link) */}
            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="proofDriveLink" className="block text-sm font-semibold text-ink-800">
                  Attach Proof (Google Drive Link) <span className="text-red-500">*</span>
                </label>
                {isValidDriveLink && (
                  <a
                    href={proofDriveLink.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 hover:underline"
                  >
                    <span>View Proof</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <p className="mt-0.5 text-xs text-ink-500">
                Paste the Google Drive document, folder, or screenshot link proving the issue.
              </p>
              <div className="relative mt-2">
                <input
                  type="url"
                  id="proofDriveLink"
                  value={proofDriveLink}
                  onChange={(e) => setProofDriveLink(e.target.value)}
                  required
                  placeholder="https://drive.google.com/file/d/..."
                  className="block w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink-900 shadow-sm transition placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-ink-400">
                  <ExternalLink className="h-4 w-4" />
                </div>
              </div>

              {/* Viewer Access Instruction Notice */}
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="leading-relaxed">
                  <strong>Important:</strong> Please ensure your Google Drive link has{' '}
                  <span className="font-semibold underline">Viewer access</span> (&quot;Anyone with the link can view&quot;) so our support team and mentors can review your proof.
                </div>
              </div>
            </div>

            {/* Field 4: Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting Ticket...</span>
                  </>
                ) : (
                  <>
                    <LifeBuoy className="h-4 w-4" />
                    <span>Submit Ticket</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

