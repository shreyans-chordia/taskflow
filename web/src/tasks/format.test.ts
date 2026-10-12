import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deadlineParts, deadlinePayload, dueSentence, dueText, isOverdue, nextSwatch, rankLevels } from './format';

/** Deadline handling for the task screens (DL-1 deadline with optional time, DL-3 overdue). */

describe('deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 14, 15, 30)); // a Wednesday afternoon, local time
  });
  afterEach(() => vi.useRealTimers());

  it('round-trips a date-only deadline through the API format', () => {
    const p = deadlinePayload('2026-10-20', '');
    expect(p).toEqual({ deadline: '2026-10-20', hasTime: false });
    // The server stores it as midnight UTC.
    expect(deadlineParts({ deadline: '2026-10-20T00:00:00.000Z', hasTime: false })).toEqual({ date: '2026-10-20', time: '' });
  });

  it('round-trips a date and time, keeping the local clock time', () => {
    const p = deadlinePayload('2026-10-20', '18:30');
    expect(p.hasTime).toBe(true);
    expect(p.deadline).toMatch(/^2026-10-20T18:30:00[+-]\d{2}:\d{2}$/);
    // What the server would send back: the same instant as an ISO string.
    const back = new Date(p.deadline!).toISOString();
    expect(deadlineParts({ deadline: back, hasTime: true })).toEqual({ date: '2026-10-20', time: '18:30' });
  });

  it('no date means no deadline, even if a time was typed', () => {
    expect(deadlinePayload('', '09:00')).toEqual({ deadline: null, hasTime: false });
  });

  it('is overdue only when open and its day has passed', () => {
    expect(isOverdue({ deadline: '2026-10-13T00:00:00.000Z', hasTime: false, done: false })).toBe(true);
    expect(isOverdue({ deadline: '2026-10-13T00:00:00.000Z', hasTime: false, done: true })).toBe(false);
    // Due at 9 am today and it is 3:30 pm: still today's task, not overdue.
    expect(isOverdue({ deadline: new Date(2026, 9, 14, 9, 0).toISOString(), hasTime: true, done: false })).toBe(false);
  });

  it('describes deadlines in plain words', () => {
    expect(dueText({ deadline: '2026-10-14T00:00:00.000Z', hasTime: false })).toBe('Today');
    expect(dueText({ deadline: '2026-10-15T00:00:00.000Z', hasTime: false })).toBe('Tomorrow');
    expect(dueText({ deadline: new Date(2026, 9, 14, 18, 0).toISOString(), hasTime: true })).toBe('Today 6:00 PM');
    expect(dueText({ deadline: '2026-10-20T00:00:00.000Z', hasTime: false })).toBe('Tue 20 Oct');
    expect(dueText({ deadline: null, hasTime: false })).toBe('No deadline');
    expect(dueSentence({ deadline: '2026-10-12T00:00:00.000Z', hasTime: false, done: false })).toBe('Was due Mon 12 Oct');
    expect(dueSentence({ deadline: '2026-10-20T00:00:00.000Z', hasTime: false, done: false })).toBe('Due Tue 20 Oct');
  });
});

describe('priority levels and swatches', () => {
  it('orders levels most important first and fills one Ring segment less per step (PR-1)', () => {
    const levels = rankLevels([
      { id: 'l', name: 'Low', color: '#4E9E78', order: 2, isDefault: false },
      { id: 'h', name: 'High', color: '#E04A2F', order: 0, isDefault: false },
      { id: 'm', name: 'Medium', color: '#F0A81C', order: 1, isDefault: true },
    ]);
    expect(levels.map((l) => [l.name, l.filled])).toEqual([['High', 3], ['Medium', 2], ['Low', 1]]);
  });

  it('suggests the first colour not already in use', () => {
    expect(nextSwatch([{ color: '#4f86d9' }, { color: '#F2AE2E' }])).toBe('#9A68D6');
  });
});
