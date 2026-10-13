import type { Category, Priority, Task } from '../api/types';
import type { IconKind } from './three/paint';
import { addDays, deadlineParts, localDay } from '../tasks/format';
import { mixHex } from './three/paint';

/**
 * What the desk paints, derived from the API data. Pure functions only, so they are easy to unit test.
 * Dates are compared as local calendar days ("YYYY-MM-DD"), which is how people think about deadlines.
 */
export interface DeskCategory {
  id: string;
  name: string;
  color: string;
  icon: IconKind;
}

export interface DeskLevel {
  id: string;
  name: string;
  color: string;
  /** Sticky-note paper for tasks at this level: its colour, half-mixed into the paper (see `notePaper`). */
  paper: string;
  /** Higher is more important. */
  rank: number;
}

export interface DeskTask {
  id: string;
  title: string;
  done: boolean;
  /** Local day the task was finished. */
  doneOn: string | null;
  /** Local day it is due. */
  due: string | null;
  /** Local time it is due ("HH:mm"), when it has one. */
  time: string | null;
  /** The first category, shown as a chip on the note. */
  category: DeskCategory | null;
  categoryIds: string[];
  level: DeskLevel;
  subtasks: { done: number; total: number };
}

export interface DeskData {
  today: string;
  tasks: DeskTask[];
  /** In the user's order; the first six are the trays on the organizer. */
  categories: DeskCategory[];
}

/** The six default categories keep the prototype's icons; any other gets the dots. */
const DEFAULT_ICON: Record<string, IconKind> = { study: 'book', development: 'code', personal: 'person', health: 'heart', career: 'bag', others: 'dots' };

/** The sticky-note paper for a priority colour, the same mix as the 2D notes' CSS (`.pn`). */
export const notePaper = (color: string) => mixHex(color, '#FDF9F0', 0.5);

export { addDays, localDay } from '../tasks/format';

export function toDeskData(tasks: Task[], categories: Category[], priorities: Priority[], now = new Date()): DeskData {
  const cats: DeskCategory[] = [...categories]
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name, color: c.color, icon: DEFAULT_ICON[c.name.toLowerCase()] ?? 'dots' }));
  const byCat = new Map(cats.map((c) => [c.id, c]));
  const sorted = [...priorities].sort((a, b) => a.order - b.order);
  const levels = new Map(sorted.map((p, i) => [p.id, { id: p.id, name: p.name, color: p.color, paper: notePaper(p.color), rank: sorted.length - i }]));
  const middle = sorted[Math.floor((sorted.length - 1) / 2)];
  const fallback: DeskLevel = (middle && levels.get(middle.id)) ?? { id: '', name: 'Medium', color: '#F0A81C', paper: notePaper('#F0A81C'), rank: 1 };

  return {
    today: localDay(now),
    categories: cats,
    tasks: tasks.map((t) => {
      const parts = deadlineParts(t);
      const due = parts.date || null, time = parts.time || null;
      const category = t.categoryIds.map((id) => byCat.get(id)).find(Boolean) ?? null;
      return {
        id: t.id,
        title: t.title,
        done: t.done,
        doneOn: t.doneAt ? localDay(new Date(t.doneAt)) : null,
        due,
        time,
        category,
        categoryIds: t.categoryIds,
        level: levels.get(t.priorityId) ?? fallback,
        subtasks: { done: t.subtasks.filter((s) => s.done).length, total: t.subtasks.length },
      };
    }),
  };
}

export const isLate = (t: DeskTask, today: string) => !!t.due && !t.done && t.due < today;

/** Open tasks first, then by due day (none last), then by priority. This is the order the notes are pinned in. */
export function boardOrder(tasks: DeskTask[]): DeskTask[] {
  return [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9999').localeCompare(b.due ?? '9999') || b.level.rank - a.level.rank);
}

export function dueLabel(t: DeskTask, today: string): string {
  if (!t.due) return 'No deadline';
  const time = t.time ? ` ${new Date(`2000-01-01T${t.time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
  if (t.due === today) return `Today${time}`;
  return new Date(`${t.due}T00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + time;
}

/** Monday to Sunday of the week containing `today`, shifted by `offset` weeks. */
export function weekDays(today: string, offset = 0): string[] {
  const d = new Date(`${today}T00:00`);
  const monday = addDays(today, -((d.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface WeekSummary {
  days: string[];
  done: DeskTask[];
  open: DeskTask[];
  overdue: DeskTask[];
  perDay: number[];
}

/** What the notebook shows: done this week, still due this week, overdue from before, and completions per day. */
export function weekSummary(data: DeskData, offset = 0): WeekSummary {
  const days = weekDays(data.today, offset);
  const first = days[0]!, last = days[6]!;
  const inWeek = (day: string | null) => !!day && day >= first && day <= last;
  const done = data.tasks.filter((t) => t.done && inWeek(t.doneOn));
  const open = data.tasks.filter((t) => !t.done && inWeek(t.due));
  const overdue = offset === 0 ? data.tasks.filter((t) => isLate(t, data.today) && !inWeek(t.due)) : [];
  return { days, done, open, overdue, perDay: days.map((day) => done.filter((t) => t.doneOn === day).length) };
}

/** Open tasks per category, for the tray counters. */
export function openCountByCategory(data: DeskData): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of data.tasks) if (!t.done) for (const id of new Set(t.categoryIds)) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}
