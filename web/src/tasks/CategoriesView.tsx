import type { CSSProperties } from 'react';
import type { Category, Task } from '../api/types';
import { deadlineParts, dueSentence, isOverdue, rankLevels } from './format';
import { PaperNote } from './PaperNote';
import { useTaskData } from './useTaskActions';

/** The same small tilts as the prototype's board, repeating. */
const TILTS = [-1.2, 0.8, -0.6, 1.4, -1, 0.6];

/**
 * Categories, as in the room: a chip per category with its count, and that category's tasks pinned to a cork board
 * as sticky notes (CAT-2 browse by category, TASK-3 a note opens its task). "All" shows every task.
 * Managing the categories themselves (and the priority levels) is one step further: `onManage`.
 */
export function CategoriesView({ titleId, categoryId, onPick, onOpen, onManage }: {
  titleId: string;
  /** The chosen category; undefined is "All". */
  categoryId?: string;
  onPick: (categoryId: string | undefined) => void;
  onOpen: (taskId: string) => void;
  onManage: () => void;
}) {
  const { tasks, priorities, categories } = useTaskData();
  const cats = categories.data ?? [];
  const all = tasks.data ?? [];
  const levels = rankLevels(priorities.data ?? []);
  const level = new Map(levels.map((l) => [l.id, l]));
  const rank = new Map(levels.map((l, i) => [l.id, i]));
  const chosen = categoryId ? cats.find((c) => c.id === categoryId) : undefined;
  const current = chosen?.id; // a category deleted meanwhile falls back to All
  const inCat = (c?: string) => (c ? all.filter((t) => t.categoryIds.includes(c)) : all);
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  // Open first, then by deadline (none last), then the most important level, as on the prototype's board.
  const shown = [...inCat(current)].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (deadlineParts(a).date || '9999').localeCompare(deadlineParts(b).date || '9999') ||
      (rank.get(a.priorityId) ?? 99) - (rank.get(b.priorityId) ?? 99),
  );

  const noteLine = (t: Task) => {
    const due = dueSentence(t);
    return [t.categoryIds.map((c) => catName.get(c)).filter(Boolean).join(' · ') || 'No category', due.charAt(0).toLowerCase() + due.slice(1)].join(' · ');
  };

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Categories</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {chosen ? `${chosen.name} tasks` : 'All tasks'}
          </h1>
        </div>
      </div>

      <div className="cat-chips" role="group" aria-label="Categories">
        <Chip label="All" count={all.length} pressed={!current} onClick={() => onPick(undefined)} />
        {cats.map((c: Category) => (
          <Chip key={c.id} label={c.name} color={c.color} count={inCat(c.id).length} pressed={current === c.id} onClick={() => onPick(c.id)} />
        ))}
      </div>

      {tasks.isPending ? (
        <p className="wb-note">Loading your tasks…</p>
      ) : (
        <div className="cork" aria-label={chosen ? `${chosen.name} tasks` : 'All tasks'} role="list">
          {shown.length ? (
            shown.map((t, i) => {
              const late = isOverdue(t);
              const l = level.get(t.priorityId);
              return (
                <div role="listitem" key={t.id}>
                  <button
                    type="button"
                    className="cork-note"
                    style={{ '--tilt': `${TILTS[i % TILTS.length]}deg` } as CSSProperties}
                    aria-label={`${t.title}${t.done ? ', done' : late ? ', overdue' : ''}`}
                    onClick={() => onOpen(t.id)}
                  >
                    <PaperNote
                      title={t.title}
                      line={noteLine(t)}
                      level={l}
                      levels={levels.length}
                      overdue={late}
                      done={t.done}
                      subtasks={{ done: t.subtasks.filter((s) => s.done).length, total: t.subtasks.length }}
                    />
                  </button>
                </div>
              );
            })
          ) : (
            <p className="cork-empty">{chosen ? `No tasks in ${chosen.name} yet.` : 'Nothing pinned yet.'}</p>
          )}
        </div>
      )}

      <div className="tv-row cat-foot">
        <button type="button" className="btn cat-manage" onClick={onManage}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
          </svg>
          Manage categories &amp; priorities
        </button>
      </div>
    </>
  );
}

function Chip({ label, color, count, pressed, onClick }: { label: string; color?: string; count: number; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" className="fchip" aria-pressed={pressed} onClick={onClick}>
      {color && <i className="cdot" style={{ background: color }} />}
      {label}
      <span className="n">{count}</span>
    </button>
  );
}
