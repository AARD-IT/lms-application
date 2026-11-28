import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Heart,
  Hourglass,
  Key,
  Lock,
  PlayCircle,
  Users,
} from 'lucide-react';
import Badge from '../common/Badge.jsx';
import ProgressBar from '../common/ProgressBar.jsx';
import Rating from '../common/Rating.jsx';
import CourseThumbnailPreview from './CourseThumbnailPreview.jsx';
import { compactNumber, formatHours, formatPrice } from '../../utils/course.js';
import { COURSE_ACCESS_STATUS } from '../../constants';

/**
 * The one course card used by the catalogue, the landing page and the dashboard.
 *
 * `variant`:
 *   catalogue — public browsing: shows price / status, ratings, safe previews
 *   enrolled  — inside the dashboard: shows progress / activation state
 *
 * Dynamic accessStatus:
 *   - 'ACCESS_GRANTED'
 *   - 'ACTIVATION_PENDING'
 *   - 'PAYMENT_PENDING'
 *   - 'LOCKED'
 *   - 'SUSPENDED'
 */
export default function CourseCard({
  course,
  variant = 'catalogue',
  to,
  saved = false,
  onToggleSave,
}) {
  const isEnrolled = variant === 'enrolled';
  const isComplete = course.progress >= 100;
  const isSuspended = Boolean(course.isSuspended);

  const status =
    course.accessStatus ||
    (isSuspended
      ? COURSE_ACCESS_STATUS.SUSPENDED
      : course.hasAccess
        ? COURSE_ACCESS_STATUS.ACCESS_GRANTED
        : COURSE_ACCESS_STATUS.LOCKED);

  const defaultHref =
    status === COURSE_ACCESS_STATUS.ACTIVATION_PENDING
      ? '/activate'
      : isEnrolled
        ? `/my-courses/${course._id}`
        : `/courses/${course._id}`;

  const href = to || defaultHref;

  const duration = formatHours(course.hours);
  const students = compactNumber(course.studentsCount);

  return (
    <article className="card-interactive group relative flex h-full min-w-0 flex-col overflow-hidden">
      <CourseThumbnailPreview course={course} href={href} isEnrolled={isEnrolled}>
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          {course.category ? (
            <Badge tone="overlay">{course.category}</Badge>
          ) : (
            <Badge tone="overlay">{course.level}</Badge>
          )}

          {onToggleSave && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave(course._id);
              }}
              aria-pressed={saved}
              aria-label={saved ? `Remove ${course.title} from wishlist` : `Save ${course.title} to wishlist`}
              className="relative z-10 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-ink-600
                         backdrop-blur transition hover:bg-white hover:text-red-600"
            >
              <Heart className={`h-4 w-4 ${saved ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
          )}
        </div>

        {isSuspended || status === COURSE_ACCESS_STATUS.SUSPENDED ? (
          <span className="absolute bottom-3 left-3">
            <Badge tone="error" icon={Lock}>
              Access Suspended
            </Badge>
          </span>
        ) : status === COURSE_ACCESS_STATUS.ACTIVATION_PENDING ? (
          <span className="absolute bottom-3 left-3">
            <Badge tone="warning" icon={Key}>
              Activation Pending
            </Badge>
          </span>
        ) : status === COURSE_ACCESS_STATUS.PAYMENT_PENDING ? (
          <span className="absolute bottom-3 left-3">
            <Badge tone="warning" icon={Hourglass}>
              Payment Verification Pending
            </Badge>
          </span>
        ) : status === COURSE_ACCESS_STATUS.ACCESS_GRANTED ? (
          <span className="absolute bottom-3 left-3">
            {isComplete ? (
              <Badge tone="success" icon={CheckCircle2}>
                Completed
              </Badge>
            ) : (
              <Badge tone="success" icon={CheckCircle2}>
                Access Granted
              </Badge>
            )}
          </span>
        ) : (
          <span className="absolute bottom-3 left-3">
            <Badge tone="overlay" icon={Lock}>
              Locked
            </Badge>
          </span>
        )}
      </CourseThumbnailPreview>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[15px] font-semibold leading-snug text-ink-900">
            <Link to={href} className="after:absolute after:inset-0 hover:text-primary-700">
              {course.title}
            </Link>
          </h3>
          {status !== COURSE_ACCESS_STATUS.ACCESS_GRANTED && !isEnrolled && (
            <span className="shrink-0 text-right">
              <span className="block text-sm font-bold text-primary-700">
                {formatPrice(course.price)}
              </span>
              {course.originalPrice > course.price && (
                <span className="block text-[11px] text-ink-400 line-through">
                  {formatPrice(course.originalPrice)}
                </span>
              )}
            </span>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-ink-600">
          {course.summary || course.description}
        </p>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-500">
          {course.lessonCount ? (
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {course.lessonCount} {course.lessonCount === 1 ? 'lesson' : 'lessons'}
            </span>
          ) : null}
          {duration && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {duration}
            </span>
          )}
          {students && (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {students}
            </span>
          )}
        </div>

        {/* Pinned action footer */}
        <div className="mt-auto pt-4">
          {status === COURSE_ACCESS_STATUS.SUSPENDED ? (
            <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-red-600">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Access Suspended
            </p>
          ) : status === COURSE_ACCESS_STATUS.ACTIVATION_PENDING ? (
            <div className="space-y-2 border-t border-ink-100 pt-3.5">
              <p className="text-[12px] font-medium leading-snug text-amber-800">
                Payment verified. Activate device using your 4-digit PIN to access.
              </p>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                  <Key className="h-3.5 w-3.5" /> PIN Required
                </span>
                <Link
                  to="/activate"
                  className="relative z-10 inline-flex items-center gap-1 text-[13px] font-semibold text-amber-700 hover:text-amber-800"
                >
                  Activate Access <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : status === COURSE_ACCESS_STATUS.PAYMENT_PENDING ? (
            <div className="space-y-2 border-t border-ink-100 pt-3.5">
              <p className="text-[12px] font-medium leading-snug text-amber-800">
                Payment received. Awaiting admin manual verification before activation.
              </p>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                  <Hourglass className="h-3.5 w-3.5" /> Under Review
                </span>
                <Link
                  to={`/courses/${course._id}`}
                  className="relative z-10 inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 hover:text-primary-800"
                >
                  View Status <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : status === COURSE_ACCESS_STATUS.ACCESS_GRANTED ? (
            isEnrolled ? (
              <>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-600">
                    {course.completedLessons ?? 0} of {course.lessonCount ?? 0} lessons
                  </span>
                  <span className="font-semibold tabular-nums text-ink-900">{course.progress}%</span>
                </div>
                <ProgressBar
                  value={course.progress}
                  tone={isComplete ? 'success' : 'primary'}
                  label={`${course.title} progress`}
                />
                <p className="mt-3.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700">
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  {isComplete ? 'Review course' : course.progress > 0 ? 'Continue learning' : 'Start course'}
                </p>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Access Granted
                </span>
                <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 group-hover:text-primary-800">
                  Continue Learning <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            )
          ) : (
            <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3.5">
              <span className="truncate text-xs text-ink-500">{course.instructor}</span>
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary-700 group-hover:text-primary-800">
                View Course <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
