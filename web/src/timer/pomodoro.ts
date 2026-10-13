import { useSyncExternalStore } from 'react';

/*
 * The Pomodoro timer (SRS §4.8), as in the room: a focus session, then a break that starts on its own.
 * It knows nothing about tasks and imports nothing from them (POM-5). It lives outside React so it keeps running
 * while its panel is closed, and the clock on the desk follows it.
 * Time is measured from an end timestamp, not by counting ticks, so a throttled background tab stays correct.
 */

export type TimerMode = 'work' | 'break';

export interface TimerState {
  /** Focus length in minutes (POM-1: 25 by default). */
  work: number;
  /** Break length in minutes (POM-3: 5 by default). */
  brk: number;
  mode: TimerMode;
  /** Whole seconds left. */
  left: number;
  running: boolean;
  /** Focus sessions finished today (local day). */
  today: number;
  /** The last thing that happened, for the panel's status line. */
  msg: string;
}

/** A moment worth telling the user about wherever they are (POM-2). */
export interface TimerNotice {
  id: number;
  text: string;
  /** How long it stays up, in ms. */
  ms: number;
  /** The break is over: offer to start the next focus session. */
  action?: 'start';
}

export const WORK_RANGE = [1, 120] as const;
export const BREAK_RANGE = [1, 30] as const;
export const PRESETS = [15, 25, 45, 60] as const;
export const TICK_MS = 250;

export const lengthOf = (s: Pick<TimerState, 'work' | 'brk' | 'mode'>) => (s.mode === 'work' ? s.work : s.brk) * 60;
export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const clamp = (n: number, [lo, hi]: readonly [number, number], fallback: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback);
const dayKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export interface PomodoroDeps {
  now?: () => number;
  /** Plays the end-of-interval sound; `up` is a focus session ending, down a break. */
  chime?: (up: boolean) => void;
  /** Called from a user gesture (Start), so the browser lets the chime play later. */
  unlockAudio?: () => void;
}

export function createPomodoro({ now = Date.now, chime = playChime, unlockAudio = initAudio }: PomodoroDeps = {}) {
  let state: TimerState = { work: 25, brk: 5, mode: 'work', left: 25 * 60, running: false, today: 0, msg: '' };
  let endAt = 0;
  let todayKey = dayKey(now());
  let iv: ReturnType<typeof setInterval> | undefined;
  let noticeId = 0;
  const listeners = new Set<() => void>();
  const noticeListeners = new Set<(n: TimerNotice) => void>();

  const set = (patch: Partial<TimerState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const notify = (text: string, ms: number, action?: 'start') => {
    const n: TimerNotice = { id: ++noticeId, text, ms, action };
    noticeListeners.forEach((l) => l(n));
  };
  const remaining = () => Math.max(0, Math.ceil((endAt - now()) / 1000));
  const stopInterval = () => {
    if (iv !== undefined) clearInterval(iv);
    iv = undefined;
  };

  function tick() {
    if (!state.running) return;
    const left = remaining();
    if (left > 0) {
      if (left !== state.left) set({ left });
      return;
    }
    if (state.mode === 'work') {
      // POM-3: the break starts on its own. POM-2: a chime and a notice.
      const key = dayKey(now());
      const today = key === todayKey ? state.today + 1 : 1;
      todayKey = key;
      endAt = now() + state.brk * 60 * 1000;
      const msg = `Focus session done. ${state.brk}-minute break started.`;
      set({ mode: 'break', left: state.brk * 60, today, msg });
      chime(true);
      notify(msg, 12000);
    } else {
      stopInterval();
      const msg = 'Break over. Ready for the next session.';
      set({ mode: 'work', left: state.work * 60, running: false, msg });
      chime(false);
      notify(msg, 15000, 'start');
    }
  }

  /** POM-1 start, POM-4 resume: counts down from what is left. */
  function start() {
    if (state.running) return;
    unlockAudio();
    if (dayKey(now()) !== todayKey) {
      todayKey = dayKey(now());
      state = { ...state, today: 0 };
    }
    endAt = now() + state.left * 1000;
    stopInterval();
    iv = setInterval(tick, TICK_MS);
    set({ running: true, msg: '' });
  }

  /** POM-4 pause: keeps what is left. */
  function pause() {
    if (!state.running) return;
    const left = remaining();
    stopInterval();
    set({ running: false, left });
  }

  const onVisible = () => {
    if (typeof document !== 'undefined' && !document.hidden) tick();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    onNotice(l: (n: TimerNotice) => void) {
      noticeListeners.add(l);
      return () => void noticeListeners.delete(l);
    },
    start,
    pause,
    toggle: () => (state.running ? pause() : start()),
    /** POM-4 reset: back to a full focus session, stopped. */
    reset() {
      stopInterval();
      set({ running: false, mode: 'work', left: state.work * 60, msg: '' });
    },
    /** Switch between a focus session and a break while stopped. */
    setMode(mode: TimerMode) {
      if (state.running) return;
      set({ mode, left: lengthOf({ ...state, mode }), msg: '' });
    },
    /** A focus-length chip: that many minutes, ready to start. */
    preset(minutes: number) {
      if (state.running) return;
      const work = clamp(minutes, WORK_RANGE, state.work);
      set({ work, mode: 'work', left: work * 60, msg: '' });
    },
    /** The minute fields (TBD-1: lengths are the user's to choose). The current interval restarts at its new length. */
    setLengths({ work, brk }: { work?: number; brk?: number }) {
      if (state.running) return;
      const next = { ...state, work: work === undefined ? state.work : clamp(work, WORK_RANGE, 25), brk: brk === undefined ? state.brk : clamp(brk, BREAK_RANGE, 5) };
      set({ work: next.work, brk: next.brk, left: lengthOf(next) });
    },
    /** For tests: run a tick now. */
    tick,
    dispose() {
      stopInterval();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      listeners.clear();
      noticeListeners.clear();
    },
  };
}

export type Pomodoro = ReturnType<typeof createPomodoro>;

/** The app's one timer: the panel, the desk clock and the notices all read it. */
export const pomodoro = createPomodoro();

export function usePomodoro(store: Pomodoro = pomodoro): TimerState {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/* Two soft bell tones, as in the room: rising when a focus session ends, falling when a break does. */
let audio: AudioContext | null = null;

function initAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // No sound, then; the notice still shows.
  }
}

function playChime(up: boolean) {
  if (!audio) return;
  const t = audio.currentTime;
  [0, 0.2].forEach((dt, i) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = (up ? [660, 880] : [880, 660])[i]!;
    g.gain.setValueAtTime(0, t + dt);
    g.gain.linearRampToValueAtTime(0.16, t + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 1.1);
    o.connect(g);
    g.connect(audio!.destination);
    o.start(t + dt);
    o.stop(t + dt + 1.2);
  });
}
