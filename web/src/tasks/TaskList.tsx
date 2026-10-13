import { useState, type CSSProperties } from 'react';
import { ApiError } from '../api/client';
import type { Task } from '../api/types';
import { Ring } from '../components/Ring';
import { RubberSegment } from '../components/RubberSegment';
import { boardOrder, CategoryChips, Cork } from './board';
import { dueText, isOverdue, rankLevels } from './format';
import { useTaskActions, useTaskData } from './useTaskActions';

export type BoardMode = 'browse' | 'edit' | 'delete';

const MODES: Array<[BoardMode, string]> = [
  ['browse', 'Browse'],
  ['edit', 'Edit'],
  ['delete', 'Delete'],
];
const HINTS: Record<BoardMode, string> = {
  browse: '',
  edit: 'Edit mode: pick a note to change it.',
  delete: 'Delete mode: pick a note to remove it. You will be asked to confirm first.',
};

export interface TaskListProps {
  titleId: string;
  /** Show only tasks in this category (a chip); undefined is All. */
  categoryId?: string;
  mode?: BoardMode;
  /** A line shown above the board, e.g. after a task was deleted from its own screen. */
  message?: string;
  onPick: (categoryId: string | undefined) => void;
  onMode: (mode: BoardMode) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onAdd: () => void;
}

/**
 * The corkboard, as in the room: every task pinned as a sticky note, a chip per category, and three modes. Browse
 * opens a note (TASK-2 list, TASK-3 view), Edit opens its form (TASK-4), Delete asks first and removes it (TASK-5).
 */
export function TaskList({ titleId, categoryId, mode = 'browse', message, onPick, onMode, onOpen, onEdit, onAdd }: TaskListProps) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const [confirm, setConfirm] = useState<Task | null>(null);
  const [note, setNote] = useState(message ?? '');
  const [error, setError] = useState('');

  const cats = categories.data ?? [];
  const all = tasks.data ?? [];
  const levels = rankLevels(priorities.data ?? []);
  const chosen = categoryId ? cats.find((c) => c.id === categoryId) : undefined; // deleted meanwhile: All
  const shown = boardOrder(chosen ? all.filter((t) => t.categoryIds.includes(chosen.id)) : all, levels);
  const heading = chosen ? `${chosen.name} tasks` : 'Your tasks';

  const switchMode = (m: BoardMode) => {
    setConfirm(null);
    setError('');
    onMode(m);
  };

  async function remove(t: Task) {
    setError('');
    try {
      await act.remove.mutateAsync(t.id);
      setConfirm(null);
      setNote(`Deleted “${t.title}”.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the task. Try again.');
    }
  }

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">{chosen ? 'Category organizer' : 'Corkboard'}</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {heading}
          </h1>
        </div>
        <div className="tv-row board-actions">
          <RubberSegment
            aria-label="Board mode"
            className="board-mode"
            items={MODES.map(([value, label]) => ({ value, label }))}
            value={mode}
            onChange={switchMode}
            size="lg"
            equalSlots={false}
            trackColor="var(--g-field)"
            thumbColor="var(--pen)"
            textColor="var(--pen)"
            activeTextColor="var(--on-pen)"
          />
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            + Add task
          </button>
        </div>
      </div>

      <CategoryChips cats={cats} tasks={all} current={chosen?.id} onPick={(c) => (setConfirm(null), onPick(c))} />

      {note && (
        <p className="tv-ok" role="status">
          {note}
        </p>
      )}
      {confirm ? (
        <div className="tv-confirm" role="alert">
          <strong>
            Delete “{confirm.title}”{confirm.subtasks.length ? ` and its ${confirm.subtasks.length} checklist item${confirm.subtasks.length > 1 ? 's' : ''}` : ''}?
          </strong>
          <span className="wb-note">This can’t be undone.</span>
          <div className="tv-row">
            <button type="button" className="btn btn-danger" onClick={() => void remove(confirm)} disabled={act.remove.isPending}>
              Delete task
            </button>
            <button type="button" className="btn" autoFocus onClick={() => setConfirm(null)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        HINTS[mode] && <p className="wb-note board-hint">{HINTS[mode]}</p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {tasks.isPending ? (
        <p className="wb-note">Loading your tasks…</p>
      ) : tasks.isError ? (
        <p className="wb-note" role="alert">
          Could not load your tasks. {tasks.error instanceof ApiError ? tasks.error.message : ''}
        </p>
      ) : (
        <Cork
          tasks={shown}
          levels={levels}
          cats={cats}
          label={heading}
          empty={chosen ? `No tasks in ${chosen.name} yet.` : 'Nothing pinned yet. Add your first task.'}
          action={mode === 'browse' ? 'open' : mode}
          onNote={(t) => (mode === 'edit' ? onEdit(t.id) : mode === 'delete' ? (setNote(''), setConfirm(t)) : onOpen(t.id))}
        />
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
