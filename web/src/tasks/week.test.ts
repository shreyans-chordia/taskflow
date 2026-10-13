import { describe, expect, it } from 'vitest';
import type { Task } from '../api/types';
import { weekDays, weekReview, weekStart, weekTitle } from './week';

/** The weekly review's maths: weeks run Monday to Sunday in local days (DL-1 deadlines, DL-3 overdue, TASK-4 done). */

const mk = (id: string, extra: Partial<Task> = {}): Task => ({
  id, title: id, description: '', categoryIds: [], priorityId: 'md', deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...extra,
});
const RANK: Record<string, number> = { hi: 0, md: 1, lo: 2 };
const rank = (id: string) => RANK[id] ?? 99;
const TODAY = '2030-10-16'; // a Wednesday

const tasks = [
  mk('due-sun-hi', { deadline: '2030-10-20T00:00:00.000Z', priorityId: 'hi' }),
  mk('due-sun-done', { deadline: '2030-10-20T00:00:00.000Z', done: true, doneAt: '2030-10-15T09:00:00' }),
  mk('due-tue-late', { deadline: '2030-10-15T00:00:00.000Z', priorityId: 'lo' }),
  mk('undated-done-wed', { done: true, doneAt: '2030-10-16T09:00:00' }),
  mk('late-from-before', { deadline: '2030-10-01T00:00:00.000Z' }),
  mk('next-week', { deadline: '2030-10-24T00:00:00.000Z' }),
  mk('undated-open'),
];

describe('week maths', () => {
  it('starts weeks on Monday, from any day of the week', () => {
    expect(weekStart('2030-10-14')).toBe('2030-10-14');
    expect(weekStart(TODAY)).toBe('2030-10-14');
    expect(weekStart('2030-10-20')).toBe('2030-10-14'); // Sunday belongs to the week before it
    expect(weekStart(TODAY, -1)).toBe('2030-10-07');
    expect(weekDays(TODAY, 1)).toEqual(['2030-10-21', '2030-10-22', '2030-10-23', '2030-10-24', '2030-10-25', '2030-10-26', '2030-10-27']);
  });

  it('names the week, with short months when it spans two', () => {
    expect(weekTitle(weekDays(TODAY))).toBe('14 – 20 October');
    expect(weekTitle(weekDays(TODAY, -2))).toBe('30 Sep – 6 Oct');
  });

  it('counts the tasks due this week and the ones finished in it', () => {
    const wk = weekReview(tasks, rank, TODAY);
    expect(wk.items.map((t) => t.id).sort()).toEqual(['due-sun-done', 'due-sun-hi', 'due-tue-late', 'undated-done-wed']);
    expect(wk.done).toBe(2);
    expect(wk.open.map((t) => t.id).sort()).toEqual(['due-sun-hi', 'due-tue-late']);
  });

  it('puts each task on its deadline day, else the day it was finished; done first, then by priority', () => {
    const wk = weekReview(tasks, rank, TODAY);
    const ids = wk.perDay.map((d) => d.map((t) => t.id));
    expect(ids[1]).toEqual(['due-tue-late']);
    expect(ids[2]).toEqual(['undated-done-wed']);
    expect(ids[6]).toEqual(['due-sun-done', 'due-sun-hi']);
    expect(ids[0]).toEqual([]);
  });

  it('carries tasks overdue from earlier weeks into this week only (DL-3)', () => {
    const now = weekReview(tasks, rank, TODAY);
    expect(now.earlier.map((t) => t.id)).toEqual(['late-from-before']);
    expect(now.overdue).toBe(2);
    const last = weekReview(tasks, rank, TODAY, -1);
    expect(last.earlier).toEqual([]);
    expect(weekReview(tasks, rank, TODAY, 1).items.map((t) => t.id)).toEqual(['next-week']);
  });
});
