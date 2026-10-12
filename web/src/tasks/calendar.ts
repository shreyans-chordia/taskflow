import type { Task } from '../api/types';
import { deadlineParts, localDay } from './format';

/**
 * Pure helpers for the calendar panel (CAL-1 month grid, CAL-2 month navigation, CAL-4 no deadline, no square).
 * Months are "YYYY-MM", days "YYYY-MM-DD", both in local time. Weeks start on Sunday, like the wall calendar.
 */

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const monthOf = (day: string) => day.slice(0, 7);

/** The month `n` months after `month` ("2026-12" + 1 = "2027-01"). */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return localDay(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "Tuesday 20 October". */
export const longDay = (day: string) => new Date(`${day}T00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

/** "Tue 20 Oct". */
export const shortDay = (day: string) => {
  const d = new Date(`${day}T00:00`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
};

export interface CalendarCell {
  day: string;
  /** Day of the month, 1–31. */
  date: number;
  /** False for the trailing days of the previous month and the leading days of the next one. */
  inMonth: boolean;
}

/** The month as whole weeks (Sunday to Saturday), padded with the neighbouring months' days. */
export function monthGrid(month: string): CalendarCell[][] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const daysInMonth = new Date(y, m, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  const out: CalendarCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i);
      row.push({ day: localDay(d), date: d.getDate(), inMonth: d.getMonth() === m - 1 });
    }
    out.push(row);
  }
  return out;
}

/**
 * Tasks grouped by the calendar day of their deadline. Tasks without a deadline are left out (CAL-4).
 * Within a day: open tasks first, then by priority (most important first), then by time and title.
 */
export function tasksByDay(tasks: Task[], rank: (priorityId: string) => number): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const { date } = deadlineParts(t);
    if (!date) continue;
    const list = map.get(date);
    if (list) list.push(t);
    else map.set(date, [t]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(a.done) - Number(b.done) || rank(a.priorityId) - rank(b.priorityId) || timeOf(a).localeCompare(timeOf(b)) || a.title.localeCompare(b.title));
  }
  return map;
}

const timeOf = (t: Task) => (t.hasTime ? deadlineParts(t).time : '99:99');
