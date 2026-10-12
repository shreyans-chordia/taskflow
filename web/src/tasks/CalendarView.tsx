import { useMemo, useState, type CSSProperties } from 'react';
import { Ring } from '../components/Ring';
import { addMonths, longDay, monthGrid, monthLabel, monthOf, shortDay, tasksByDay, WEEKDAYS } from './calendar';
import { isOverdue, rankLevels, today } from './format';
import { TaskRow } from './TaskList';
import { useTaskActions, useTaskData } from './useTaskActions';

/** How many task chips a day square shows before "+N more". */
const PER_DAY = 3;

export interface CalendarProps {
  titleId: string;
  /** "YYYY-MM" */
  month: string;
  /** The selected day, "YYYY-MM-DD". */
  day: string;
  onChange: (v: { month: string; day: string }) => void;
  onOpen: (id: string) => void;
  onAdd: (day: string) => void;
}

/**
 * The wall calendar, opened: a month of deadlines and the selected day beside it.
 * CAL-1 month grid, CAL-2 previous / next month, CAL-3 a task opens its details, CAL-4 tasks without a deadline
 * stay off the grid, DL-3 overdue outlined, DL-4 deadlines on the calendar.
 */
export function CalendarView({ titleId, month, day, onChange, onOpen, onAdd }: CalendarProps) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const [error, setError] = useState('');

  const levels = useMemo(() => rankLevels(priorities.data ?? []), [priorities.data]);
  const level = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const byDay = useMemo(() => {
    const rank = new Map(levels.map((l, i) => [l.id, i]));
    return tasksByDay(tasks.data ?? [], (id) => rank.get(id) ?? levels.length);
  }, [tasks.data, levels]);
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const now = today();
  const weeks = monthGrid(month);
  const selected = byDay.get(day) ?? [];
  const undated = (tasks.data ?? []).filter((t) => !t.deadline).length;
  const label = monthLabel(month);

  /** Another month keeps the selection when it is in view, else picks today (this month) or the 1st. */
  const goMonth = (m: string) => onChange({ month: m, day: monthOf(day) === m ? day : monthOf(now) === m ? now : `${m}-01` });
  const pick = (d: string) => onChange({ month, day: d });
  const colorOf = (priorityId: string) => level.get(priorityId)?.color ?? '#F0A81C';

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Wall calendar</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {label}
          </h1>
        </div>
        <div className="tv-row cal-nav">
          <button type="button" className="btn cal-step" onClick={() => goMonth(addMonths(month, -1))} aria-label="Previous month">
            <Chevron dir="left" />
          </button>
          <button type="button" className="btn" onClick={() => onChange({ month: monthOf(now), day: now })}>
            Today
          </button>
          <button type="button" className="btn cal-step" onClick={() => goMonth(addMonths(month, 1))} aria-label="Next month">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      {tasks.isPending ? (
        <p className="wb-note">Loading your tasks…</p>
      ) : (
        <div className="cal">
          <div className="cal-main">
            <table className="cal-grid" aria-label={label}>
              <thead>
                <tr>
                  {WEEKDAYS.map((w) => (
                    <th key={w} scope="col">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]!.day}>
                    {week.map((c) => {
                      if (!c.inMonth) {
                        return (
                          <td key={c.day} className="cal-cell out">
                            <span className="cal-num" aria-hidden="true">
                              {c.date}
                            </span>
                          </td>
                        );
                      }
                      const its = byDay.get(c.day) ?? [];
                      const top = its.find((t) => !t.done);
                      const cls = ['cal-cell', c.day === now && 'today', c.day === day && 'sel'].filter(Boolean).join(' ');
                      return (
                        // A click on the empty part of a square picks the day too (the number button is the keyboard way).
                        <td key={c.day} className={cls} onClick={(e) => (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('cal-dn')) && pick(c.day)}>
                          <div className="cal-dn">
                            <button
                              type="button"
                              className="cal-num"
                              aria-pressed={c.day === day}
                              aria-label={`${shortDay(c.day)}${c.day === now ? ', today' : ''}: ${its.length ? `${its.length} task${its.length > 1 ? 's' : ''}` : 'no tasks'}`}
                              onClick={() => pick(c.day)}
                            >
                              {c.date}
                            </button>
                            {its.length > 0 && <Ring filled={Math.min(its.length, 5)} segments={5} color={top ? colorOf(top.priorityId) : 'var(--g-ink)'} size={18} />}
                          </div>
                          {its.slice(0, PER_DAY).map((t) => {
                            const late = isOverdue(t, now);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                className={`cal-task${t.done ? ' done' : ''}${late ? ' od' : ''}`}
                                style={{ '--pc': colorOf(t.priorityId) } as CSSProperties}
                                title={t.title}
                                aria-label={`${t.title}${t.done ? ', done' : late ? ', overdue' : ''}`}
                                onClick={() => onOpen(t.id)}
                              >
                                <span className="sqt">{t.title}</span>
                              </button>
                            );
                          })}
                          {its.length > PER_DAY && (
                            <button type="button" className="cal-more" onClick={() => pick(c.day)} aria-label={`${its.length - PER_DAY} more on ${shortDay(c.day)}`}>
                              +{its.length - PER_DAY} more
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="wb-note cal-legend">
              Outlined: overdue · Scribbled out: done · Ring: tasks that day
              {undated > 0 && ` · ${undated} task${undated > 1 ? 's' : ''} without a deadline ${undated > 1 ? 'are' : 'is'} only in the list`}
            </p>
          </div>

          <aside className="cal-side" aria-labelledby={`${titleId}-day`}>
            <div className="eyebrow">Selected day</div>
            <h2 id={`${titleId}-day`} className="cal-day">
              {longDay(day)}
            </h2>
            {selected.length ? (
              <ul className="wb-list" aria-label={`Due ${shortDay(day)}`}>
                {selected.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    level={level.get(t.priorityId)}
                    levels={levels.length}
                    categories={t.categoryIds.map((c) => catName.get(c) ?? '').filter(Boolean)}
                    onOpen={onOpen}
                    onToggle={(done) => act.setDone.mutateAsync({ id: t.id, done }).catch(() => setError('Could not update the task. Try again.'))}
                  />
                ))}
              </ul>
            ) : (
              <p className="wb-note">Nothing due this day.</p>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button type="button" className="btn btn-primary cal-add" onClick={() => onAdd(day)}>
              + Add task for this day
            </button>
          </aside>
        </div>
      )}
    </>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5L8 12L15 19' : 'M9 5L16 12L9 19'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
