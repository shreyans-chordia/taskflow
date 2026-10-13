import { describe, expect, it } from 'vitest';
import type { Category, Priority, Task } from '../api/types';
import { addDays, boardOrder, dueLabel, isLate, localDay, notePaper, openCountByCategory, toDeskData, weekDays, weekSummary } from './model';

/** What the 3D desk shows, derived from API data. Requirement IDs refer to the TaskFlow IEEE SRS. */

const cats: Category[] = [
  { id: 'c2', name: 'Development', color: '#F2AE2E', order: 1, locked: false },
  { id: 'c1', name: 'Study', color: '#4F86D9', order: 0, locked: false },
  { id: 'c9', name: 'Hobbies', color: '#2FA6A0', order: 2, locked: false },
];
const prios: Priority[] = [
  { id: 'lo', name: 'Low', color: '#4E9E78', order: 2, isDefault: false },
  { id: 'hi', name: 'High', color: '#E04A2F', order: 0, isDefault: false },
  { id: 'md', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true },
];
const task = (over: Partial<Task>): Task => ({
  id: Math.random().toString(36).slice(2), title: 'T', description: '', categoryIds: [], priorityId: 'md',
  deadline: null, hasTime: false, done: false, doneAt: null, subtasks: [], createdAt: '', updatedAt: '', ...over,
});
// A Wednesday, mid-afternoon local time.
const NOW = new Date(2026, 9, 14, 15, 30);

describe('toDeskData', () => {
  it('orders categories as the user arranged them and keeps the default icons (CAT-2)', () => {
    const d = toDeskData([], cats, prios, NOW);
    expect(d.today).toBe('2026-10-14');
    expect(d.categories.map((c) => c.name)).toEqual(['Study', 'Development', 'Hobbies']);
    expect(d.categories[0]!.icon).toBe('book');
    expect(d.categories[2]!.icon).toBe('dots'); // a category the user made
  });

  it('ranks priority levels by their order, most important highest (PR-1)', () => {
    const d = toDeskData([task({ priorityId: 'hi' }), task({ priorityId: 'lo' })], [], prios, NOW);
    expect(d.tasks.map((t) => [t.level.name, t.level.rank])).toEqual([['High', 3], ['Low', 1]]);
  });

  it('gives each level its note paper: its colour half-mixed into the paper (PR-4)', () => {
    const d = toDeskData([task({ priorityId: 'hi' }), task({ priorityId: 'lo' }), task({ priorityId: 'gone' })], [], prios, NOW);
    expect(d.tasks.map((t) => t.level.paper)).toEqual([notePaper('#E04A2F'), notePaper('#4E9E78'), notePaper('#F0A81C')]);
    expect(notePaper('#E04A2F')).toBe('#efa290'); // coral paper, dark ink still reads on it
  });

  it('falls back to the middle level when a task points at a level that no longer exists (PR-2)', () => {
    const d = toDeskData([task({ priorityId: 'gone' })], [], prios, NOW);
    expect(d.tasks[0]!.level.name).toBe('Medium');
  });

  it('reads a date-only deadline as that calendar day, whatever the time zone (DL-1)', () => {
    const d = toDeskData([task({ deadline: '2026-10-20T00:00:00.000Z', hasTime: false })], [], prios, NOW);
    expect(d.tasks[0]).toMatchObject({ due: '2026-10-20', time: null });
  });

  it('reads a deadline with a time in local time (DL-1)', () => {
    const at = new Date(2026, 9, 20, 18, 0);
    const d = toDeskData([task({ deadline: at.toISOString(), hasTime: true })], [], prios, NOW);
    expect(d.tasks[0]).toMatchObject({ due: '2026-10-20', time: '18:00' });
  });

  it('shows the first category on a note and counts subtasks (SUB-5)', () => {
    const d = toDeskData([task({ categoryIds: ['c2', 'c1'], subtasks: [{ id: 's', title: 'a', done: true }, { id: 't', title: 'b', done: false }] })], cats, prios, NOW);
    expect(d.tasks[0]!.category?.name).toBe('Development');
    expect(d.tasks[0]!.subtasks).toEqual({ done: 1, total: 2 });
  });
});

describe('the corkboard', () => {
  it('pins open tasks first, then by due day (none last), then by priority', () => {
    const d = toDeskData(
      [
        task({ title: 'done', done: true, deadline: '2026-10-10T00:00:00.000Z' }),
        task({ title: 'no date' }),
        task({ title: 'later', deadline: '2026-10-20T00:00:00.000Z' }),
        task({ title: 'soon low', deadline: '2026-10-15T00:00:00.000Z', priorityId: 'lo' }),
        task({ title: 'soon high', deadline: '2026-10-15T00:00:00.000Z', priorityId: 'hi' }),
      ],
      [], prios, NOW,
    );
    expect(boardOrder(d.tasks).map((t) => t.title)).toEqual(['soon high', 'soon low', 'later', 'no date', 'done']);
  });

  it('flags a task overdue only when it is open and its day has passed (DL-3)', () => {
    const d = toDeskData(
      [task({ deadline: '2026-10-13T00:00:00.000Z' }), task({ deadline: '2026-10-13T00:00:00.000Z', done: true }), task({ deadline: '2026-10-14T00:00:00.000Z' })],
      [], prios, NOW,
    );
    expect(d.tasks.map((t) => isLate(t, d.today))).toEqual([true, false, false]);
  });

  it('labels deadlines the way the notes print them', () => {
    const d = toDeskData(
      [task({ deadline: '2026-10-14T00:00:00.000Z' }), task({ deadline: new Date(2026, 9, 14, 18, 0).toISOString(), hasTime: true }), task({ deadline: '2026-10-20T00:00:00.000Z' }), task({})],
      [], prios, NOW,
    );
    expect(d.tasks.map((t) => dueLabel(t, d.today))).toEqual(['Today', 'Today 6:00 PM', 'Oct 20', 'No deadline']);
  });
});

describe('the notebook and the trays', () => {
  it('works in Monday-to-Sunday weeks', () => {
    expect(weekDays('2026-10-14')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(weekDays('2026-10-18')[0]).toBe('2026-10-12'); // Sunday belongs to the week before
    expect(weekDays('2026-10-14', -1)[0]).toBe('2026-10-05');
  });

  it('sums up the week: done, still due, overdue from before, and completions per day', () => {
    const d = toDeskData(
      [
        task({ done: true, doneAt: new Date(2026, 9, 13, 9).toISOString() }),
        task({ done: true, doneAt: new Date(2026, 9, 13, 20).toISOString() }),
        task({ done: true, doneAt: new Date(2026, 9, 5, 9).toISOString() }), // last week
        task({ deadline: '2026-10-16T00:00:00.000Z' }),
        task({ deadline: '2026-10-02T00:00:00.000Z' }), // overdue from an earlier week
      ],
      [], prios, NOW,
    );
    const wk = weekSummary(d);
    expect([wk.done.length, wk.open.length, wk.overdue.length]).toEqual([2, 1, 1]);
    expect(wk.perDay).toEqual([0, 2, 0, 0, 0, 0, 0]);
  });

  it('counts open tasks in every category a task carries (CAT-2)', () => {
    const d = toDeskData([task({ categoryIds: ['c1', 'c2'] }), task({ categoryIds: ['c1'] }), task({ categoryIds: ['c1'], done: true })], cats, prios, NOW);
    const n = openCountByCategory(d);
    expect([n.get('c1'), n.get('c2'), n.get('c9')]).toEqual([2, 1, undefined]);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(localDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
