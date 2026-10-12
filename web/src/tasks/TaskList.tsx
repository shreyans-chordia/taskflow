import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { Task } from '../api/types';
import { Ring } from '../components/Ring';
import { dueText, isOverdue, rankLevels } from './format';
import { useTaskActions, useTaskData } from './useTaskActions';

export interface TaskListProps {
  titleId: string;
  eyebrow?: string;
  heading?: string;
  /** Show only tasks in this category (a tray on the organizer). */
  categoryId?: string;
  /** Put the cursor in the new-task field. */
  focusAdd?: boolean;
  /** A line shown above the list, e.g. after a task was deleted. */
  message?: string;
  onOpen?: (id: string) => void;
  onAddFull?: () => void;
}

/** Quick add, tick and delete, with each title opening the full task (TASK-1, TASK-2, TASK-4, TASK-5, PR-1). */
export function TaskList({ titleId, eyebrow = 'Corkboard', heading = 'Your tasks', categoryId, focusAdd, message, onOpen, onAddFull }: TaskListProps) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const [title, setTitle] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusAdd) addRef.current?.focus();
  }, [focusAdd]);

  const levels = rankLevels(priorities.data ?? []);
  const byId = new Map(levels.map((p) => [p.id, p]));
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const shown = (tasks.data ?? []).filter((t) => !categoryId || t.categoryIds.includes(categoryId));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    setError('');
    try {
      await act.create.mutateAsync({ title: title.trim(), ...(priorityId ? { priorityId } : {}), ...(categoryId ? { categoryIds: [categoryId] } : {}) });
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : 'Could not save the task.');
    }
  }

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {heading}
          </h1>
        </div>
        {onAddFull && (
          <button type="button" className="btn btn-primary" onClick={onAddFull}>
            + Add task
          </button>
        )}
      </div>
      {message && <p className="tv-ok" role="status">{message}</p>}
      <form className="wb-add" onSubmit={add} noValidate>
        <div className="field" style={{ flex: 1 }}>
          <label className="label" htmlFor={`${titleId}-new`}>New task</label>
          <div className="field-input">
            <input ref={addRef} id={`${titleId}-new`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Submit Lab 7 record" aria-invalid={error ? true : undefined} aria-describedby={error ? `${titleId}-err` : undefined} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${titleId}-pr`}>Priority</label>
          <select id={`${titleId}-pr`} className="wb-select" value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
            <option value="">Default</option>
            {levels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={act.create.isPending}>
          Pin it
        </button>
      </form>
      {error && <p className="field-error" id={`${titleId}-err`} role="alert">{error}</p>}

      {tasks.isPending ? (
        <p className="wb-note">Loading your tasks…</p>
      ) : tasks.isError ? (
        <p className="wb-note" role="alert">Could not load your tasks. {tasks.error instanceof ApiError ? tasks.error.message : ''}</p>
      ) : shown.length === 0 ? (
        <p className="wb-empty">{categoryId ? 'Nothing in this tray yet.' : 'Nothing pinned yet. Add your first task above.'}</p>
      ) : (
        <ul className="wb-list" aria-label="Tasks">
          {shown.map((t) =>
            confirm === t.id ? (
              <li key={t.id} className="wb-row wb-confirm" role="alert">
                <span className="wb-text">
                  <strong>Delete “{t.title}”?</strong>
                  <span className="wb-meta">This can’t be undone.</span>
                </span>
                <button type="button" className="btn btn-danger wb-del" onClick={() => act.remove.mutateAsync(t.id).catch(() => setError('Could not delete the task.')).finally(() => setConfirm(null))}>
                  Delete
                </button>
                <button type="button" className="btn wb-del" autoFocus onClick={() => setConfirm(null)}>
                  Keep
                </button>
              </li>
            ) : (
              <TaskRow
                key={t.id}
                task={t}
                level={byId.get(t.priorityId)}
                levels={levels.length}
                categories={t.categoryIds.map((c) => catName.get(c) ?? '').filter(Boolean)}
                onOpen={onOpen}
                onToggle={(done) => act.setDone.mutateAsync({ id: t.id, done }).catch(() => setError('Could not update the task. Try again.'))}
                onDelete={() => setConfirm(t.id)}
              />
            ),
          )}
        </ul>
      )}
    </>
  );
}

/** One task as a row: tick, priority pill, title (opens the task), overdue stamp and, in the list, Delete. */
export function TaskRow({ task, level, levels, categories, onOpen, onToggle, onDelete }: {
  task: Task;
  level?: { name: string; color: string; filled: number };
  levels: number;
  categories: string[];
  onOpen?: (id: string) => void;
  onToggle: (done: boolean) => Promise<unknown>;
  onDelete?: () => void;
}) {
  // While a save is in flight the box shows what was clicked, set in the same event as the click
  // (React Query's cache update lands a tick later, which made the box flicker back). When the save
  // settles the box follows the server data again, which is the rolled-back value if it failed.
  const [pending, setPending] = useState<boolean | null>(null);
  const done = pending ?? task.done;
  const late = isOverdue(task);
  const meta = [categories.join(' · '), task.deadline ? dueText(task) : '', task.subtasks.length ? `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} steps` : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <li className={`wb-row${done ? ' done' : ''}`}>
      <input
        type="checkbox"
        checked={done}
        onChange={(e) => {
          setPending(e.target.checked);
          void onToggle(e.target.checked).finally(() => setPending(null));
        }}
        aria-label={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
      />
      {level && (
        <span className="wb-pill" style={{ '--pc': level.color } as CSSProperties}>
          <Ring filled={level.filled} segments={levels} color={level.color} size={16} />
          {level.name}
        </span>
      )}
      {onOpen ? (
        <button type="button" className="wb-text wb-open" onClick={() => onOpen(task.id)}>
          <span className="wb-title"><span className="sqt">{task.title}</span></span>
          {meta && <span className="wb-meta">{meta}</span>}
        </button>
      ) : (
        <span className="wb-text">
          <span className="wb-title"><span className="sqt">{task.title}</span></span>
          {meta && <span className="wb-meta">{meta}</span>}
        </span>
      )}
      {late && <span className="stamp sm">Overdue</span>}
      {onDelete && (
        <button type="button" className="btn btn-ghost wb-del" onClick={onDelete} aria-label={`Delete ${task.title}`}>
          Delete
        </button>
      )}
    </li>
  );
}
