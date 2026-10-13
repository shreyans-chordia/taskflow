import type { CSSProperties } from 'react';
import type { Category, Task } from '../api/types';
import { deadlineParts, dueSentence, isOverdue } from './format';
import { PaperNote } from './PaperNote';

/*
 * The room's board pieces, shared by the Tasks corkboard and the category board: a chip per category with its
 * count, and tasks pinned to cork as sticky notes (TASK-2 all tasks, CAT-2 by category).
 */

/** The same small tilts as the prototype's board, repeating. */
const TILTS = [-1.2, 0.8, -0.6, 1.4, -1, 0.6];

type Level = { id: string; name: string; color: string; filled: number };

/** Open first, then by deadline (none last), then the most important level, as on the prototype's board. */
export function boardOrder(tasks: Task[], levels: Level[]): Task[] {
  const rank = new Map(levels.map((l, i) => [l.id, i]));
  return [...tasks].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (deadlineParts(a).date || '9999').localeCompare(deadlineParts(b).date || '9999') ||
      (rank.get(a.priorityId) ?? 99) - (rank.get(b.priorityId) ?? 99),
  );
}

/** "Study · was due Mon 12 Oct", the second line of a note. */
export function noteLine(t: Task, catName: Map<string, string>): string {
  const due = dueSentence(t);
  return [t.categoryIds.map((c) => catName.get(c)).filter(Boolean).join(' · ') || 'No category', due.charAt(0).toLowerCase() + due.slice(1)].join(' · ');
}

export function CategoryChips({ cats, tasks, current, onPick }: { cats: Category[]; tasks: Task[]; current?: string; onPick: (categoryId: string | undefined) => void }) {
  const count = (c?: string) => (c ? tasks.filter((t) => t.categoryIds.includes(c)).length : tasks.length);
  return (
    <div className="cat-chips" role="group" aria-label="Categories">
      <Chip label="All" count={count()} pressed={!current} onClick={() => onPick(undefined)} />
      {cats.map((c) => (
        <Chip key={c.id} label={c.name} color={c.color} count={count(c.id)} pressed={current === c.id} onClick={() => onPick(c.id)} />
      ))}
    </div>
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

/**
 * Notes on cork. `action` is what a press on a note does, for its accessible name and look: open it (browse), edit
 * it, or delete it (the edit and delete modes outline every note, as in the room).
 */
export function Cork({ tasks, levels, cats, label, empty, action = 'open', onNote }: {
  tasks: Task[];
  levels: Level[];
  cats: Category[];
  label: string;
  empty: string;
  action?: 'open' | 'edit' | 'delete';
  onNote: (t: Task) => void;
}) {
  const level = new Map(levels.map((l) => [l.id, l]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return (
    <div className={`cork${action !== 'open' ? ' cork-pick' : ''}`} aria-label={label} role="list">
      {tasks.length ? (
        tasks.map((t, i) => {
          const late = isOverdue(t);
          const state = t.done ? ', done' : late ? ', overdue' : '';
          return (
            <div role="listitem" key={t.id}>
              <button
                type="button"
                className="cork-note"
                style={{ '--tilt': `${TILTS[i % TILTS.length]}deg` } as CSSProperties}
                aria-label={action === 'open' ? `${t.title}${state}` : `${t.title}: ${action}`}
                onClick={() => onNote(t)}
              >
                <PaperNote
                  title={t.title}
                  line={noteLine(t, catName)}
                  level={level.get(t.priorityId)}
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
        <p className="cork-empty">{empty}</p>
      )}
    </div>
  );
}
