import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Play, RotateCcw, X } from 'lucide-react';
import CourseThumbnail from './CourseThumbnail.jsx';

/**
 * Parses raw video URLs (YouTube, Vimeo, or direct media files) into an
 * embeddable structure for thumbnail preview.
 *
 * Supported formats:
 * - YouTube:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://m.youtube.com/watch?v=VIDEO_ID
 *   - https://www.youtube-nocookie.com/embed/VIDEO_ID
 * - Vimeo:
 *   - https://vimeo.com/VIDEO_ID
 *   - https://player.vimeo.com/video/VIDEO_ID
 * - Direct video files:
 *   - .mp4, .webm, .ogg, .ogv, .m4v, .mov
 */
export function parseVideoUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return null;

  let parsed;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube variants: youtu.be/<id>
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0].split('?')[0];
    if (id && /^[\w-]{11}$/.test(id)) {
      return {
        type: 'youtube',
        videoId: id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`,
      };
    }
  }

  // YouTube variants: youtube.com/{watch?v=, embed/, shorts/, v/}
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    let id = parsed.searchParams.get('v');
    if (!id) {
      const match = parsed.pathname.match(/^\/(?:embed|shorts|v)\/([\w-]+)/);
      if (match) id = match[1];
    }
    if (id && /^[\w-]{11}$/.test(id)) {
      return {
        type: 'youtube',
        videoId: id,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&playsinline=1`,
      };
    }
  }

  // Vimeo variants
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parsed.pathname.match(/(\d+)/)?.[1];
    if (id) {
      return {
        type: 'vimeo',
        videoId: id,
        embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
      };
    }
  }

  // Direct video file formats (.mp4, .webm, .ogg, .ogv, .m4v, .mov)
  if (/\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i.test(parsed.pathname)) {
    return {
      type: 'direct',
      src: parsed.href,
    };
  }

  return null;
}

/**
 * CourseThumbnailPreview:
 * Embeds an interactive preview player directly into the course card thumbnail.
 *
 * - Idle / Default: Displays standard thumbnail with a professional center play
 *   button and subtle hover animations if a preview video exists.
 * - Playing: Seamlessly replaces thumbnail in-place (exact 16:9, no layout shift),
 *   stopping background link navigation. Provides play, pause, volume, fullscreen
 *   controls, close/back control, and top-bar action button.
 * - Single-player coordination: Dispatches and listens for custom window events so
 *   only one video plays at a time across all cards.
 * - Completion: Displays preview-completed overlay with "View Course" or "Enroll Now"
 *   action and replay button.
 * - Fallback: If no preview URL or invalid URL, renders standard thumbnail without
 *   interactive play action.
 */
