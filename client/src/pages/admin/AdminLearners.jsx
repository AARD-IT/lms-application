import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  Filter,
  GraduationCap,
  Mail,
  MoreVertical,
  Phone,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  Trash2,
  X,
} from 'lucide-react';
import { deleteLearner, getCourses, getLearners, setLearnerStatus, toErrorMessage } from '../../api/client';
import { usePageMeta } from '../../components/layout/DashboardLayout.jsx';
import Modal from '../../components/common/Modal.jsx';
import {
  Alert,
  EmptyRow,
  Initials,
  LoadingRow,
  Pill,
  formatDate,
  formatMoney,
  timeAgo,
  useFlash,
} from '../../components/admin/ui.jsx';

const PROGRESS_OPTIONS = [
  ['not_enrolled', 'No course yet'],
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed all courses'],
];

const TASK_OPTIONS = [
  ['pending', 'Has tasks to submit'],
  ['overdue', 'Has overdue tasks'],
  ['all_done', 'Submitted every task'],
  ['awaiting_review', 'Waiting for review'],
  ['needs_revision', 'Needs changes'],
  ['none_submitted', 'Never submitted'],
];

const ACCESS_OPTIONS = [
  ['full', 'Full Access'],
  ['courses', 'Selected courses'],
  ['materials', 'Shared materials'],
  ['none', 'No access yet'],
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function AdminLearners() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const flash = useFlash();

  const [learners, setLearners] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(params.get('search') || '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [copiedId, setCopiedId] = useState(null);

  // Active dropdown menu for row actions
  const [openActionId, setOpenActionId] = useState(null);
  const actionMenuRef = useRef(null);

  // Status toggle (Suspend / Reactivate) modal state
  const [statusModal, setStatusModal] = useState({
    open: false,
    learner: null,
    targetStatus: 'suspended',
    reason: '',
    loading: false,
  });

  // Delete account confirmation modal state
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    learner: null,
    confirmationInput: '',
    loading: false,
  });

  const handleDeleteLearner = async () => {
    if (!deleteModal.learner) return;
    if (deleteModal.confirmationInput.trim() !== 'DELETE') {
      flash.error('Please type DELETE to confirm account deletion.');
      return;
    }

    setDeleteModal((prev) => ({ ...prev, loading: true }));
    try {
      const res = await deleteLearner(deleteModal.learner.id || deleteModal.learner._id);
      flash.success(res.message || `Learner ${deleteModal.learner.name} was successfully deleted.`);
      setDeleteModal({ open: false, learner: null, confirmationInput: '', loading: false });
      loadLearners();
    } catch (err) {
      flash.error(toErrorMessage(err));
      setDeleteModal((prev) => ({ ...prev, loading: false }));
    }
  };

  usePageMeta('Learners', 'Registered learners, course access, and learning progress.');

  const filters = useMemo(
    () => ({
      search: params.get('search') || '',
      courseId: params.get('courseId') || '',
      status: params.get('status') || '',
      payment: params.get('payment') || '',
      access: params.get('access') || '',
      progress: params.get('progress') || '',
      tasks: params.get('tasks') || '',
    }),
    [params]
  );

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const clearAllFilters = () => {
    setQuery('');
    setParams({}, { replace: true });
    setPage(1);
  };

  // Close row action dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setOpenActionId(null);
      }
    };
    if (openActionId) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openActionId]);

  // Load courses once for filter dropdown
  useEffect(() => {
    getCourses().then(setCourses).catch(() => {});
  }, []);

  // Debounce search query input
  useEffect(() => {
    const id = setTimeout(() => {
      if (query !== filters.search) {
        setFilter('search', query.trim());
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Fetch learners list
  const loadLearners = useCallback(() => {
    setLoading(true);
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    getLearners(active)
      .then((rows) => {
        setLearners(rows);
        setError('');
      })
      .catch((err) => setError(toErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => {
    loadLearners();
  }, [loadLearners]);

  // Dynamic statistics calculated from backend data (no hardcoded metrics)
  const totals = useMemo(() => {
    const total = learners.length;
    const active = learners.filter((l) => l.status !== 'suspended').length;
    const suspended = learners.filter((l) => l.status === 'suspended').length;
    const enrolled = learners.filter((l) => l.fullAccess || (l.courseCount || 0) > 0).length;
    const paymentPending = learners.filter((l) => (l.pendingPayments || 0) > 0).length;
    const overdueTasks = learners.filter((l) => (l.tasksOverdue || 0) > 0).length;
    const completedAll = learners.filter((l) => l.progressState === 'completed').length;

    return {
      total,
      active,
      suspended,
      enrolled,
      paymentPending,
      overdueTasks,
      completedAll,
    };
  }, [learners]);

  // Count active filter parameters (excluding search)
  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) => k !== 'search' && Boolean(v)).length;
  }, [filters]);

  const hasAnyFilter = Boolean(filters.search || activeFilterCount > 0);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(learners.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedLearners = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return learners.slice(start, start + pageSize);
  }, [learners, currentPage, pageSize]);

  // Copy email helper
  const handleCopy = (text, id) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Status toggle handler (Suspend / Reactivate)
  const handleStatusToggle = async () => {
    const { learner, targetStatus, reason } = statusModal;
    if (!learner) return;

    setStatusModal((prev) => ({ ...prev, loading: true }));
    try {
      await setLearnerStatus(learner.id || learner._id, targetStatus, reason);
      flash.success(
        targetStatus === 'suspended'
          ? `${learner.name} has been suspended.`
          : `${learner.name}'s account has been reactivated.`
      );
      setStatusModal({ open: false, learner: null, targetStatus: 'suspended', reason: '', loading: false });
      loadLearners();
    } catch (err) {
      flash.error(toErrorMessage(err) || 'Failed to update account status.');
      setStatusModal((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header with Title and Professional Description */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Learners</h1>
          <p className="mt-1 text-[13.5px] text-ink-500">
            Monitor registered learner profiles, course access authorizations, progress, assignments, and payments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadLearners}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 shadow-sm transition hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
            title="Refresh learner list"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-primary-600' : 'text-ink-500'}`} />
            Refresh
          </button>
        </div>
      </div>

      {flash.node}
      <Alert tone="error">{error}</Alert>

      {/* 2. Dynamic Real-Data Statistics Header */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Learners */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-primary-200">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-500">Total Learners</span>
            <span className="rounded-lg bg-primary-50 p-1.5 text-primary-600">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-ink-900">{totals.total}</p>
          <p className="mt-1 text-[11px] text-ink-400">
            {hasAnyFilter ? 'Matching current filters' : 'Registered on LMS'}
          </p>
        </div>

        {/* Active Learners */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-500">Active Accounts</span>
            <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-600">{totals.active}</p>
          <p className="mt-1 text-[11px] text-emerald-700/80">Regular access allowed</p>
        </div>

        {/* Suspended Learners */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-red-200">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-500">Suspended</span>
            <span className="rounded-lg bg-red-50 p-1.5 text-red-600">
              <UserX className="h-4 w-4" />
            </span>
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${totals.suspended > 0 ? 'text-red-600' : 'text-ink-900'}`}>
            {totals.suspended}
          </p>
          <p className="mt-1 text-[11px] text-ink-400">
            {totals.suspended > 0 ? 'Sign-in currently blocked' : 'Zero suspended accounts'}
          </p>
        </div>

        {/* Course Access */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-primary-200">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-500">Course Access</span>
            <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
              <GraduationCap className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-primary-700">{totals.enrolled}</p>
          <p className="mt-1 text-[11px] text-ink-400">Authorized or enrolled</p>
        </div>

        {/* Payment Pending */}
        <div className="col-span-2 rounded-xl border border-ink-100 bg-white p-4 shadow-sm transition hover:border-amber-200 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-ink-500">Payment Pending</span>
            <span className="rounded-lg bg-amber-50 p-1.5 text-amber-600">
              <CreditCard className="h-4 w-4" />
            </span>
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${totals.paymentPending > 0 ? 'text-amber-600' : 'text-ink-900'}`}>
            {totals.paymentPending}
          </p>
          <p className="mt-1 text-[11px] text-ink-400">
            {totals.paymentPending > 0 ? 'Requires admin verification' : 'All payments settled'}
          </p>
        </div>
      </section>

      {/* 3. Search and Multi-Filter Controls */}
      <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Top Search Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                className="w-full rounded-xl border border-ink-200 bg-ink-50/40 py-2.5 pl-10 pr-9 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="Search learners by name, email, or phone number..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
                  aria-label="Clear search input"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 hover:text-ink-900"
              >
                <RotateCcw className="h-3.5 w-3.5 text-ink-400" />
                Reset Filters
              </button>
            )}
          </div>

          {/* Filter Dropdowns Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Account Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Account Status
              </label>
              <select
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.status}
                onChange={(e) => setFilter('status', e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
              </select>
            </div>

            {/* Payment Status Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Payment Status
              </label>
              <select
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.payment}
                onChange={(e) => setFilter('payment', e.target.value)}
              >
                <option value="">All Payments</option>
                <option value="paid">Has Paid</option>
                <option value="pending">Pending Payment</option>
                <option value="failed">Failed Payment</option>
                <option value="none">No Payments</option>
              </select>
            </div>

            {/* Course Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Course
              </label>
              <select
                className="h-10 w-full truncate rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.courseId}
                onChange={(e) => setFilter('courseId', e.target.value)}
              >
                <option value="">All Courses</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Access Type Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Access Type
              </label>
              <select
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.access}
                onChange={(e) => setFilter('access', e.target.value)}
              >
                <option value="">All Access Types</option>
                {ACCESS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Progress
              </label>
              <select
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.progress}
                onChange={(e) => setFilter('progress', e.target.value)}
              >
                <option value="">All Progress</option>
                {PROGRESS_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tasks Filter */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1">
                Tasks
              </label>
              <select
                className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-[13px] text-ink-800 transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                value={filters.tasks}
                onChange={(e) => setFilter('tasks', e.target.value)}
              >
                <option value="">All Task States</option>
                {TASK_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Learner Table Container (Desktop / Tablet) */}
      <div className="rounded-2xl border border-ink-100 bg-white shadow-sm overflow-hidden">
        {/* Table Header Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-5 py-3.5 bg-ink-50/40">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-900">
              Learner Records
            </span>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600 tabular-nums">
              {learners.length}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-500">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-medium text-ink-800 focus:outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <LoadingRow label="Loading registered learners..." />
        ) : learners.length === 0 ? (
          <EmptyRow
            icon={Users}
            title={hasAnyFilter ? 'No learners match these filter criteria' : 'No learners registered yet'}
            description={
              hasAnyFilter
                ? 'Try adjusting your search terms or clearing one or more active filters.'
                : 'New student registrations will immediately appear in this table.'
            }
            action={
              hasAnyFilter ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700"
                >
                  Clear All Filters
                </button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden sm:block overflow-x-auto scrollbar-slim">
              <table className="w-full text-left text-sm border-collapse min-w-[72rem]">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-[11.5px] font-semibold uppercase tracking-wider text-ink-500">
                    <th scope="col" className="py-3 pl-6 pr-4 min-w-[13.5rem]">
                      Learner
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[12.5rem]">
                      Contact
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[8rem]">
                      Courses
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[9.5rem]">
                      Progress
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[8.5rem]">
                      Tasks
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[8.5rem]">
                      Payments
                    </th>
                    <th scope="col" className="py-3 px-4 min-w-[7rem]">
                      Joined
                    </th>
                    <th scope="col" className="py-3 pl-4 pr-6 text-right min-w-[6.5rem]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {paginatedLearners.map((learner) => {
                    const isSuspended = learner.status === 'suspended';
                    const hasTasks = (learner.tasksAssigned || 0) > 0;
                    const hasPayments =
                      (learner.paidCount || 0) > 0 ||
                      (learner.pendingPayments || 0) > 0 ||
                      (learner.failedPayments || 0) > 0;

                    return (
                      <tr
                        key={learner.id || learner._id}
                        className="group transition-colors hover:bg-slate-50/70"
                      >
                        {/* 1. Learner Column */}
                        <td className="py-3.5 pl-6 pr-4">
                          <div className="flex items-center gap-3">
                            <Initials name={learner.name} size="md" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/admin/learners/${learner.id || learner._id}`}
                                  className="truncate font-semibold text-ink-900 group-hover:text-primary-700 transition"
                                >
                                  {learner.name}
                                </Link>
                                {isSuspended ? (
                                  <Pill tone="red">Suspended</Pill>
                                ) : (
                                  <Pill tone="green">Active</Pill>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-ink-400">
                                {learner.lastActiveAt
                                  ? `Active ${timeAgo(learner.lastActiveAt)}`
                                  : 'No activity yet'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* 2. Contact Column */}
                        <td className="py-3.5 px-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 group/email">
                              <span
                                className="truncate text-[13px] text-ink-800 max-w-[11.5rem]"
                                title={learner.email}
                              >
                                {learner.email}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopy(learner.email, learner.id || learner._id)}
                                className="opacity-0 group-hover/email:opacity-100 p-0.5 text-ink-400 hover:text-ink-600 transition"
                                title="Copy email address"
                              >
                                {copiedId === (learner.id || learner._id) ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <p className="mt-0.5 text-[11.5px] text-ink-500">
                              {learner.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-2.5 w-2.5 opacity-60" />
                                  {learner.phone}
                                </span>
                              ) : (
                                <span className="text-ink-400 italic">No phone</span>
                              )}
                            </p>
                          </div>
                        </td>

                        {/* 3. Courses Column */}
                        <td className="py-3.5 px-4">
                          {learner.activation?.packageName && (
                            <span className="inline-block px-1.5 py-0.5 mb-1 rounded bg-primary-50 text-[10.5px] font-semibold text-primary-700 ring-1 ring-primary-500/20">
                              {learner.activation.packageName}
                            </span>
                          )}
                          {learner.fullAccess ? (
                            <Pill tone="blue">Full Access</Pill>
                          ) : (
                            <div>
                              <span className="font-bold tabular-nums text-primary-700">
                                {learner.courseCount || 0}
                              </span>
                              <span className="text-[12px] text-ink-500">
                                {' '}
                                course{(learner.courseCount || 0) === 1 ? '' : 's'}
                              </span>
                              {(learner.materialCount || 0) > 0 && (
                                <p className="text-[11px] text-ink-400 mt-0.5">
                                  + {learner.materialCount} shared material
                                  {learner.materialCount === 1 ? '' : 's'}
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Learning Progress Column */}
                        <td className="py-3.5 px-4">
                          {learner.progressState === 'not_enrolled' ? (
                            <span className="text-xs text-ink-400">—</span>
                          ) : (
                            <div className="w-full max-w-[8.5rem]">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] font-semibold tabular-nums text-primary-700">
                                  {learner.progressPercent || 0}%
                                </span>
                                <span className="text-[10px] text-ink-400">
                                  {learner.completedLessons || 0}/{learner.totalLessons || 0} lessons
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                                <div
                                  className="h-full rounded-full bg-primary-600 transition-all duration-300"
                                  style={{ width: `${Math.min(100, learner.progressPercent || 0)}%` }}
                                />
                              </div>
                              {(learner.coursesCompleted || 0) > 0 && (
                                <p className="mt-1 text-[10.5px] font-medium text-emerald-600">
                                  ✓ {learner.coursesCompleted} course completed
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 5. Tasks Column */}
                        <td className="py-3.5 px-4">
                          {hasTasks ? (
                            <div className="flex flex-col gap-1 items-start">
                              <span className="text-xs font-medium tabular-nums text-ink-800">
                                {learner.tasksSubmitted || 0}/{learner.tasksAssigned} submitted
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {(learner.tasksOverdue || 0) > 0 && (
                                  <Pill tone="red">{learner.tasksOverdue} overdue</Pill>
                                )}
                                {(learner.awaitingReview || 0) > 0 && (
                                  <Pill tone="blue">{learner.awaitingReview} review</Pill>
                                )}
                                {(learner.needsRevision || 0) > 0 && (
                                  <Pill tone="amber">{learner.needsRevision} revision</Pill>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">
                              {learner.submissionCount
                                ? `${learner.submissionCount} submitted`
                                : 'No tasks'}
                            </span>
                          )}
                        </td>

                        {/* 6. Payments Column */}
                        <td className="py-3.5 px-4">
                          {hasPayments ? (
                            <div className="flex flex-col gap-1 items-start">
                              {(learner.paidTotal || 0) > 0 && (
                                <Pill tone="green">{formatMoney(learner.paidTotal)} paid</Pill>
                              )}
                              {(learner.pendingPayments || 0) > 0 && (
                                <Pill tone="amber">{learner.pendingPayments} pending</Pill>
                              )}
                              {(learner.failedPayments || 0) > 0 && (
                                <Pill tone="red">{learner.failedPayments} failed</Pill>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">—</span>
                          )}
                        </td>

                        {/* 7. Joined Column */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-[12.5px] text-ink-600">
                          {formatDate(learner.createdAt)}
                        </td>

                        {/* 8. Actions Column (Strictly NO Remove User) */}
                        <td className="py-3.5 pl-4 pr-6 text-right">
                          <div className="relative inline-block text-left" ref={openActionId === (learner.id || learner._id) ? actionMenuRef : null}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionId(
                                  openActionId === (learner.id || learner._id)
                                    ? null
                                    : (learner.id || learner._id)
                                );
                              }}
                              className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                              title="Learner management actions"
                              aria-label="Learner actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {openActionId === (learner.id || learner._id) && (
                              <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-ink-100 bg-white py-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95">
                                <Link
                                  to={`/admin/learners/${learner.id || learner._id}`}
                                  className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 hover:text-primary-700 transition"
                                  onClick={() => setOpenActionId(null)}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-ink-400" />
                                  View Full Profile
                                </Link>

                                <Link
                                  to={`/admin/learners/${learner.id || learner._id}#activation`}
                                  className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-ink-700 hover:bg-ink-50 hover:text-primary-700 transition"
                                  onClick={() => setOpenActionId(null)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5 text-primary-600" />
                                  Manage Activation
                                </Link>

                                <div className="my-1 border-t border-ink-100" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setStatusModal({
                                      open: true,
                                      learner,
                                      targetStatus: isSuspended ? 'active' : 'suspended',
                                      reason: '',
                                      loading: false,
                                    });
                                  }}
                                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium transition ${
                                    isSuspended
                                      ? 'text-emerald-700 hover:bg-emerald-50'
                                      : 'text-amber-700 hover:bg-amber-50'
                                  }`}
                                >
                                  {isSuspended ? (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                      Reactivate Account
                                    </>
                                  ) : (
                                    <>
                                      <UserX className="h-3.5 w-3.5 text-amber-600" />
                                      Suspend Account
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setDeleteModal({
                                      open: true,
                                      learner,
                                      confirmationInput: '',
                                      loading: false,
                                    });
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition border-t border-ink-100"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                  Delete Account
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Responsive Cards View (< sm) */}
            <div className="sm:hidden divide-y divide-ink-100">
              {paginatedLearners.map((learner) => {
                const isSuspended = learner.status === 'suspended';
                return (
                  <div key={learner.id || learner._id} className="p-4 space-y-3.5 bg-white">
                    {/* Header: Avatar, Name, Status, Joined */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Initials name={learner.name} size="md" />
                        <div>
                          <Link
                            to={`/admin/learners/${learner.id || learner._id}`}
                            className="font-semibold text-ink-900 hover:text-primary-600"
                          >
                            {learner.name}
                          </Link>
                          <p className="text-[11px] text-ink-400">
                            Joined {formatDate(learner.createdAt)}
                          </p>
                        </div>
                      </div>
                      {isSuspended ? (
                        <Pill tone="red">Suspended</Pill>
                      ) : (
                        <Pill tone="green">Active</Pill>
                      )}
                    </div>

                    {/* Contact Details */}
                    <div className="rounded-xl bg-ink-50/60 p-2.5 text-xs text-ink-700 space-y-1">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                        <span className="truncate">{learner.email}</span>
                      </div>
                      {learner.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-ink-400 shrink-0" />
                          <span>{learner.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Courses & Progress */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-ink-100 p-2.5">
                        <span className="text-[11px] font-medium text-ink-500">Course Access</span>
                        <p className="mt-1 font-semibold text-ink-900">
                          {learner.fullAccess
                            ? 'Full Access'
                            : `${learner.courseCount || 0} course${(learner.courseCount || 0) === 1 ? '' : 's'}`}
                        </p>
                      </div>

                      <div className="rounded-xl border border-ink-100 p-2.5">
                        <span className="text-[11px] font-medium text-ink-500">Progress</span>
                        <p className="mt-1 font-semibold text-primary-700 tabular-nums">
                          {learner.progressPercent || 0}% ({learner.completedLessons || 0}/{learner.totalLessons || 0})
                        </p>
                      </div>
                    </div>

                    {/* Status Badges (Tasks & Payments) */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {(learner.paidTotal || 0) > 0 && (
                        <Pill tone="green">{formatMoney(learner.paidTotal)} paid</Pill>
                      )}
                      {(learner.pendingPayments || 0) > 0 && (
                        <Pill tone="amber">{learner.pendingPayments} payment pending</Pill>
                      )}
                      {(learner.tasksOverdue || 0) > 0 && (
                        <Pill tone="red">{learner.tasksOverdue} overdue</Pill>
                      )}
                    </div>

                    {/* Mobile Action Buttons (NO Remove User) */}
                    <div className="flex items-center gap-2 pt-2 border-t border-ink-100">
                      <Link
                        to={`/admin/learners/${learner.id || learner._id}`}
                        className="flex-1 text-center rounded-lg border border-ink-200 bg-white py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                      >
                        View Profile
                      </Link>
                      <Link
                        to={`/admin/learners/${learner.id || learner._id}#activation`}
                        className="flex-1 text-center rounded-lg bg-primary-50 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                      >
                        Activation
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          setStatusModal({
                            open: true,
                            learner,
                            targetStatus: isSuspended ? 'active' : 'suspended',
                            reason: '',
                            loading: false,
                          })
                        }
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                          isSuspended
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        }`}
                      >
                        {isSuspended ? 'Activate' : 'Suspend'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteModal({
                            open: true,
                            learner,
                            confirmationInput: '',
                            loading: false,
                          })
                        }
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition"
                        title="Delete Account"
                        aria-label={`Delete ${learner.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 5. Pagination Controls Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-ink-100 px-5 py-3.5 bg-ink-50/40">
              <p className="text-xs text-ink-500">
                Showing{' '}
                <span className="font-semibold text-ink-800">
                  {learners.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-ink-800">
                  {Math.min(currentPage * pageSize, learners.length)}
                </span>{' '}
                of <span className="font-semibold text-ink-800">{learners.length}</span> learners
              </p>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>

                  <div className="flex items-center gap-1 px-1 text-xs font-medium text-ink-700">
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 6. Account Status Suspension / Reactivation Modal */}
      <Modal
        open={statusModal.open}
        onClose={() =>
          !statusModal.loading &&
          setStatusModal({ open: false, learner: null, targetStatus: 'suspended', reason: '', loading: false })
        }
        title={
          statusModal.targetStatus === 'suspended'
            ? `Suspend ${statusModal.learner?.name || 'Learner'}?`
            : `Reactivate ${statusModal.learner?.name || 'Learner'}?`
        }
        description={
          statusModal.targetStatus === 'suspended'
            ? 'Suspended learners are immediately signed out and blocked from logging into the platform until reactivated.'
            : 'Reactivating this learner will restore their access to authorized courses and allow platform login.'
        }
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={statusModal.loading}
              onClick={() =>
                setStatusModal({ open: false, learner: null, targetStatus: 'suspended', reason: '', loading: false })
              }
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={statusModal.loading}
              onClick={handleStatusToggle}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                statusModal.targetStatus === 'suspended'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {statusModal.loading
                ? 'Processing...'
                : statusModal.targetStatus === 'suspended'
                ? 'Confirm Suspension'
                : 'Confirm Reactivation'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {statusModal.targetStatus === 'suspended' && (
            <div>
              <label
                htmlFor="suspension-reason"
                className="block text-xs font-semibold text-ink-700 mb-1"
              >
                Suspension Reason (Optional)
              </label>
              <textarea
                id="suspension-reason"
                rows={3}
                value={statusModal.reason}
                onChange={(e) =>
                  setStatusModal((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="Provide context for suspending this learner account..."
                className="w-full rounded-xl border border-ink-200 bg-white p-3 text-xs text-ink-800 placeholder:text-ink-400 transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              />
            </div>
          )}

          <div className="rounded-xl bg-ink-50/70 p-3 text-xs text-ink-600">
            <p>
              <strong>Learner:</strong> {statusModal.learner?.name} ({statusModal.learner?.email})
            </p>
            <p className="mt-1">
              <strong>Current Status:</strong>{' '}
              <span className="capitalize">{statusModal.learner?.status || 'active'}</span>
            </p>
          </div>
        </div>
      </Modal>

      {/* 7. Delete Account Confirmation Modal */}
      <Modal
        open={deleteModal.open}
        onClose={() =>
          !deleteModal.loading &&
          setDeleteModal({ open: false, learner: null, confirmationInput: '', loading: false })
        }
        title="Delete Learner Account?"
        description="Deleting an account is a serious, irreversible action. Please review the details below before confirming."
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={deleteModal.loading}
              onClick={() =>
                setDeleteModal({ open: false, learner: null, confirmationInput: '', loading: false })
              }
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleteModal.loading || deleteModal.confirmationInput.trim() !== 'DELETE'}
              onClick={handleDeleteLearner}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-40"
            >
              {deleteModal.loading ? 'Deleting...' : 'Confirm Account Deletion'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-900 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <span>Warning: Destructive Action</span>
            </div>
            <p>
              This will permanently revoke all course access and single-device bindings for{' '}
              <strong>{deleteModal.learner?.name}</strong> ({deleteModal.learner?.email}).
            </p>
            <p className="text-[11px] text-red-700">
              Legitimate financial transactions and payment records are preserved according to data-retention and audit compliance standards.
            </p>
          </div>

          <div className="rounded-xl bg-ink-50/70 p-3 text-xs text-ink-700 space-y-1">
            <p>
              <strong>Learner Name:</strong> {deleteModal.learner?.name}
            </p>
            <p>
              <strong>Email Address:</strong> {deleteModal.learner?.email}
            </p>
            {deleteModal.learner?.phone && (
              <p>
                <strong>Phone:</strong> {deleteModal.learner?.phone}
              </p>
            )}
            <p>
              <strong>Current Status:</strong>{' '}
              <span className="capitalize font-medium">{deleteModal.learner?.status || 'active'}</span>
            </p>
          </div>

          <div>
            <label htmlFor="confirm-delete-input" className="block text-xs font-semibold text-ink-800 mb-1">
              To confirm deletion, type <span className="font-mono text-red-600 font-bold">DELETE</span> below:
            </label>
            <input
              id="confirm-delete-input"
              type="text"
              value={deleteModal.confirmationInput}
              onChange={(e) =>
                setDeleteModal((prev) => ({ ...prev, confirmationInput: e.target.value }))
              }
              placeholder="Type DELETE to confirm"
              className="w-full rounded-xl border border-ink-200 bg-white p-2.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
