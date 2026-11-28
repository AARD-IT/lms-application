import { useMemo, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Filter,
  Link as LinkIcon,
  Presentation,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { usePageMeta } from '../components/layout/DashboardLayout.jsx';
import Badge from '../components/common/Badge.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Skeleton from '../components/common/Skeleton.jsx';
import { ErrorState } from '../components/States.jsx';
import { getMyResources, toErrorMessage } from '../api/client';
import { safeExternalUrl } from '../utils/url.js';

const TYPE_CONFIG = {
  pdf: {
    icon: FileText,
    label: 'PDF',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/80',
    iconBg: 'bg-rose-100/70 text-rose-600',
  },
  doc: {
    icon: FileText,
    label: 'Document',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200/80',
    iconBg: 'bg-sky-100/70 text-sky-600',
  },
  slides: {
    icon: Presentation,
    label: 'Slides',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
    iconBg: 'bg-amber-100/70 text-amber-600',
  },
  link: {
    icon: LinkIcon,
    label: 'Link',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    iconBg: 'bg-indigo-100/70 text-indigo-600',
  },
};

/**
 * Single Course Resources Section (for multiple course view or single course)
 */
function CourseResourcesSection({ group, isSingleCourse, defaultOpen, typeFilter, searchQuery }) {
  const [open, setOpen] = useState(defaultOpen);
  const { course, resources } = group;

  // Filter resources by type and search query
  const filteredResources = useMemo(() => {
    return resources.filter((res) => {
      if (typeFilter && typeFilter !== 'all' && res.type !== typeFilter) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = res.title?.toLowerCase().includes(query);
        const matchesDesc = res.description?.toLowerCase().includes(query);
        const matchesCourse = course.title?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesDesc && !matchesCourse) {
          return false;
        }
      }
      return true;
    });
  }, [resources, typeFilter, searchQuery, course.title]);

  // If user searched/filtered and this course has 0 matching resources, hide it in search mode
  if ((searchQuery || (typeFilter && typeFilter !== 'all')) && filteredResources.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden border border-ink-100 shadow-xs transition hover:border-ink-200">
      {/* Course Heading / Header */}
      <button
        type="button"
        onClick={() => !isSingleCourse && setOpen((v) => !v)}
        disabled={isSingleCourse}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-4 p-5 text-left transition ${
          isSingleCourse ? 'cursor-default bg-ink-50/50' : 'hover:bg-ink-50/80'
        }`}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-100/80 text-primary-700 font-bold">
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold text-ink-900">{course.title}</h3>
              {course.category && (
                <span className="hidden sm:inline-block rounded-md bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                  {course.category}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-ink-500">
              {filteredResources.length} learning {filteredResources.length === 1 ? 'resource' : 'resources'} available
            </p>
          </div>
        </div>

        {!isSingleCourse && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-ink-200 text-ink-500 transition hover:bg-ink-50 shrink-0">
            {open ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        )}
      </button>

      {/* Resources List */}
      {(open || isSingleCourse) && (
        <div className="border-t border-ink-100 bg-ink-50/40 p-5">
          {filteredResources.length === 0 ? (
            <p className="text-xs text-ink-500 italic py-2">
              No materials match the selected filter in this course.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredResources.map((resource) => {
                const conf = TYPE_CONFIG[resource.type] || TYPE_CONFIG.pdf;
                const Icon = conf.icon;
                const href = safeExternalUrl(resource.url);

                return (
                  <div
                    key={resource.id || resource._id}
                    className="flex flex-col justify-between rounded-xl border border-ink-100 bg-white p-4 shadow-2xs transition hover:border-primary-200 hover:shadow-xs"
                  >
                    <div>
                      {/* Badge & Type indicator */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${conf.badgeClass}`}
                        >
                          <Icon className="h-3 w-3" />
                          {conf.label}
                        </span>

                        <span className="text-[11px] text-ink-400">
                          {course.title}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <h4 className="text-sm font-semibold text-ink-900 line-clamp-2">
                        {resource.title}
                      </h4>

                      {resource.description && (
                        <p className="mt-1 text-xs text-ink-500 line-clamp-2 leading-relaxed">
                          {resource.description}
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-end">
                      <a
                        href={href || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 active:bg-primary-200"
                      >
                        <span>Open {conf.label}</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Resources() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  usePageMeta('Course Resources', 'Study materials, exercises, slides, and links for your authorized courses.');

  useEffect(() => {
    getMyResources()
      .then(setGroups)
      .catch((err) => setError(toErrorMessage(err)));
  }, []);

  // Compute total counts
  const totalResourcesCount = useMemo(() => {
    if (!groups) return 0;
    return groups.reduce((sum, g) => sum + (g.resources?.length || 0), 0);
  }, [groups]);

  if (error) return <ErrorState message={error} />;

  if (!groups) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
    );
  }

  // Proper Empty State if learner has no authorized courses with available resources
  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-600">
            <FileText className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-ink-900">
            No course study materials available yet
          </h3>
          <p className="mt-2 text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
            Resources are strictly linked to your authorized courses. Once you purchase or receive verified access to a course, all its study materials, PDFs, documents, and reference links will appear here dynamically.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/courses"
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-primary-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Explore Courses
            </Link>
            <Link
              to="/my-courses"
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50"
            >
              <BookOpen className="h-3.5 w-3.5" />
              My Courses
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isSingleCourse = groups.length === 1;

  return (
    <div className="space-y-6">
      {/* Page Title & Search/Filter Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Course Resources</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            {totalResourcesCount} study {totalResourcesCount === 1 ? 'material' : 'materials'} across {groups.length}{' '}
            {groups.length === 1 ? 'authorized course' : 'authorized courses'}.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white pl-9 pr-8 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Type Filter Select */}
          <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1 text-xs">
            {['all', 'pdf', 'doc', 'slides', 'link'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setTypeFilter(type)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                  typeFilter === type
                    ? 'bg-primary-600 text-white shadow-2xs'
                    : 'text-ink-600 hover:bg-ink-50'
                }`}
              >
                {type === 'all' ? 'All Types' : type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Courses & Resources List */}
      <div className="space-y-4">
        {groups.map((group, index) => (
          <CourseResourcesSection
            key={group.course._id}
            group={group}
            isSingleCourse={isSingleCourse}
            defaultOpen={index === 0}
            typeFilter={typeFilter}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </div>
  );
}
