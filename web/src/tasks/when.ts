import { addDays, localDay } from './format';

/*
 * Pure helpers for the date and time pickers (DL-1: a deadline is a day with an optional time).
 * Days are "YYYY-MM-DD" and times "HH:mm", both local, as the task form keeps them.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n: number) => String(n).padStart(2, '0');

/** A real calendar day, or null (31 February is not one). */
function dayOf(y: number, m: number, d: number): string | null {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? localDay(dt) : null;
}

/**
 * A typed date: "2026-10-22", "22/10/2026" or "22-10-26" (day first, as written in India and the UK),
 * "22 Oct" or "22 October 2026", "today", "tomorrow". Without a year, the next such day from `today`.
 */
export function parseDate(input: string, today: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '');
  if (!s) return null;
  if (s === 'today') return today;
  if (s === 'tomorrow') return addDays(today, 1);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return dayOf(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) return dayOf(m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!, +m[2]!, +m[1]!);
  // "22 Oct 2026" or "Oct 22 2026"
  const dm = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]{3,})\.?(?: (\d{4}))?$/);
  const md = s.match(/^([a-z]{3,})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/);
  const named = dm ? { d: +dm[1]!, mon: dm[2]!, y: dm[3] } : md ? { d: +md[2]!, mon: md[1]!, y: md[3] } : null;
  if (named) {
    const month = MONTHS.findIndex((name) => name.startsWith(named.mon)) + 1;
    if (!month) return null;
    if (named.y) return dayOf(+named.y, month, named.d);
    const y = +today.slice(0, 4);
    const day = dayOf(y, month, named.d);
    return day && day < today ? dayOf(y + 1, month, named.d) : day;
  }
  return null;
}

/** A typed time: "18:30", "1830", "6:30 pm", "6pm", "noon". */
export function parseTime(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, ':');
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].startsWith('p') ? 12 : 0);
  } else if (h > 23 || (!m[2] && m[1]!.length > 2)) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** "6:30 PM". */
export const time12 = (time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Tue 22 Oct 2026". */
export function dateLabel(day: string): string {
  const d = new Date(`${day}T00:00`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
}

/** "Thursday 22 October 2026", for screen readers. */
export function dateName(day: string): string {
  const d = new Date(`${day}T00:00`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
}

/** The date picker's quick picks, worked out from today. */
export function datePresets(today: string): Array<{ label: string; day: string }> {
  const t = new Date(`${today}T00:00`);
  const dow = t.getDay(); // 0 Sunday
  const saturday = dow === 0 ? today : addDays(today, 6 - dow); // a Sunday is still the weekend
  const monday = addDays(today, ((8 - dow) % 7) || 7);
  const monthEnd = localDay(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  return [
    { label: 'Today', day: today },
    { label: 'Tomorrow', day: addDays(today, 1) },
    { label: 'Weekend', day: saturday },
    { label: 'Next week', day: monday },
    { label: 'In 2 weeks', day: addDays(today, 14) },
    { label: 'Month end', day: monthEnd },
  ];
}

/** The time picker's quick picks. */
export const TIME_PRESETS = ['09:00', '10:00', '12:00', '14:00', '17:00', '18:00', '20:00', '23:59'] as const;

/** "9 AM", "11:59 PM": a preset's short name. */
export const timeShort = (time: string) => time12(time).replace(':00 ', ' ');
