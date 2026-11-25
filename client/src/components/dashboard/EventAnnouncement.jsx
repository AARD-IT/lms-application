import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  Radio,
  Sparkles,
  User,
  Video,
  X,
} from 'lucide-react';
import { getLatestEventAnnouncement } from '../../api/client';
import { useNotifications } from '../../context/NotificationContext.jsx';
import Button from '../common/Button.jsx';
import Badge from '../common/Badge.jsx';

export default function EventAnnouncement() {
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const { notifications, markRead } = useNotifications();

  useEffect(() => {
    let active = true;
    getLatestEventAnnouncement()
      .then((data) => {
        if (!active) return;
        if (data?.event) {
          const dismissedId = sessionStorage.getItem('dismissed_event_announcement');
          if (dismissedId === data.event._id) {
            setDismissed(true);
          }
          setEvent(data.event);
        }
      })
      .catch(() => {
        // Silently swallow errors
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading || !event || dismissed) return null;

  const starts = new Date(event.startsAt);
  const ends = event.endsAt ? new Date(event.endsAt) : null;
  const now = Date.now();
  const isOngoing = starts.getTime() <= now && (!ends || ends.getTime() >= now);

  const dateStr = starts.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const timeStr = starts.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const endTimeStr = ends
    ? ends.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  const timeSpan = endTimeStr ? `${timeStr} – ${endTimeStr}` : timeStr;

  const mode = (event.mode || 'online').toLowerCase();
  const modeLabels = {
    online: { label: 'Online Session', icon: Video, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    offline: { label: 'In-Person / Offline', icon: MapPin, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    hybrid: { label: 'Hybrid Session', icon: Sparkles, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  };
  const modeConfig = modeLabels[mode] || modeLabels.online;
  const ModeIcon = modeConfig.icon;

  // Check if there is an unread event notification for this event
  const matchingNotif = notifications.find(
    (n) => n.type === 'event' && (!n.read) && (n.link?.includes(event._id) || n.message?.includes(event.title))
  );

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('dismissed_event_announcement', event._id);
  };

  const handleViewEvent = () => {
    if (matchingNotif) {
      markRead(matchingNotif.id);
    }
    navigate(`/events?id=${event._id}`);
  };

  return (
    <section
      aria-label="New Event Announcement"
      className="relative overflow-hidden rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-900 via-ink-900 to-slate-900 p-5 text-white shadow-xl sm:p-6"
    >
      {/* Background ambient decorative shapes */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-primary-500/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-cyan-500/15 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-300 ring-1 ring-inset ring-primary-500/30">
              {isOngoing ? (
                <>
                  <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
                  <span className="text-emerald-300 font-bold">Live Now</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-amber-300 font-bold">New Event Announcement</span>
                </>
              )}
            </span>

            {matchingNotif && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase text-white shadow-sm">
                NEW
              </span>
            )}

            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${modeConfig.color}`}>
              <ModeIcon className="h-3 w-3" />
              {modeConfig.label}
            </span>
          </div>

          <div>
            <h3 className="text-lg font-bold tracking-tight text-white sm:text-xl md:text-2xl">
              {event.title}
            </h3>
            {event.summary && (
              <p className="mt-1 text-sm text-slate-300 line-clamp-2 max-w-3xl">
                {event.summary}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary-400" />
              {dateStr}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary-400" />
              {timeSpan}
            </span>
            {event.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary-400" />
                {event.location}
              </span>
            )}
            {event.host && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-primary-400" />
                Host: {event.host}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 pt-2 lg:pt-0">
          <Button
            type="button"
            variant="primary"
            onClick={handleViewEvent}
            className="shadow-md bg-primary-600 hover:bg-primary-500 text-white font-semibold"
          >
            View Event Details &rarr;
          </Button>

          {event.joinUrl && (
            <Button
              href={event.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              className="bg-white/10 text-white border-white/20 hover:bg-white/20 font-semibold"
            >
              Join Session
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss announcement"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
