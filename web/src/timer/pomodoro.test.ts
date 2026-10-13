import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPomodoro, mmss, type Pomodoro, type TimerNotice } from './pomodoro';

/** The Pomodoro timer's engine (SRS §4.8, POM-1..POM-5), on fake time. */

let store: Pomodoro;
let chime: ReturnType<typeof vi.fn<(up: boolean) => void>>;
let notices: TimerNotice[];
const advance = (ms: number) => vi.advanceTimersByTime(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2030, 9, 16, 9));
  chime = vi.fn();
  notices = [];
  store = createPomodoro({ chime, unlockAudio: () => undefined });
  store.onNotice((n) => notices.push(n));
});
afterEach(() => {
  store.dispose();
  vi.useRealTimers();
});

describe('Pomodoro timer', () => {
  it('starts a 25-minute focus session by default (POM-1)', () => {
    expect(store.get()).toMatchObject({ mode: 'work', work: 25, brk: 5, left: 1500, running: false });
    store.start();
    advance(60_000);
    expect(store.get()).toMatchObject({ running: true, left: 1440 });
    expect(mmss(store.get().left)).toBe('24:00');
  });

  it('starts the break on its own when focus ends, with a chime and a notice (POM-2, POM-3)', () => {
    store.start();
    advance(25 * 60_000);
    expect(store.get()).toMatchObject({ mode: 'break', left: 300, running: true, today: 1 });
    expect(chime).toHaveBeenCalledWith(true);
    expect(notices.at(-1)).toMatchObject({ text: 'Focus session done. 5-minute break started.' });
    expect(store.get().msg).toBe('Focus session done. 5-minute break started.');
  });

  it('stops after the break, ready for the next session, and offers to start it (POM-2)', () => {
    store.start();
    advance(30 * 60_000);
    expect(store.get()).toMatchObject({ mode: 'work', left: 1500, running: false, today: 1 });
    expect(chime).toHaveBeenLastCalledWith(false);
    expect(notices.at(-1)).toMatchObject({ text: 'Break over. Ready for the next session.', action: 'start' });
    advance(60_000);
    expect(store.get().left).toBe(1500); // stays put until started
  });

  it('pauses, resumes from where it was, and resets (POM-4)', () => {
    store.start();
    advance(90_000);
    store.pause();
    expect(store.get()).toMatchObject({ running: false, left: 1410 });
    advance(10 * 60_000);
    expect(store.get().left).toBe(1410);
    store.toggle();
    advance(30_000);
    expect(store.get()).toMatchObject({ running: true, left: 1380 });
    store.reset();
    expect(store.get()).toMatchObject({ running: false, mode: 'work', left: 1500, msg: '' });
    advance(60_000);
    expect(store.get().left).toBe(1500);
  });

  it('keeps time from the clock, so a throttled tab catches up when it comes back', () => {
    store.start();
    vi.setSystemTime(Date.now() + 10 * 60_000); // ten minutes pass without a tick
    store.tick();
    expect(store.get().left).toBe(900);
  });

  it('lets you choose the lengths while stopped, within limits (TBD-1)', () => {
    store.preset(45);
    expect(store.get()).toMatchObject({ work: 45, left: 2700 });
    store.setLengths({ work: 500, brk: 0 });
    expect(store.get()).toMatchObject({ work: 120, brk: 1 });
    store.setMode('break');
    expect(store.get()).toMatchObject({ mode: 'break', left: 60 });
    store.setLengths({ brk: 10 });
    expect(store.get().left).toBe(600);
    store.start();
    store.preset(15);
    store.setMode('work');
    store.setLengths({ brk: 3 });
    expect(store.get()).toMatchObject({ mode: 'break', work: 120, brk: 10 }); // nothing changes while it runs
  });

  it('counts finished focus sessions per day', () => {
    store.preset(15);
    store.start();
    advance(20 * 60_000); // focus and break
    store.start();
    advance(15 * 60_000);
    expect(store.get().today).toBe(2);
    store.reset();
    vi.setSystemTime(new Date(2030, 9, 17, 9));
    store.start();
    expect(store.get().today).toBe(0);
  });

  it('tells its listeners only when something they show changes', () => {
    const seen = vi.fn();
    store.subscribe(seen);
    store.start();
    seen.mockClear();
    advance(5_000);
    expect(seen).toHaveBeenCalledTimes(5); // once a second, though it ticks four times a second
  });

  it('knows nothing about tasks (POM-5)', async () => {
    const source = await import('./pomodoro?raw').then((m: { default: string }) => m.default);
    expect(source).not.toMatch(/from '\.\.\/(tasks|api)\//);
  });
});