export default function CourseThumbnailPreview({
  course,
  href,
  isEnrolled = false,
  children,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);

  const videoConfig = parseVideoUrl(course?.introVideoUrl);
  const courseId = course?._id;

  // Single active video coordination: pause this card if another card starts playing
  useEffect(() => {
    if (!courseId) return;

    const handleOtherPlay = (event) => {
      if (event.detail?.courseId && event.detail.courseId !== courseId) {
        setIsPlaying(false);
        setIsCompleted(false);
        setHasError(false);
      }
    };

    window.addEventListener('lms:course-preview-play', handleOtherPlay);
    return () => {
      window.removeEventListener('lms:course-preview-play', handleOtherPlay);
    };
  }, [courseId]);

  // Listen to YouTube embed messages for completion (state 0 = ended)
  useEffect(() => {
    if (!isPlaying || videoConfig?.type !== 'youtube') return;

    const handleMessage = (event) => {
      if (!event.origin.includes('youtube')) return;

      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (data?.event === 'infoDelivery' && data?.info?.playerState === 0) {
        setIsCompleted(true);
      } else if (data?.event === 'onStateChange' && (data?.info === 0 || data?.data === 0)) {
        setIsCompleted(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isPlaying, videoConfig]);

  const handleStartPlay = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Broadcast play event so any other currently playing preview stops
    window.dispatchEvent(
      new CustomEvent('lms:course-preview-play', {
        detail: { courseId },
      })
    );

    setIsPlaying(true);
    setIsCompleted(false);
    setHasError(false);
  };

  const handleClose = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsPlaying(false);
    setIsCompleted(false);
    setHasError(false);
  };

  const handleReplay = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setIsCompleted(false);
    setHasError(false);
    setIsPlaying(true);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleVideoEnded = () => {
    setIsCompleted(true);
  };

  const actionLabel = isEnrolled ? 'View Course' : 'Enroll Now';

  // If no preview URL exists or it cannot be parsed into a video format,
  // render the standard thumbnail without interactive video controls.
  if (!videoConfig) {
    return (
      <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-ink-100">
        <CourseThumbnail course={course} />
        {children}
      </div>
    );
  }

  return (
    <div className="group/thumb relative aspect-[16/9] shrink-0 overflow-hidden bg-ink-900">
      {/* 1. Base Thumbnail */}
      <CourseThumbnail
        course={course}
        className={`transition-opacity duration-300 ${
          isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      />

      {/* 2. Idle State: Center Play Button and Badges */}
      {!isPlaying && !isCompleted && (
        <>
          <button
            type="button"
            onClick={handleStartPlay}
            aria-label={`Preview intro video for ${course.title}`}
            title={`Preview intro video for ${course.title}`}
            className="group/btn absolute inset-0 z-10 flex items-center justify-center bg-black/15
                       transition-colors duration-200 hover:bg-black/35 focus:outline-none"
          >
            <span
              className="grid h-14 w-14 place-items-center rounded-full bg-white/95 text-primary-700
                         shadow-xl backdrop-blur-sm transition-all duration-200 ease-out
                         group-hover/btn:scale-110 group-hover/btn:bg-white group-active/btn:scale-95"
            >
              <Play className="h-6 w-6 translate-x-0.5 fill-current" aria-hidden="true" />
            </span>
            <span
              className="absolute bottom-3 right-3 rounded-md bg-ink-950/75 px-2 py-0.5 text-[11px]
                         font-medium text-white shadow-sm backdrop-blur-sm transition group-hover/btn:bg-ink-950/90"
            >
              Preview
            </span>
          </button>
          {children}
        </>
      )}

      {/* 3. Playing State: Video Player & Controls */}
      {isPlaying && !isCompleted && (
        <div
          className="absolute inset-0 z-20 flex h-full w-full flex-col bg-black"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar: In-preview Action & Close Button */}
          <div className="absolute inset-x-2.5 top-2.5 z-30 flex items-center justify-between gap-2 pointer-events-auto">
            <Link
              to={href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-700/90 px-3 py-1
                         text-xs font-semibold text-white shadow-md backdrop-blur-sm transition
                         hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-white"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="h-3 w-3" />
            </Link>

            <button
              type="button"
              onClick={handleClose}
              aria-label="Close preview and return to thumbnail"
              title="Close preview"
              className="grid h-7 w-7 place-items-center rounded-full bg-black/75 text-white
                         shadow-md backdrop-blur-sm transition hover:bg-black hover:text-white
                         focus:outline-none focus:ring-2 focus:ring-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Active Video Surface */}
          <div className="relative h-full w-full">
            {hasError ? (
              <div className="flex h-full w-full flex-col items-center justify-center p-4 text-center text-white">
                <AlertCircle className="mb-2 h-7 w-7 text-amber-400" />
                <p className="text-xs font-medium text-ink-100">Unable to load preview video.</p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    to={href}
                    className="rounded bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-500"
                  >
                    {actionLabel}
                  </Link>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded bg-ink-800 px-3 py-1 text-xs text-ink-200 hover:text-white"
                  >
                    Back to card
                  </button>
                </div>
              </div>
            ) : videoConfig.type === 'youtube' ? (
              <iframe
                ref={iframeRef}
                src={videoConfig.embedUrl}
                title={`${course.title} preview`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => {
                  try {
                    iframeRef.current?.contentWindow?.postMessage(
                      JSON.stringify({ event: 'listening' }),
                      '*'
                    );
                  } catch {
                    // Safe cross-origin ignore
                  }
                }}
                className="h-full w-full border-0"
              />
            ) : videoConfig.type === 'vimeo' ? (
              <iframe
                src={videoConfig.embedUrl}
                title={`${course.title} preview`}
                allow="autoplay; fullscreen"
                allowFullScreen
                className="h-full w-full border-0"
              />
            ) : (
              // HTML5 native video for direct media files (.mp4, .webm, etc.)
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                ref={videoRef}
                src={videoConfig.src}
                controls
                autoPlay
                playsInline
                onEnded={handleVideoEnded}
                onError={() => setHasError(true)}
                className="h-full w-full bg-black object-contain"
              />
            )}
          </div>
        </div>
      )}

      {/* 4. Preview Completed State */}
      {isCompleted && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink-950/92
                     p-4 text-center text-white backdrop-blur-md"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close preview completed view"
            title="Close"
            className="absolute top-2.5 right-2.5 grid h-7 w-7 place-items-center rounded-full
                       bg-white/10 text-white transition hover:bg-white/20 focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>

          <span className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>

          <h4 className="text-sm font-bold text-white">Preview Complete</h4>
          <p className="mt-1 line-clamp-1 text-xs text-ink-300">
            {isEnrolled ? 'Resume learning this course' : 'Ready to start learning?'}
          </p>

          <div className="mt-4 flex w-full max-w-[210px] flex-col gap-2">
            <Link
              to={href}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600
                         py-2 text-xs font-semibold text-white shadow transition
                         hover:bg-primary-500 active:scale-[0.98]"
            >
              <span>{actionLabel}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex items-center justify-center gap-1 text-[11px] font-medium
                         text-ink-300 transition hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Watch again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
