import type { Priority, Task } from '../api/types';

/**
 * Date and label helpers shared by the task panels and the 3D desk. Deadlines are compared as local calendar
 * days ("YYYY-MM-DD"), which is how people think about them. Requirement IDs refer to the TaskFlow IEEE SRS.
 */

const pad = (n: number) => String(n).padStart(2, '0');
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
};
export const today = () => localDay(new Date());

/** The calendar day ("YYYY-MM-DD") and, when set, the local time ("HH:mm") of a task's deadline (DL-1). */
export function deadlineParts(t: Pick<Task, 'deadline' | 'hasTime'>): { date: string; time: string } {
  if (!t.deadline) return { date: '', time: '' };
  // A date without a time is stored as midnight UTC: its calendar day is the date part, in every time zone.
  if (!t.hasTime) return { date: t.deadline.slice(0, 10), time: '' };
  const d = new Date(t.deadline);
  return { date: localDay(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * What the API expects for a deadline picked in the form: a plain date, or a local date-time with its UTC
 * offset (so "6 pm" stays 6 pm wherever the server runs). No date means no deadline.
 */
export function deadlinePayload(date: string, time: string): { deadline: string | null; hasTime: boolean } {
  if (!date) return { deadline: null, hasTime: false };
  if (!time) return { deadline: date, hasTime: false };
  const local = new Date(`${date}T${time}:00`);
  const off = -local.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return { deadline: `${date}T${time}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`, hasTime: true };
}

/** Open and past its day (DL-3). A deadline later today is not overdue yet. */
export function isOverdue(t: Pick<Task, 'deadline' | 'hasTime' | 'done'>, day = today()): boolean {
  const { date } = deadlineParts(t);
  return !t.done && !!date && date < day;
}

const fmtTime = (time: string) => new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Today 6:00 PM", "Tue 20 Oct", "No deadline". */
export function dueText(t: Pick<Task, 'deadline' | 'hasTime'>, day = today()): string {
  const { date, time } = deadlineParts(t);
  if (!date) return 'No deadline';
  const d = new Date(`${date}T00:00`);
  const label = date === day ? 'Today' : date === addDays(day, 1) ? 'Tomorrow' : `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
  return time ? `${label} ${fmtTime(time)}` : label;
}

/** "Due Tue 20 Oct", "Was due Mon 12 Oct" for overdue tasks, "No deadline". */
export function dueSentence(t: Pick<Task, 'deadline' | 'hasTime' | 'done'>, day = today()): string {
  if (!t.deadline) return 'No deadline';
  return `${isOverdue(t, day) ? 'Was due' : 'Due'} ${dueText(t, day)}`;
}

/** Priority levels, most important first, with how many Ring segments each fills (PR-1). */
export function rankLevels(levels: Priority[]): Array<Priority & { filled: number }> {
  const sorted = [...levels].sort((a, b) => a.order - b.order);
  return sorted.map((p, i) => ({ ...p, filled: sorted.length - i }));
}

/** Swatches offered for a new category or priority level; the first one not already used is picked by default. */
export const SWATCHES = ['#4F86D9', '#F2AE2E', '#9A68D6', '#6DB352', '#E25F5F', '#2FA6A0', '#D96BB0', '#8C6A4F', '#5C6BC0', '#8E959E'];
export const PRIORITY_SWATCHES = ['#8E44AD', '#2F80ED', '#C2185B', '#00897B', '#6D4C41', '#455A64'];
export const nextSwatch = (used: Array<{ color: string }>, swatches = SWATCHES) =>
  swatches.find((c) => !used.some((u) => u.color.toLowerCase() === c.toLowerCase())) ?? swatches[used.length % swatches.length]!;
