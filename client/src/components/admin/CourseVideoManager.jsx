import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Edit2,
  FileVideo,
  Folder,
  FolderOpen,
  Loader2,
  MoveDown,
  MoveUp,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  addLesson,
  deleteLesson,
  reorderLessons,
  toErrorMessage,
  updateLesson,
} from '../../api/client';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import Input from '../common/Input.jsx';
import { formatDate } from './ui.jsx';

/**
 * Format duration in seconds into human-readable format.
 */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0 min';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
  }
  return `${secs}s`;
}

export default function CourseVideoManager({
  course,
  lessons = [],
  loading = false,
  onLessonAdded,
  onLessonUpdated,
  onLessonDeleted,
  onLessonsReordered,
  flash,
}) {
  // Reordering loading state
  const [reordering, setReordering] = useState(false);

  // Add Lesson Modal State
  const [addModal, setAddModal] = useState({
    open: false,
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    driveLink: '',
    folderName: '',
    order: '',
    loading: false,
  });

  // Edit Lesson Modal State
  const [editModal, setEditModal] = useState({
    open: false,
    lesson: null,
    title: '',
    description: '',
    date: '',
    folderName: '',
    order: '',
    loading: false,
  });

  // Replace Video Modal State
  const [replaceModal, setReplaceModal] = useState({
    open: false,
    lesson: null,
    newDriveLink: '',
    loading: false,
  });

  // Remove Lesson Modal State
  const [removeModal, setRemoveModal] = useState({
    open: false,
    lesson: null,
    loading: false,
  });

  // Group lessons by module / folder
  const groupedModules = useMemo(() => {
    const sorted = [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
    const groups = new Map();

    for (const lesson of sorted) {
      const moduleName = (lesson.folderName || 'General Curriculum').trim();
      if (!groups.has(moduleName)) {
        groups.set(moduleName, []);
      }
      groups.get(moduleName).push(lesson);
    }

    return Array.from(groups.entries()).map(([moduleName, moduleLessons]) => ({
      name: moduleName,
      lessons: moduleLessons,
      totalDuration: moduleLessons.reduce((sum, l) => sum + (l.duration || 0), 0),
    }));
  }, [lessons]);

  // Existing module names for auto-suggest
  const existingModuleNames = useMemo(() => {
    const set = new Set();
    for (const lesson of lessons) {
      if (lesson.folderName) set.add(lesson.folderName.trim());
    }
    return Array.from(set);
  }, [lessons]);

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------

  const handleOpenAddModal = (presetModule = '') => {
    const nextOrder = lessons.length > 0
      ? Math.max(...lessons.map((l) => l.order || 0)) + 1
      : 1;

    setAddModal({
      open: true,
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0],
      driveLink: '',
      folderName: presetModule || (existingModuleNames[0] || 'Module 1: Introduction'),
      order: nextOrder,
      loading: false,
    });
  };

  const handleAddLessonSubmit = async (e) => {
    e.preventDefault();
    if (!addModal.title.trim() || !addModal.driveLink.trim()) {
      flash?.error?.('Please provide both a lesson title and a Google Drive link.');
      return;
    }

    setAddModal((prev) => ({ ...prev, loading: true }));
    try {
      const payload = {
        courseId: course._id,
        title: addModal.title.trim(),
        description: addModal.description.trim(),
        date: addModal.date,
        driveLink: addModal.driveLink.trim(),
        folderName: addModal.folderName.trim() || 'General',
        order: addModal.order ? Number(addModal.order) : undefined,
      };

      const created = await addLesson(payload);
      flash?.success?.(`Video lesson "${created.title}" added successfully.`);
      setAddModal({
        open: false,
        title: '',
        description: '',
        date: '',
        driveLink: '',
        folderName: '',
        order: '',
        loading: false,
      });
      onLessonAdded?.(created);
    } catch (err) {
      flash?.error?.(toErrorMessage(err));
      setAddModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleOpenEditModal = (lesson) => {
    setEditModal({
      open: true,
      lesson,
      title: lesson.title || '',
      description: lesson.description || '',
      date: lesson.date ? lesson.date.split('T')[0] : '',
      folderName: lesson.folderName || 'General',
      order: lesson.order ?? '',
      loading: false,
    });
  };

  const handleEditLessonSubmit = async (e) => {
    e.preventDefault();
    if (!editModal.lesson) return;
    if (!editModal.title.trim()) {
      flash?.error?.('Lesson title is required.');
      return;
    }

    setEditModal((prev) => ({ ...prev, loading: true }));
    try {
      const payload = {
        title: editModal.title.trim(),
        description: editModal.description.trim(),
        date: editModal.date,
        folderName: editModal.folderName.trim() || 'General',
        order: editModal.order !== '' ? Number(editModal.order) : undefined,
      };

      const updated = await updateLesson(editModal.lesson._id, payload);
      flash?.success?.(`Lesson "${updated.title}" updated successfully.`);
      setEditModal({
        open: false,
        lesson: null,
        title: '',
        description: '',
        date: '',
        folderName: '',
        order: '',
        loading: false,
      });
      onLessonUpdated?.(updated);
    } catch (err) {
      flash?.error?.(toErrorMessage(err));
      setEditModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleOpenReplaceModal = (lesson) => {
    setReplaceModal({
      open: true,
      lesson,
      newDriveLink: '',
      loading: false,
    });
  };

  const handleReplaceVideoSubmit = async (e) => {
    e.preventDefault();
    if (!replaceModal.lesson) return;
    if (!replaceModal.newDriveLink.trim()) {
      flash?.error?.('Please enter the replacement Google Drive video link.');
      return;
    }

    setReplaceModal((prev) => ({ ...prev, loading: true }));
    try {
      const payload = {
        driveLink: replaceModal.newDriveLink.trim(),
      };

      const updated = await updateLesson(replaceModal.lesson._id, payload);
      flash?.success?.(
        `Video for "${updated.title}" was replaced successfully. Duration: ${formatDuration(updated.duration)}.`
      );
      setReplaceModal({
        open: false,
        lesson: null,
        newDriveLink: '',
        loading: false,
      });
      onLessonUpdated?.(updated);
    } catch (err) {
      flash?.error?.(toErrorMessage(err));
      setReplaceModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleOpenRemoveModal = (lesson) => {
    setRemoveModal({
      open: true,
      lesson,
      loading: false,
    });
  };

  const handleConfirmRemove = async () => {
    if (!removeModal.lesson) return;

    setRemoveModal((prev) => ({ ...prev, loading: true }));
    try {
      await deleteLesson(removeModal.lesson._id);
      flash?.success?.(
        `Video lesson "${removeModal.lesson.title}" was removed and remaining lessons re-ordered.`
      );
      const removedId = removeModal.lesson._id;
      setRemoveModal({ open: false, lesson: null, loading: false });
      onLessonDeleted?.(removedId);
    } catch (err) {
      flash?.error?.(toErrorMessage(err));
      setRemoveModal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleMoveOrder = async (lessonIndex, direction) => {
    if (reordering) return;
    const sorted = [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0));
    const targetIndex = direction === 'up' ? lessonIndex - 1 : lessonIndex + 1;

    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Swap adjacent items
    const reordered = [...sorted];
    const temp = reordered[lessonIndex];
    reordered[lessonIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Optimistically assign new sequential orders (1, 2, 3...)
    const newLessonIds = reordered.map((l) => l._id);
    const updatedLessonsWithOrder = reordered.map((l, idx) => ({ ...l, order: idx + 1 }));

    onLessonsReordered?.(updatedLessonsWithOrder);
    setReordering(true);

    try {
      await reorderLessons(course._id, { lessonIds: newLessonIds });
      flash?.success?.('Curriculum order updated.');
    } catch (err) {
      flash?.error?.(toErrorMessage(err));
      // Revert to original
      onLessonsReordered?.(sorted);
    } finally {
      setReordering(false);
    }
  };

  // -------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------

  const overallSortedLessons = useMemo(
    () => [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [lessons]
  );

  return (
    <div className="space-y-4">
      {/* Header with Title and Add Video Button */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-3">
        <div>
          <h4 className="text-sm font-bold text-ink-900 flex items-center gap-2">
            <Video className="h-4 w-4 text-primary-600" />
            Curriculum Videos &amp; Content Management
          </h4>
          <p className="text-xs text-ink-500">
            {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} across {groupedModules.length}{' '}
            {groupedModules.length === 1 ? 'module' : 'modules'}. Edit, replace video source, reorder, or remove lessons.
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => handleOpenAddModal()}
          className="self-start sm:self-auto gap-1.5 shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Video Lesson
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-8 text-sm text-ink-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          Loading curriculum videos…
        </div>
      ) : lessons.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50/50 p-8 text-center">
          <FileVideo className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-2 text-sm font-semibold text-ink-800">No video lessons in this course yet</p>
          <p className="mt-1 text-xs text-ink-500 max-w-sm mx-auto">
            Add your first Google Drive video lesson to build out the learning modules for this course.
          </p>
          <Button
            size="sm"
            variant="soft"
            onClick={() => handleOpenAddModal()}
            className="mt-4 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Lesson
          </Button>
        </div>
      ) : (
        /* Structured Modules & Lessons View */
        <div className="space-y-4">
          {groupedModules.map((group, groupIdx) => (
            <div
              key={group.name}
              className="rounded-2xl border border-ink-200 bg-white overflow-hidden shadow-xs"
            >
              {/* Module Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-ink-50/80 px-4 py-3 border-b border-ink-200">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                    <Folder className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-wider text-ink-800">
                      {group.name}
                    </h5>
                    <p className="text-[11px] text-ink-500">
                      {group.lessons.length} {group.lessons.length === 1 ? 'video' : 'videos'} · Total {formatDuration(group.totalDuration)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddModal(group.name)}
                  className="inline-flex items-center gap-1 self-start sm:self-auto text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline"
                >
                  <Plus className="h-3 w-3" />
                  Add to this module
                </button>
              </div>

              {/* Module Lessons List */}
              <div className="divide-y divide-ink-100">
                {group.lessons.map((lesson) => {
                  const globalIdx = overallSortedLessons.findIndex((l) => l._id === lesson._id);
                  const isFirst = globalIdx === 0;
                  const isLast = globalIdx === overallSortedLessons.length - 1;

                  return (
                    <div
                      key={lesson._id}
                      className="flex flex-col gap-3 p-3.5 transition hover:bg-ink-50/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      {/* Left side: Order, Title, Metadata */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                        {/* Order badge */}
                        <div className="flex flex-col items-center justify-center gap-0.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-700 border border-primary-200/60"
                            title={`Lesson sequence order: ${lesson.order}`}
                          >
                            #{lesson.order}
                          </span>
                        </div>

                        {/* Reorder Buttons (Up / Down) */}
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={isFirst || reordering}
                            onClick={() => handleMoveOrder(globalIdx, 'up')}
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-20 transition"
                            title="Move lesson up"
                            aria-label={`Move ${lesson.title} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isLast || reordering}
                            onClick={() => handleMoveOrder(globalIdx, 'down')}
                            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:opacity-20 transition"
                            title="Move lesson down"
                            aria-label={`Move ${lesson.title} down`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Video Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink-900">
                              {lesson.title}
                            </p>
                          </div>

                          {lesson.description && (
                            <p className="mt-0.5 truncate text-xs text-ink-500 max-w-xl">
                              {lesson.description}
                            </p>
                          )}

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-ink-500">
                            <span className="flex items-center gap-1 font-medium text-ink-600">
                              <Clock className="h-3 w-3 text-ink-400" />
                              {formatDuration(lesson.duration)}
                            </span>

                            {lesson.driveFileName && (
                              <span className="truncate max-w-xs text-ink-400 font-mono text-[10px]">
                                {lesson.driveFileName}
                              </span>
                            )}

                            {lesson.date && (
                              <span className="text-ink-400">
                                {formatDate(lesson.date)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Action Buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-ink-100">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(lesson)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 hover:border-ink-300"
                          title="Edit video title, description, or module"
                          aria-label={`Edit ${lesson.title}`}
                        >
                          <Pencil className="h-3.5 w-3.5 text-ink-500" />
                          Edit
                        </button>

                        {/* Replace Video Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenReplaceModal(lesson)}
                          className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50/60 px-2.5 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100/70"
                          title="Replace Google Drive video file"
                          aria-label={`Replace video for ${lesson.title}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-primary-600" />
                          Replace Video
                        </button>

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenRemoveModal(lesson)}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 transition"
                          title="Remove video from curriculum"
                          aria-label={`Remove ${lesson.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============================================================= */}
      {/* 1. ADD LESSON MODAL */}
      {/* ============================================================= */}
      <Modal
        open={addModal.open}
        onClose={() => !addModal.loading && setAddModal((prev) => ({ ...prev, open: false }))}
        title="Add Video Lesson"
        description={`Add a new video lesson to "${course.title}".`}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={addModal.loading}
              onClick={() => setAddModal((prev) => ({ ...prev, open: false }))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={addModal.loading || !addModal.title.trim() || !addModal.driveLink.trim()}
              onClick={handleAddLessonSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
            >
              {addModal.loading ? 'Importing Video...' : 'Add Lesson'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleAddLessonSubmit} className="space-y-3.5 py-1">
          <Input
            label="Lesson Title"
            required
            placeholder="e.g. 1. Introduction to Variables"
            value={addModal.title}
            onChange={(e) => setAddModal({ ...addModal, title: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="add-folder-name" className="field-label">
                Module / Section Name
              </label>
              <input
                id="add-folder-name"
                list="existing-modules-list"
                type="text"
                className="field-input"
                placeholder="e.g. Module 1: Basics"
                value={addModal.folderName}
                onChange={(e) => setAddModal({ ...addModal, folderName: e.target.value })}
              />
              <datalist id="existing-modules-list">
                {existingModuleNames.map((mod) => (
                  <option key={mod} value={mod} />
                ))}
              </datalist>
            </div>

            <Input
              label="Sequence Order"
              type="number"
              min={1}
              value={addModal.order}
              onChange={(e) => setAddModal({ ...addModal, order: e.target.value })}
            />
          </div>

          <Input
            label="Google Drive Video Link"
            type="url"
            required
            placeholder="https://drive.google.com/file/d/..."
            hint="Right-click video in Drive → Share → Copy link. Ensure the service account has access."
            value={addModal.driveLink}
            onChange={(e) => setAddModal({ ...addModal, driveLink: e.target.value })}
          />

          <Input
            label="Date"
            type="date"
            value={addModal.date}
            onChange={(e) => setAddModal({ ...addModal, date: e.target.value })}
          />

          <div>
            <label htmlFor="add-lesson-desc" className="field-label">
              Description (Optional)
            </label>
            <textarea
              id="add-lesson-desc"
              rows={2}
              className="field-input resize-y"
              placeholder="What this lesson covers..."
              value={addModal.description}
              onChange={(e) => setAddModal({ ...addModal, description: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* ============================================================= */}
      {/* 2. EDIT LESSON MODAL */}
      {/* ============================================================= */}
      <Modal
        open={editModal.open}
        onClose={() => !editModal.loading && setEditModal((prev) => ({ ...prev, open: false }))}
        title="Edit Lesson Details"
        description={`Update information for "${editModal.lesson?.title}".`}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={editModal.loading}
              onClick={() => setEditModal((prev) => ({ ...prev, open: false }))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={editModal.loading || !editModal.title.trim()}
              onClick={handleEditLessonSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
            >
              {editModal.loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleEditLessonSubmit} className="space-y-3.5 py-1">
          <Input
            label="Lesson Title"
            required
            value={editModal.title}
            onChange={(e) => setEditModal({ ...editModal, title: e.target.value })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-folder-name" className="field-label">
                Module / Section Name
              </label>
              <input
                id="edit-folder-name"
                list="existing-modules-edit-list"
                type="text"
                className="field-input"
                placeholder="e.g. Module 1: Introduction"
                value={editModal.folderName}
                onChange={(e) => setEditModal({ ...editModal, folderName: e.target.value })}
              />
              <datalist id="existing-modules-edit-list">
                {existingModuleNames.map((mod) => (
                  <option key={mod} value={mod} />
                ))}
              </datalist>
            </div>

            <Input
              label="Sequence Order"
              type="number"
              min={1}
              value={editModal.order}
              onChange={(e) => setEditModal({ ...editModal, order: e.target.value })}
            />
          </div>

          <Input
            label="Date"
            type="date"
            value={editModal.date}
            onChange={(e) => setEditModal({ ...editModal, date: e.target.value })}
          />

          <div>
            <label htmlFor="edit-lesson-desc" className="field-label">
              Description
            </label>
            <textarea
              id="edit-lesson-desc"
              rows={3}
              className="field-input resize-y"
              value={editModal.description}
              onChange={(e) => setEditModal({ ...editModal, description: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* ============================================================= */}
      {/* 3. REPLACE VIDEO MODAL */}
      {/* ============================================================= */}
      <Modal
        open={replaceModal.open}
        onClose={() => !replaceModal.loading && setReplaceModal((prev) => ({ ...prev, open: false }))}
        title="Replace Lesson Video"
        description={`Replace the video file for "${replaceModal.lesson?.title}".`}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={replaceModal.loading}
              onClick={() => setReplaceModal((prev) => ({ ...prev, open: false }))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={replaceModal.loading || !replaceModal.newDriveLink.trim()}
              onClick={handleReplaceVideoSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
            >
              {replaceModal.loading ? 'Updating Video...' : 'Confirm Video Replacement'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleReplaceVideoSubmit} className="space-y-4 py-1">
          <div className="rounded-xl bg-ink-50/70 p-3 text-xs text-ink-700 space-y-1">
            <p>
              <strong>Current Lesson:</strong> {replaceModal.lesson?.title}
            </p>
            <p>
              <strong>Current Module:</strong> {replaceModal.lesson?.folderName || 'General'}
            </p>
            <p>
              <strong>Current Duration:</strong> {formatDuration(replaceModal.lesson?.duration)}
            </p>
            {replaceModal.lesson?.driveFileName && (
              <p>
                <strong>Current File Name:</strong> {replaceModal.lesson?.driveFileName}
              </p>
            )}
          </div>

          <Input
            label="New Google Drive Video Link"
            type="url"
            required
            placeholder="https://drive.google.com/file/d/..."
            hint="Paste the share link of the new video. The duration and streaming metadata will be updated automatically while preserving the lesson ID and existing learner progress."
            value={replaceModal.newDriveLink}
            onChange={(e) => setReplaceModal({ ...replaceModal, newDriveLink: e.target.value })}
          />
        </form>
      </Modal>

      {/* ============================================================= */}
      {/* 4. REMOVE LESSON MODAL */}
      {/* ============================================================= */}
      <Modal
        open={removeModal.open}
        onClose={() => !removeModal.loading && setRemoveModal((prev) => ({ ...prev, open: false }))}
        title="Remove Video Lesson?"
        description="Are you sure you want to remove this video lesson from the course?"
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={removeModal.loading}
              onClick={() => setRemoveModal((prev) => ({ ...prev, open: false }))}
              className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 transition hover:bg-ink-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={removeModal.loading}
              onClick={handleConfirmRemove}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
            >
              {removeModal.loading ? 'Removing...' : 'Confirm Remove'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-900 space-y-1.5">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <span>Warning: Removing Curriculum Content</span>
            </div>
            <p>
              Removing <strong>"{removeModal.lesson?.title}"</strong> will remove it from the course curriculum and database. Remaining lessons will be automatically resequenced.
            </p>
          </div>

          <div className="rounded-xl bg-ink-50/70 p-3 text-xs text-ink-700 space-y-1">
            <p>
              <strong>Lesson Title:</strong> {removeModal.lesson?.title}
            </p>
            <p>
              <strong>Module:</strong> {removeModal.lesson?.folderName || 'General'}
            </p>
            <p>
              <strong>Duration:</strong> {formatDuration(removeModal.lesson?.duration)}
            </p>
            <p>
              <strong>Sequence Order:</strong> #{removeModal.lesson?.order}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
