import { describe, expect, it } from 'vitest';
import type { Task } from '../api/types';
import { addMonths, monthGrid, monthLabel, tasksByDay } from './calendar';

/** The calendar panel's month maths and grouping (CAL-1 month grid, CAL-2 navigation, CAL-4, DL-4). */

const task = (id: string, deadline: string | null, extra: Partial<Task> = {}): Task => ({
  id, title: id, description: '', categoryIds: [], priorityId: 'md', deadline, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...extra,
});
const rank = (id: string) => ['hi', 'md', 'lo'].indexOf(id);

describe('month grid (CAL-1)', () => {
  it('lays October 2026 out as whole Sunday-to-Saturday weeks', () => {
    const weeks = monthGrid('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 1 October 2026 is a Thursday: the first row starts on Sunday 27 September.
    expect(weeks[0]![0]).toEqual({ day: '2026-09-27', date: 27, inMonth: false });
    expect(weeks[0]![4]).toEqual({ day: '2026-10-01', date: 1, inMonth: true });
    expect(weeks[4]![6]).toEqual({ day: '2026-10-31', date: 31, inMonth: true });
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('adds a sixth week when the month needs it, and none when it does not', () => {
    expect(monthGrid('2026-08')).toHaveLength(6); // starts on a Saturday, 31 days
    expect(monthGrid('2026-02')).toHaveLength(4); // starts on a Sunday, 28 days
  });
});

describe('month navigation (CAL-2)', () => {
  it('steps across year ends both ways', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', 0)).toBe('2026-10');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
});

describe('tasks by day (CAL-4, DL-4)', () => {
  it('puts each task on its deadline day and leaves out tasks without one', () => {
    const map = tasksByDay([task('a', '2026-10-20T00:00:00.000Z'), task('b', null), task('c', '2026-10-21T00:00:00.000Z')], rank);
    expect([...map.keys()].sort()).toEqual(['2026-10-20', '2026-10-21']);
    expect([...map.values()].flat().map((t) => t.id)).not.toContain('b');
  });

  it('keeps a date-only deadline on its own day in every time zone (stored as midnight UTC)', () => {
    expect([...tasksByDay([task('a', '2026-10-20T00:00:00.000Z')], rank).keys()]).toEqual(['2026-10-20']);
  });

  it('places a timed deadline on its local day', () => {
    const local = new Date(2026, 9, 20, 23, 30); // 11:30 pm on the 20th, local time
    expect([...tasksByDay([task('a', local.toISOString(), { hasTime: true })], rank).keys()]).toEqual(['2026-10-20']);
  });

  it('lists open tasks first, then the most important, then the earliest time', () => {
    const d = '2026-10-20T00:00:00.000Z';
    const at = (h: number) => ({ deadline: new Date(2026, 9, 20, h).toISOString(), hasTime: true });
    const list = tasksByDay(
      [
        task('done-high', d, { priorityId: 'hi', done: true }),
        task('low', d, { priorityId: 'lo' }),
        task('high-late', null, { priorityId: 'hi', ...at(18) }),
        task('high-early', null, { priorityId: 'hi', ...at(9) }),
      ],
      rank,
    ).get('2026-10-20')!;
    expect(list.map((t) => t.id)).toEqual(['high-early', 'high-late', 'low', 'done-high']);
  });
});
