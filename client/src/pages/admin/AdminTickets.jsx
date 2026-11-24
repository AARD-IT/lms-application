import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  LifeBuoy,
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Tag,
  Ticket,
  User,
  X,
  XCircle,
} from 'lucide-react';
import {
  adminReplyToTicket,
  getAdminTickets,
  getAdminTicketStats,
  getTicket,
  toErrorMessage,
  updateTicketStatus,
} from '../../api/client';

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

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  under_review: { label: 'Under Review', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  awaiting_student_response: { label: 'Awaiting Student Response', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-100 text-slate-700 border-slate-200' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${config.color}`}>
      {config.label}
    </span>
  );
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    under_review: 0,
    awaiting_student_response: 0,
    resolved: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Selected ticket for details modal
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusNote, setStatusNote] = useState('');
  const [newStatusSelection, setNewStatusSelection] = useState('');

  // Reply state
  const [replyMessage, setReplyMessage] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (techFilter !== 'all') params.technology = techFilter;
      if (search.trim()) params.search = search.trim();
      if (fromDate) params.from = fromDate;
      if (toDate) params.to = toDate;

      const [ticketsRes, statsRes] = await Promise.all([
        getAdminTickets(params),
        getAdminTicketStats(),
      ]);

      setTickets(ticketsRes?.tickets || []);
      if (statsRes?.stats) setStats(statsRes.stats);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to load tickets.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, techFilter, fromDate, toDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  const openTicketModal = async (ticket) => {
    setSelectedTicket(ticket);
    setNewStatusSelection(ticket.status);
    setStatusNote('');
    setReplyMessage('');
    setReplyStatus('');
    setActionError('');
    setActionSuccess('');

    try {
      setLoadingDetails(true);
      const res = await getTicket(ticket._id);
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setNewStatusSelection(res.ticket.status);
      }
    } catch (err) {
      console.error('Failed to load full ticket details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket || !newStatusSelection) return;
    try {
      setStatusUpdating(true);
      setActionError('');
      setActionSuccess('');

      const res = await updateTicketStatus(selectedTicket._id, {
        status: newStatusSelection,
        note: statusNote.trim(),
      });

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setActionSuccess(`Status updated to ${STATUS_CONFIG[newStatusSelection]?.label || newStatusSelection}`);
        setStatusNote('');
        // Refresh stats & ticket in list
        setTickets((prev) => prev.map((t) => (t._id === res.ticket._id ? res.ticket : t)));
        getAdminTicketStats().then((s) => s?.stats && setStats(s.stats));
      }
    } catch (err) {
      setActionError(toErrorMessage(err, 'Failed to update ticket status.'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleSendAdminReply = async (e) => {
    e.preventDefault();
    if (!selectedTicket || !replyMessage.trim()) return;

    try {
      setSendingReply(true);
      setActionError('');
      setActionSuccess('');

      const payload = { message: replyMessage.trim() };
      if (replyStatus) payload.newStatus = replyStatus;

      const res = await adminReplyToTicket(selectedTicket._id, payload);

      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setReplyMessage('');
        setReplyStatus('');
        setActionSuccess('Reply sent and student notified via email.');
        // Refresh list
        setTickets((prev) => prev.map((t) => (t._id === res.ticket._id ? res.ticket : t)));
        getAdminTicketStats().then((s) => s?.stats && setStats(s.stats));
      }
    } catch (err) {
      setActionError(toErrorMessage(err, 'Failed to send reply.'));
    } finally {
      setSendingReply(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTechFilter('all');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Support Ticket Management
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Review technical queries, inspect Google Drive proof documents, respond to learners and resolve tickets.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50 sm:self-center"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary-600' : ''}`} />
          <span>Refresh Tickets</span>
        </button>
      </div>

      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Total Tickets</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{stats.total}</p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Open</p>
          <p className="mt-1 text-2xl font-bold text-blue-900">{stats.open}</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Under Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{stats.under_review}</p>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">Awaiting Response</p>
          <p className="mt-1 text-2xl font-bold text-purple-900">{stats.awaiting_student_response}</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Resolved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">{stats.resolved}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Closed</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{stats.closed}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
        <form onSubmit={handleSearchSubmit} className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Search Input */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500">Search</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ID, student name, email..."
                className="block w-full rounded-lg border border-ink-200 py-1.5 pl-8 pr-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            </div>
          </div>

          {/* Technology Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500">Technology</label>
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-ink-200 py-1.5 px-2.5 text-xs text-ink-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="all">All Technologies</option>
              {TECHNOLOGIES.map((tech) => (
                <option key={tech} value={tech}>{tech}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-ink-200 py-1.5 px-2.5 text-xs text-ink-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="under_review">Under Review</option>
              <option value="awaiting_student_response">Awaiting Response</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-ink-200 py-1 px-2 text-xs text-ink-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-500">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-ink-200 py-1 px-2 text-xs text-ink-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        </form>

        {(search || statusFilter !== 'all' || techFilter !== 'all' || fromDate || toDate) && (
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-2.5 text-xs">
            <span className="text-ink-500">Filters active</span>
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-primary-600 hover:text-primary-700 hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>

      {/* Ticket Management Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
            <p className="text-xs text-ink-500">Loading support tickets...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-2 text-sm font-semibold text-red-800">{error}</p>
            <button
              type="button"
              onClick={loadData}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-10 text-center">
            <Ticket className="mx-auto h-10 w-10 text-ink-300" />
            <h3 className="mt-2 text-sm font-bold text-ink-900">No support tickets found</h3>
            <p className="mt-1 text-xs text-ink-500">
              Try modifying your search or filter parameters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
              <thead className="bg-ink-50/70 font-semibold text-ink-700">
                <tr>
                  <th scope="col" className="px-4 py-3.5">Ticket ID</th>
                  <th scope="col" className="px-4 py-3.5">Student</th>
                  <th scope="col" className="px-4 py-3.5">Email</th>
                  <th scope="col" className="px-4 py-3.5">Technology</th>
                  <th scope="col" className="px-4 py-3.5">Issue Summary</th>
                  <th scope="col" className="px-4 py-3.5">Status</th>
                  <th scope="col" className="px-4 py-3.5">Submitted On</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 font-normal text-ink-700">
                {tickets.map((ticket) => (
                  <tr key={ticket._id} className="transition hover:bg-ink-50/40">
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="font-mono font-bold text-primary-700">
                        {ticket.ticketId}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium text-ink-900">
                      <Link
                        to={`/admin/learners/${ticket.studentId}`}
                        className="hover:text-primary-600 hover:underline"
                        title="View learner profile"
                      >
                        {ticket.studentName}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-500">
                      {ticket.studentEmail}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-800">
                        {ticket.technology}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3.5" title={ticket.issueDescription}>
                      {ticket.issueDescription}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-500">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openTicketModal(ticket)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>View Details</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket Details & Review Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-900/60 p-3 sm:p-6 backdrop-blur-sm">
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-ink-200 bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-600 text-white shadow-sm">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-ink-900">
                      {selectedTicket.ticketId}
                    </span>
                    <StatusBadge status={selectedTicket.status} />
                  </div>
                  <p className="text-xs text-ink-500">
                    Technology: <strong>{selectedTicket.technology}</strong> &bull; Submitted {formatDate(selectedTicket.createdAt)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Feedback Alert */}
              {actionError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Grid: Section A & Section B */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Section A: Student Information */}
                <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Section A &bull; Student Information
                  </h3>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Student Name:</dt>
                      <dd className="font-semibold text-ink-900">{selectedTicket.studentName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Student Email:</dt>
                      <dd className="font-semibold text-ink-900">{selectedTicket.studentEmail}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Student ID:</dt>
                      <dd className="font-mono text-ink-600">
                        {String(selectedTicket.studentId?._id || selectedTicket.studentId)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 border-t border-ink-200/60 pt-2 text-right">
                    <Link
                      to={`/admin/learners/${selectedTicket.studentId?._id || selectedTicket.studentId}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:underline"
                    >
                      <span>Open Full Student Profile</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {/* Section B: Ticket Information */}
                <div className="rounded-xl border border-ink-200 bg-ink-50/40 p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Section B &bull; Ticket Details
                  </h3>
                  <dl className="mt-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Ticket ID:</dt>
                      <dd className="font-mono font-bold text-primary-700">{selectedTicket.ticketId}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Technology:</dt>
                      <dd className="font-semibold text-ink-900">{selectedTicket.technology}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Current Status:</dt>
                      <dd><StatusBadge status={selectedTicket.status} /></dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-ink-500">Submitted At:</dt>
                      <dd className="text-ink-700">{formatDate(selectedTicket.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Section C: Attached Proof (Google Drive) */}
              <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-primary-800">
                      Section C &bull; Attached Proof (Google Drive)
                    </h3>
                    <p className="mt-1 truncate text-xs text-ink-600 max-w-lg" title={selectedTicket.proofDriveLink}>
                      {selectedTicket.proofDriveLink}
                    </p>
                  </div>

                  <a
                    href={selectedTicket.proofDriveLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
                  >
                    <span>Open Proof in New Tab</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              {/* Issue Description */}
              <div className="rounded-xl border border-ink-200 bg-white p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                  Full Issue Description
                </h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                  {selectedTicket.issueDescription}
                </p>
              </div>

              {/* Section D: Ticket Status Management */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Section D &bull; Ticket Status Management
                </h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  Changing status triggers an automated email notification to the student.
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={newStatusSelection}
                    onChange={(e) => setNewStatusSelection(e.target.value)}
                    className="rounded-lg border border-ink-200 bg-white py-1.5 px-3 text-xs text-ink-900 focus:border-primary-500 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="under_review">Under Review</option>
                    <option value="awaiting_student_response">Awaiting Student Response</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>

                  <input
                    type="text"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Optional note for student / internal record..."
                    className="flex-1 rounded-lg border border-ink-200 bg-white py-1.5 px-3 text-xs text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={handleUpdateStatus}
                    disabled={statusUpdating || newStatusSelection === selectedTicket.status}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {statusUpdating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>Update Status</span>
                  </button>
                </div>
              </div>

              {/* Section E: Conversation History */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                    Section E &bull; Conversation History ({selectedTicket.messages?.length || 0})
                  </h3>
                  <span className="text-[11px] text-ink-400">
                    Chronological order
                  </span>
                </div>

                <div className="space-y-3.5">
                  {(selectedTicket.messages || []).map((msg, idx) => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg._id || idx}
                        className={`flex gap-3 rounded-xl p-4 ${
                          isAdmin
                            ? 'border border-primary-200 bg-primary-50/50'
                            : 'border border-ink-200 bg-ink-50/30'
                        }`}
                      >
                        <div
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            isAdmin ? 'bg-primary-600 text-white' : 'bg-ink-200 text-ink-700'
                          }`}
                        >
                          {isAdmin ? <ShieldCheck className="h-4 w-4" /> : <User className="h-4 w-4" />}
                        </div>

                        <div className="flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-ink-900">
                                {msg.senderName}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                  isAdmin
                                    ? 'bg-primary-100 text-primary-800'
                                    : 'bg-ink-200/60 text-ink-700'
                                }`}
                              >
                                {isAdmin ? 'Admin / Support' : 'Student'}
                              </span>
                            </div>
                            <span className="text-[11px] text-ink-400">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>

                          <p className="mt-1.5 whitespace-pre-wrap text-xs text-ink-800 leading-relaxed">
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section F: Admin Reply Form */}
              <form onSubmit={handleSendAdminReply} className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">
                  Section F &bull; Send Response to Student
                </h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  The student will immediately receive your response in LMS and an email notification with your reply.
                </p>

                <textarea
                  rows={4}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type your response to the student here..."
                  required
                  className="mt-3 block w-full rounded-xl border border-ink-200 p-3 text-xs text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-ink-600">Also update status to:</label>
                    <select
                      value={replyStatus}
                      onChange={(e) => setReplyStatus(e.target.value)}
                      className="rounded-lg border border-ink-200 bg-white py-1 px-2.5 text-xs text-ink-900 focus:border-primary-500 focus:outline-none"
                    >
                      <option value="">Keep current ({STATUS_CONFIG[selectedTicket.status]?.label || selectedTicket.status})</option>
                      <option value="awaiting_student_response">Awaiting Student Response</option>
                      <option value="under_review">Under Review</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingReply || !replyMessage.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingReply ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending Reply...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Reply</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-ink-100 bg-ink-50/40 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

