import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  LifeBuoy,
  Loader2,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  User,
  X,
} from 'lucide-react';
import { getMyTickets, getTicket, replyToTicket, toErrorMessage } from '../api/client';

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/10' },
  under_review: { label: 'Under Review', color: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/10' },
  awaiting_student_response: { label: 'Awaiting Your Response', color: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/10' },
  resolved: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/10' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10' },
};

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-500/10' };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${config.color}`}
    >
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

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected ticket for modal / details view
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getMyTickets();
      setTickets(data?.tickets || []);
    } catch (err) {
      setError(toErrorMessage(err, 'Failed to load your support tickets.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const openTicketDetails = async (ticket) => {
    setSelectedTicket(ticket);
    setReplyError('');
    setReplyMessage('');
    try {
      setLoadingDetails(true);
      const res = await getTicket(ticket._id);
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
      }
    } catch (err) {
      console.error('Failed to refresh ticket details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    try {
      setSendingReply(true);
      setReplyError('');
      const res = await replyToTicket(selectedTicket._id, { message: replyMessage.trim() });
      if (res?.ticket) {
        setSelectedTicket(res.ticket);
        setReplyMessage('');
        // Update ticket in local list too
        setTickets((prev) =>
          prev.map((t) => (t._id === res.ticket._id ? res.ticket : t))
        );
      }
    } catch (err) {
      setReplyError(toErrorMessage(err, 'Failed to send reply. Please try again.'));
    } finally {
      setSendingReply(false);
    }
  };

  // Tab counts
  const counts = useMemo(() => {
    const map = {
      all: tickets.length,
      open: 0,
      under_review: 0,
      awaiting_student_response: 0,
      resolved: 0,
      closed: 0,
    };
    tickets.forEach((t) => {
      if (map[t.status] !== undefined) {
        map[t.status] += 1;
      }
    });
    return map;
  }, [tickets]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (activeTab !== 'all' && t.status !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = t.ticketId?.toLowerCase().includes(q);
        const matchTech = t.technology?.toLowerCase().includes(q);
        const matchDesc = t.issueDescription?.toLowerCase().includes(q);
        return matchId || matchTech || matchDesc;
      }
      return true;
    });
  }, [tickets, activeTab, searchQuery]);

  return (
    <div className="container max-w-6xl py-6 lg:py-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-600">
            <Ticket className="h-4 w-4" />
            <span>Support Desk</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            My Support Tickets
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Track the progress of your queries, view mentor responses, and provide additional information.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadTickets}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary-600' : ''}`} />
            <span>Refresh</span>
          </button>

          <Link
            to="/raise-ticket"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Raise New Ticket</span>
          </Link>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="mt-6 flex flex-col gap-4 border-b border-ink-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Tickets' },
            { id: 'open', label: 'Open' },
            { id: 'under_review', label: 'Under Review' },
            { id: 'awaiting_student_response', label: 'Awaiting Response' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'closed', label: 'Closed' },
          ].map((tab) => {
            const count = counts[tab.id] || 0;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-ink-200/60 text-ink-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID or topic..."
            className="block w-full rounded-lg border border-ink-200 bg-white py-1.5 pl-8 pr-3 text-xs text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          <p className="text-xs text-ink-500">Loading your support tickets...</p>
        </div>
      ) : error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <p className="mt-2 text-sm font-semibold text-red-800">{error}</p>
          <button
            type="button"
            onClick={loadTickets}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-200 bg-ink-50/30 p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary-600">
            <Ticket className="h-6 w-6" />
          </div>
          <h3 className="mt-3 text-base font-bold text-ink-900">
            {searchQuery || activeTab !== 'all' ? 'No matching tickets found' : 'No tickets raised yet'}
          </h3>
          <p className="mt-1 text-xs text-ink-500 max-w-sm mx-auto">
            {searchQuery || activeTab !== 'all'
              ? 'Try adjusting your search keywords or clearing active status filters.'
              : 'Have any questions about lessons, assignments or software tools? Raise your first support ticket.'}
          </p>
          {searchQuery || activeTab !== 'all' ? (
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
              }}
              className="mt-4 rounded-lg border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
            >
              Clear Filters
            </button>
          ) : (
            <Link
              to="/raise-ticket"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Raise Ticket</span>
            </Link>
          )}
        </div>
      ) : (
        /* Tickets Table */
        <div className="mt-6 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
              <thead className="bg-ink-50/60 font-semibold text-ink-700">
                <tr>
                  <th scope="col" className="px-4 py-3.5">Ticket ID</th>
                  <th scope="col" className="px-4 py-3.5">Technology</th>
                  <th scope="col" className="px-4 py-3.5">Issue Summary</th>
                  <th scope="col" className="px-4 py-3.5">Status</th>
                  <th scope="col" className="px-4 py-3.5">Submitted On</th>
                  <th scope="col" className="px-4 py-3.5">Last Updated</th>
                  <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 font-normal text-ink-700">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket._id}
                    className="transition hover:bg-ink-50/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="font-mono font-bold text-primary-700">
                        {ticket.ticketId}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span className="inline-block rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-800">
                        {ticket.technology}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3.5" title={ticket.issueDescription}>
                      <span className="text-ink-900 font-medium">{ticket.issueDescription}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-500">
                      {formatDate(ticket.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-ink-500">
                      {formatDate(ticket.lastActivityAt || ticket.updatedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openTicketDetails(ticket)}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
                      >
                        <span>View Details</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ticket Details Modal / Slide-over Drawer */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-900/60 p-3 sm:p-6 backdrop-blur-sm">
          <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-ink-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-100 text-primary-700">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-primary-700">
                      {selectedTicket.ticketId}
                    </span>
                    <StatusBadge status={selectedTicket.status} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-500">
                    <span>{selectedTicket.technology}</span>
                    <span>&bull;</span>
                    <span>Submitted {formatDate(selectedTicket.createdAt)}</span>
                  </div>
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

            {/* Scrollable Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Proof Attachment Card */}
              <div className="flex flex-col gap-2 rounded-xl border border-primary-100 bg-primary-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary-700">
                    Google Drive Proof Link
                  </span>
                  <p className="mt-0.5 truncate text-xs text-ink-600 max-w-md" title={selectedTicket.proofDriveLink}>
                    {selectedTicket.proofDriveLink}
                  </p>
                </div>
                <a
                  href={selectedTicket.proofDriveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
                >
                  <span>Open Proof</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* Initial Issue Description */}
              <div className="rounded-xl border border-ink-100 bg-ink-50/40 p-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
                  Initial Issue Description
                </span>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-900">
                  {selectedTicket.issueDescription}
                </p>
              </div>

              {/* Conversation History */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink-900">
                    Conversation History ({selectedTicket.messages?.length || 0})
                  </h3>
                  <span className="text-xs text-ink-400">
                    Chronological messages
                  </span>
                </div>

                <div className="space-y-4">
                  {(selectedTicket.messages || []).map((msg, index) => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div
                        key={msg._id || index}
                        className={`flex gap-3 rounded-xl p-4 ${
                          isAdmin
                            ? 'border border-primary-200 bg-primary-50/50'
                            : 'border border-ink-100 bg-white'
                        }`}
                      >
                        <div
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                            isAdmin
                              ? 'bg-primary-600 text-white'
                              : 'bg-ink-200 text-ink-700'
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
                              {isAdmin && (
                                <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800">
                                  Mentor / Support
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-ink-400">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>

                          <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-800 leading-relaxed">
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Reply Form */}
              {selectedTicket.status === 'closed' ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-600">
                  This ticket has been marked as <strong>Closed</strong>. If you are experiencing a new problem, please{' '}
                  <Link to="/raise-ticket" className="font-semibold text-primary-600 underline">
                    raise a new support ticket
                  </Link>.
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-700">
                    Reply to Support
                  </h4>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Need to provide additional logs, code snippets or clarification? Reply directly here.
                  </p>

                  {replyError && (
                    <div className="mt-2 text-xs font-semibold text-red-600">
                      {replyError}
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply here..."
                    required
                    className="mt-2 block w-full rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={sendingReply || !replyMessage.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sendingReply ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Sending...</span>
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
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-ink-100 bg-ink-50/40 px-6 py-3">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

