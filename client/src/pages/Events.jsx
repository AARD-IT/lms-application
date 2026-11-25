import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Presentation,
  Radio,
  Sparkles,
  User as UserIcon,
  Video,
  X,
} from 'lucide-react';
import { getEvent, getEvents, toErrorMessage } from '../api/client';
import { usePageMeta } from '../components/layout/DashboardLayout.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import Badge from '../components/common/Badge.jsx';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import RichText from '../components/common/RichText.jsx';
import Skeleton from '../components/common/Skeleton.jsx';
import Tabs from '../components/common/Tabs.jsx';
import { ErrorState } from '../components/States.jsx';
import { hasRichText } from '../utils/sanitize.js';

const TYPES = {
  webinar: { label: 'Webinar', icon: Video, tone: 'primary' },
  workshop: { label: 'Workshop', icon: Presentation, tone: 'success' },
  program: { label: 'Program', icon: CalendarDays, tone: 'warning' },
  placement: { label: 'Placement', icon: UserIcon, tone: 'neutral' },
  other: { label: 'Event', icon: CalendarClock, tone: 'neutral' },
};

const SCOPES = [
  { value: 'all', label: 'All Events' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'past', label: 'Past Events' },
];

const MODES = {
  online: { label: 'Online', icon: Video, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  offline: { label: 'In-Person / Offline', icon: MapPin, color: 'bg-amber-50 text-amber-700 border-amber-200' },
  hybrid: { label: 'Hybrid', icon: Sparkles, color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const dateFormat = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
const timeFormat = { hour: '2-digit', minute: '2-digit' };

/** "in 3 days" / "tomorrow" / "today" — how soon this is. */
function countdown(startsAt) {
  const ms = new Date(startsAt).getTime() - Date.now();
  if (ms < 0) return null;

  const days = Math.floor(ms / 86400000);
  if (days === 0) {
    const hours = Math.floor(ms / 3600000);
    return hours <= 1 ? 'starting soon' : `in ${hours} hours`;
  }
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  return null;
}

function EventDetailsModal({ event, onClose }) {
  if (!event) return null;

  const starts = new Date(event.startsAt);
  const ends = event.endsAt ? new Date(event.endsAt) : null;
  const now = Date.now();
  const isOngoing = starts.getTime() <= now && (!ends || ends.getTime() >= now);

  const { label: typeLabel, icon: TypeIcon, tone } = TYPES[event.type] || TYPES.other;
  const modeKey = (event.mode || 'online').toLowerCase();
  const modeInfo = MODES[modeKey] || MODES.online;
  const ModeIcon = modeInfo.icon;

  const timeRange = ends
    ? `${starts.toLocaleTimeString('en-GB', timeFormat)} – ${ends.toLocaleTimeString('en-GB', timeFormat)}`
    : starts.toLocaleTimeString('en-GB', timeFormat);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-ink-900/60 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {isOngoing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-600" />
              Live Now
            </span>
          ) : null}
          <Badge tone={tone} icon={TypeIcon}>
            {typeLabel}
          </Badge>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${modeInfo.color}`}>
            <ModeIcon className="h-3 w-3" />
            {modeInfo.label}
          </span>
        </div>

        <h2 className="mt-3 text-xl font-bold text-ink-900 sm:text-2xl leading-snug">
          {event.title}
        </h2>

        {event.summary && (
          <p className="mt-2 text-sm text-ink-600 leading-relaxed font-medium">
            {event.summary}
          </p>
        )}

        <div className="mt-5 grid gap-3 rounded-xl border border-ink-100 bg-surface-muted p-4 sm:grid-cols-2 text-xs">
          <div className="flex items-center gap-2.5 text-ink-700">
            <Calendar className="h-4 w-4 text-primary-600 shrink-0" />
            <span>
              <strong>Date:</strong> {starts.toLocaleDateString('en-GB', dateFormat)}
            </span>
          </div>

          <div className="flex items-center gap-2.5 text-ink-700">
            <Clock className="h-4 w-4 text-primary-600 shrink-0" />
            <span>
              <strong>Time:</strong> {timeRange}
            </span>
          </div>

          {event.location && (
            <div className="flex items-center gap-2.5 text-ink-700">
              <MapPin className="h-4 w-4 text-primary-600 shrink-0" />
              <span>
                <strong>Venue/Location:</strong> {event.location}
              </span>
            </div>
          )}

          {event.host && (
            <div className="flex items-center gap-2.5 text-ink-700">
              <UserIcon className="h-4 w-4 text-primary-600 shrink-0" />
              <span>
                <strong>Instructor / Host:</strong> {event.host}
              </span>
            </div>
          )}
        </div>

        {hasRichText(event.descriptionHtml) && (
          <div className="mt-6 border-t border-ink-100 pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">
              Event Details &amp; Agenda
            </h4>
            <RichText html={event.descriptionHtml} className="text-sm" />
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink-100 pt-5">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>

          {event.joinUrl ? (
            <Button
              href={event.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              className="bg-primary-600 text-white font-semibold shadow-md"
            >
              Join Session Now
              <ExternalLink className="h-4 w-4 ml-1" />
            </Button>
          ) : event.joinUrlAvailableAt ? (
            <span className="text-xs text-ink-500 font-medium">
              Joining link will be unlocked on{' '}
              {new Date(event.joinUrlAvailableAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}

function EventCard({ event, onOpenModal, isUnread }) {
  const { label, icon: Icon, tone } = TYPES[event.type] || TYPES.other;
  const starts = new Date(event.startsAt);
  const ends = event.endsAt ? new Date(event.endsAt) : null;
  const now = Date.now();
  const isOngoing = starts.getTime() <= now && (!ends || ends.getTime() >= now);
  const soon = countdown(event.startsAt);

  const modeKey = (event.mode || 'online').toLowerCase();
  const modeInfo = MODES[modeKey] || MODES.online;
  const ModeIcon = modeInfo.icon;

  const timeRange = ends
    ? `${starts.toLocaleTimeString('en-GB', timeFormat)} – ${ends.toLocaleTimeString('en-GB', timeFormat)}`
    : starts.toLocaleTimeString('en-GB', timeFormat);

  const isRecent = now - new Date(event.createdAt || event.startsAt).getTime() < 3 * 24 * 60 * 60 * 1000;

  return (
    <article className={`card flex flex-col gap-4 p-5 sm:flex-row sm:items-start transition hover:shadow-md ${
      isUnread ? 'ring-2 ring-amber-400/80 bg-amber-50/10' : ''
    }`}>
      {/* Date block, so a list of events scans by date down the left edge. */}
      <div className="flex shrink-0 flex-row items-center gap-3 sm:w-20 sm:flex-col sm:gap-0 sm:text-center">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
          {starts.toLocaleDateString('en-GB', { month: 'short' })}
        </span>
        <span className="text-2xl font-bold leading-none tabular-nums text-ink-900">
          {starts.getDate()}
        </span>
        <span className="text-[11px] text-ink-500 sm:mt-0.5">
          {starts.toLocaleDateString('en-GB', { weekday: 'short' })}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {isOngoing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-800">
              <Radio className="h-3 w-3 animate-pulse text-emerald-600" />
              Live Now
            </span>
          ) : null}

          {(isUnread || isRecent) && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              NEW
            </span>
          )}

          <Badge tone={tone} icon={Icon}>
            {label}
          </Badge>

          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${modeInfo.color}`}>
            <ModeIcon className="h-3 w-3" />
            {modeInfo.label}
          </span>

          {soon && <Badge tone="warning">{soon}</Badge>}
        </div>

        <h3 className="mt-2.5 text-base font-semibold leading-snug text-ink-900">
          {event.title}
        </h3>

        {event.summary && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-600 line-clamp-2">
            {event.summary}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {starts.toLocaleDateString('en-GB', dateFormat)} · {timeRange}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {event.location}
            </span>
          )}
          {event.host && (
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {event.host}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:self-center">
        <Button size="sm" variant="secondary" onClick={() => onOpenModal(event)}>
          View Details
        </Button>

        {event.joinUrl ? (
          <Button href={event.joinUrl} target="_blank" rel="noopener noreferrer" size="sm" variant="primary">
            Join
            <ExternalLink className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
          </Button>
        ) : event.joinUrlAvailableAt ? (
          <p className="max-w-[9rem] text-[11px] leading-relaxed text-ink-500 text-center">
            Link opens{' '}
            {new Date(event.joinUrlAvailableAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState('all');
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { notifications, markRead } = useNotifications();

  usePageMeta('Upcoming Events', 'Webinars, workshops and scheduled programmes.');

  const eventIdParam = searchParams.get('id');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    getEvents(scope)
      .then((data) => {
        if (cancelled) return;
        setEvents(data);
        setStatus('ready');

        // Check if query param id needs to open modal
        if (eventIdParam) {
          const target = data.find((e) => e._id === eventIdParam || e.id === eventIdParam);
          if (target) {
            handleOpenModal(target);
          } else {
            getEvent(eventIdParam)
              .then((item) => {
                if (!cancelled && item) handleOpenModal(item);
              })
              .catch(() => {});
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toErrorMessage(err));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [scope, eventIdParam]);

  const handleOpenModal = (evt) => {
    setSelectedEvent(evt);
    // Mark matching unread event notification as read
    const matchingNotifs = notifications.filter(
      (n) => n.type === 'event' && !n.read && (n.link?.includes(evt._id) || n.message?.includes(evt.title))
    );
    for (const notif of matchingNotifs) {
      markRead(notif.id);
    }
  };

  const handleCloseModal = () => {
    setSelectedEvent(null);
    if (searchParams.get('id')) {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  };

  /** Grouped under a month heading so a long list stays readable. */
  const grouped = useMemo(() => {
    const buckets = new Map();
    for (const event of events) {
      const key = new Date(event.startsAt).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(event);
    }
    return [...buckets.entries()];
  }, [events]);

  if (status === 'error') return <ErrorState message={error} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Upcoming Events &amp; Sessions</h2>
        <p className="mt-1 text-sm text-ink-500">
          Webinars, workshops, placement drives and scheduled programmes.
        </p>
      </div>

      <Tabs tabs={SCOPES} value={scope} onChange={setScope} />

      {status === 'loading' ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-card" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={scope === 'past' ? 'No past events' : 'Nothing scheduled yet'}
          description={
            scope === 'past'
              ? 'Events that have already taken place will be listed here.'
              : 'When your instructors schedule a webinar, workshop or programme, it will show up here.'
          }
          action={<Button to="/dashboard">Back to dashboard</Button>}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([month, items]) => (
            <section key={month}>
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                {month}
              </h3>
              <div className="space-y-4">
                {items.map((event) => {
                  const isUnread = notifications.some(
                    (n) => n.type === 'event' && !n.read && (n.link?.includes(event._id) || n.message?.includes(event.title))
                  );
                  return (
                    <EventCard
                      key={event._id || event.id}
                      event={event}
                      onOpenModal={handleOpenModal}
                      isUnread={isUnread}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedEvent && (
          <EventDetailsModal event={selectedEvent} onClose={handleCloseModal} />
        )}
      </AnimatePresence>
    </div>
  );
}
