import type { CSSProperties } from 'react';
import { Ring } from '../components/Ring';

export interface PaperNoteProps {
  title: string;
  /** "Study · Health · Due Tue 20 Oct" */
  line: string;
  level?: { name: string; color: string; filled: number };
  levels: number;
  overdue?: boolean;
  done?: boolean;
  subtasks?: { done: number; total: number };
}

/** The sticky note for one task, as it hangs on the corkboard: tape in the priority colour, title in Caveat. */
export function PaperNote({ title, line, level, levels, overdue, done, subtasks }: PaperNoteProps) {
  return (
    <div className={`pn${done ? ' done' : ''}`} style={{ '--pc': level?.color ?? '#F0A81C' } as CSSProperties} aria-hidden="true">
      <span className="pn-tape" />
      <div className="pn-body">
        <div className="pn-title">{title}</div>
        <div className="pn-line">{line}</div>
        {overdue ? <span className="stamp">Overdue</span> : done ? <span className="stamp">Done</span> : null}
        <div className="pn-meta">
          {level && (
            <span className="pn-w">
              <Ring filled={level.filled} segments={levels} color={level.color} size={18} track="#CFC4AE" />
              {level.name}
            </span>
          )}
          {subtasks && subtasks.total > 0 && (
            <span className="pn-w">
              <Ring filled={subtasks.done} segments={subtasks.total} color="#2B2E33" size={18} track="#CFC4AE" />
              {subtasks.done}/{subtasks.total}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
