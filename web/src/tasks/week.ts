import type { Task } from '../api/types';
import { addDays, deadlineParts, isOverdue, localDay } from './format';

/**
 * The weekly review's maths (pure). Weeks run Monday to Sunday in local days, as on the room's notebook.
 * A week's tasks are the ones due in it, plus the ones finished in it (DL-1 deadlines, TASK-4 done).
 */

export const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** The Monday of the week `offset` weeks from the one holding `today` ("YYYY-MM-DD"). */
export function weekStart(today: string, offset = 0): string {
  const d = new Date(`${today}T00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  return localDay(d);
}

export const weekDays = (today: string, offset = 0) => {
  const start = weekStart(today, offset);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "12 – 18 October", or "29 Sep – 5 Oct" across two months (names spelt out here: browsers disagree on "Sept"). */
export function weekTitle(days: string[]): string {
  const a = new Date(`${days[0]}T00:00`), b = new Date(`${days[6]}T00:00`);
  const short = (d: Date) => MONTHS[d.getMonth()]!.slice(0, 3);
  return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${short(a)} – ${b.getDate()} ${short(b)}`;
}

export interface WeekReview {
  days: string[];
  /** Every task of the week: due in it, or finished in it. */
  items: Task[];
  /** The week's tasks by day (its deadline day, else the day it was finished): done first, then most important. */
  perDay: Task[][];
  done: number;
  open: Task[];
  /** This week only: tasks overdue from before the week, still open. */
  earlier: Task[];
  overdue: number;
}

export function weekReview(tasks: Task[], rank: (priorityId: string) => number, today: string, offset = 0): WeekReview {
  const days = weekDays(today, offset);
  const inWeek = (day: string | null | undefined) => !!day && day >= days[0]! && day <= days[6]!;
  const due = (t: Task) => deadlineParts(t).date || null;
  const finished = (t: Task) => (t.done && t.doneAt ? localDay(new Date(t.doneAt)) : null);
  const items = tasks.filter((t) => inWeek(due(t)) || inWeek(finished(t)));
  const dayOf = (t: Task) => (inWeek(due(t)) ? due(t) : finished(t));
  const perDay = days.map((day) =>
    items.filter((t) => dayOf(t) === day).sort((a, b) => Number(b.done) - Number(a.done) || rank(a.priorityId) - rank(b.priorityId)),
  );
  const earlier = offset === 0 ? tasks.filter((t) => isOverdue(t, today) && !inWeek(due(t))) : [];
  return {
    days,
    items,
    perDay,
    done: items.filter((t) => t.done).length,
    open: items.filter((t) => !t.done),
    earlier,
    overdue: items.filter((t) => isOverdue(t, today)).length + earlier.length,
  };
}
