import type { CSSProperties } from 'react';
import type { Task } from '../api/types';
import { deadlineParts, isOverdue, rankLevels, today as todayFn } from './format';
import { TaskRow } from './TaskList';
import { useTaskActions, useTaskData } from './useTaskActions';
import { WEEKDAYS_MON, weekReview, weekTitle } from './week';

/** Blocks a day shows before "+N more". */
const PER_DAY = 4;

/**
 * The notebook, opened: one week's progress, as in the room (TASK-4 done, DL-3 overdue, PR-4 priority colours).
 * A summary, the week day by day, what is still open, and how each priority level and category is doing.
 */
export function ReviewView({ titleId, week, onWeek, onOpen }: { titleId: string; week: number; onWeek: (offset: number) => void; onOpen: (id: string) => void }) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const levels = rankLevels(priorities.data ?? []);
  const level = new Map(levels.map((l) => [l.id, l]));
  const rank = new Map(levels.map((l, i) => [l.id, i]));
  const cats = categories.data ?? [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const now = todayFn();
  const wk = weekReview(tasks.data ?? [], (id) => rank.get(id) ?? 99, now, week);
  const total = wk.items.length;
  const openList = [...wk.earlier, ...wk.open].sort(
    (a, b) => (deadlineParts(a).date || '9999').localeCompare(deadlineParts(b).date || '9999') || (rank.get(a.priorityId) ?? 99) - (rank.get(b.priorityId) ?? 99),
  );
  const byLevel = levels.map((l) => ({ key: l.id, label: l.name, color: l.color, its: wk.items.filter((t) => t.priorityId === l.id) })).filter((r) => r.its.length);
  const byCat = cats.map((c) => ({ key: c.id, label: c.name, color: c.color, its: wk.items.filter((t) => t.categoryIds.includes(c.id)) })).filter((r) => r.its.length);

  const block = (t: Task) => {
    const late = isOverdue(t, now);
    const l = level.get(t.priorityId);
    return t.done ? (
      <button key={t.id} type="button" className="blk done" title={t.title} aria-label={`${t.title}, done`} onClick={() => onOpen(t.id)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        Done
      </button>
    ) : (
      <button
        key={t.id}
        type="button"
        className={`blk${late ? ' od' : ''}`}
        style={{ '--pc': l?.color ?? '#F0A81C' } as CSSProperties}
        title={t.title}
        aria-label={`${t.title}, ${l?.name ?? 'no priority'}${late ? ', overdue' : ''}`}
        onClick={() => onOpen(t.id)}
      >
        {late ? 'Overdue' : l?.name}
      </button>
    );
  };

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Notebook · weekly progress</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            {weekTitle(wk.days)}
          </h1>
        </div>
        <div className="tv-row cal-nav">
          <button type="button" className="btn cal-step" onClick={() => onWeek(week - 1)} aria-label="Previous week">
            <Chevron dir="left" />
          </button>
          <button type="button" className="btn" onClick={() => onWeek(0)} disabled={week === 0}>
            This week
          </button>
          <button type="button" className="btn cal-step" onClick={() => onWeek(week + 1)} aria-label="Next week">
            <Chevron dir="right" />
          </button>
        </div>
      </div>

      {tasks.isPending ? (
        <p className="wb-note">Loading your week…</p>
      ) : (
        <>
          <section className="rv-sum rv-cell" aria-label="Week summary">
            <div className="rv-big">
              {wk.done}
              <small> of {total}</small>
            </div>
            <span className="rv-wl">tasks done this week</span>
            <Bar done={wk.done} total={total} large />
            <span className="rv-open">{wk.open.length} still open</span>
            {wk.overdue > 0 && <span className="stamp">{wk.overdue} overdue</span>}
          </section>

          <section className="rv-cell rv-days-sec" aria-labelledby={`${titleId}-days`}>
            <div className="rv-days-head">
              <h2 id={`${titleId}-days`} className="eyebrow rv-h">
                Day by day
              </h2>
              <div className="rv-leg">
                <span>
                  <i className="bm done" />
                  Done
                </span>
                {levels.map((l) => (
                  <span key={l.id}>
                    <i className="bm" style={{ '--pc': l.color } as CSSProperties} />
                    {l.name}
                  </span>
                ))}
                <span>
                  <i className="bm od" />
                  Dashed means overdue
                </span>
              </div>
            </div>
            <div className="rv-days">
              {wk.days.map((day, i) => {
                const its = wk.perDay[i]!;
                const dn = its.filter((t) => t.done).length;
                const date = +day.slice(8);
                return (
                  <div key={day} className={`rv-day${day === now ? ' now' : ''}`} role="group" aria-label={`${WEEKDAYS_MON[i]} ${date}${day === now ? ', today' : ''}: ${its.length ? `${dn} of ${its.length} done` : 'no tasks'}`}>
                    <div className="rv-dh">
                      <span>
                        <span className="eyebrow rv-wd">{WEEKDAYS_MON[i]}</span> <span className="rv-mono">{date}</span>
                      </span>
                      {day === now && <span className="rv-tag">TODAY</span>}
                    </div>
                    <div className="blks">
                      {its.length ? (
                        <>
                          {its.slice(0, PER_DAY).map(block)}
                          {its.length > PER_DAY && <div className="blk none">+{its.length - PER_DAY} more</div>}
                        </>
                      ) : (
                        <div className="blk none">No tasks</div>
                      )}
                    </div>
                    <div className="rv-mono rv-df">{its.length ? `${dn} of ${its.length} done` : ' '}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="rv-bottom">
            <section className="rv-cell rv-openlist" aria-labelledby={`${titleId}-open`}>
              <h2 id={`${titleId}-open`} className="eyebrow rv-h">
                Still open · {openList.length}
              </h2>
              {openList.length ? (
                <ul className="wb-list" aria-label="Still open">
                  {openList.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      level={level.get(t.priorityId)}
                      levels={levels.length}
                      categories={t.categoryIds.map((c) => catName.get(c) ?? '').filter(Boolean)}
                      onOpen={onOpen}
                      onToggle={(done) => act.setDone.mutateAsync({ id: t.id, done })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="wb-note">Nothing left open this week.</p>
              )}
            </section>
            <section className="rv-cell rv-brk" aria-label="Breakdown">
              <Breakdown title="By priority" rows={byLevel} />
              <Breakdown title="By category" rows={byCat} />
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ key: string; label: string; color: string; its: Task[] }> }) {
  return (
    <div className="rv-bcol">
      <h3 className="eyebrow rv-h">{title}</h3>
      {rows.length ? (
        rows.map((r) => {
          const d = r.its.filter((t) => t.done).length;
          return (
            <div key={r.key} className="rv-brow">
              <div className="rv-brow-head">
                <span>
                  <i className="cdot" style={{ background: r.color }} />
                  {r.label}
                </span>
                <span className="rv-mono">
                  {d} of {r.its.length}
                </span>
              </div>
              <Bar done={d} total={r.its.length} />
            </div>
          );
        })
      ) : (
        <p className="wb-note">No tasks this week.</p>
      )}
    </div>
  );
}

/** The room's segmented progress bar: one segment per task (up to 24), filled for the done ones. */
function Bar({ done, total, large }: { done: number; total: number; large?: boolean }) {
  if (!total) return <div className={`sb${large ? ' lg' : ''}`} aria-hidden="true"><i /></div>;
  const n = Math.min(total, 24);
  const k = total > 24 ? Math.round((done / total) * n) : done;
  return (
    <div className={`sb${large ? ' lg' : ''}`} role="img" aria-label={`${done} of ${total} done`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < k ? 'f' : undefined} />
      ))}
    </div>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5L8 12L15 19' : 'M9 5L16 12L9 19'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
