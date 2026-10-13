import { useId, useState } from 'react';
import { RubberSegment } from '../components/RubberSegment';
import { BREAK_RANGE, lengthOf, mmss, pomodoro as defaultStore, PRESETS, usePomodoro, WORK_RANGE, type Pomodoro, type TimerMode, type TimerState } from './pomodoro';
import '../tasks/tasks.css';
import './timer.css';

const MODES: Array<{ value: TimerMode; label: string }> = [
  { value: 'work', label: 'Focus' },
  { value: 'break', label: 'Break' },
];

/**
 * The clock, opened: the Ring on the left counts down a minute per segment, the controls sit on the right, as in the
 * room. POM-1 start (25 minutes by default), POM-2 chime and notice, POM-3 the break starts itself, POM-4 pause,
 * resume and reset. Nothing here touches tasks (POM-5).
 */
export function PomodoroView({ titleId, onExit, store = defaultStore }: { titleId: string; onExit?: () => void; store?: Pomodoro }) {
  const t = usePomodoro(store);
  const uid = useId();
  const total = lengthOf(t);
  const fresh = t.left >= total;
  const state = t.running ? (t.mode === 'work' ? 'Focusing' : 'On a break') : fresh ? 'Ready' : 'Paused';

  return (
    <div className="tv" data-view="timer">
      {onExit && (
        <button type="button" className="link tv-back" onClick={onExit}>
          ← Back to the desk
        </button>
      )}
      <div className="tv-head">
        <div>
          <div className="eyebrow">Pomodoro clock</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            Focus timer
          </h1>
        </div>
        <RubberSegment
          aria-label="Session type"
          className="tm-mode"
          items={MODES}
          value={t.mode}
          onChange={(m) => store.setMode(m)}
          disabled={t.running}
          size="lg"
          equalSlots
          trackColor="var(--g-field)"
          thumbColor="var(--pen)"
          textColor="var(--pen)"
          activeTextColor="var(--on-pen)"
        />
      </div>

      <div className="tm-wrap">
        <div className="tm-dial">
          <Dial t={t} />
          <div className="tm-face">
            <span className={`tm-state${t.running ? ' on' : ''}`}>{state}</span>
            {/* Read out on request, not every second: the status line below announces what matters. */}
            <div className="tm-clock" role="timer" aria-live="off" aria-label={`${Math.ceil(t.left / 60)} minutes left`}>
              {mmss(t.left)}
            </div>
            <div className="tm-sub">
              {t.mode === 'work' ? 'Focus' : 'Break'} · {total / 60} min
            </div>
          </div>
        </div>

        <div className="tm-side">
          <div className="field">
            <span className="label" id={`${uid}-p`}>
              Focus length
            </span>
            <div className="tm-chips" role="group" aria-labelledby={`${uid}-p`}>
              {PRESETS.map((p) => (
                <button key={p} type="button" className="fchip" aria-pressed={t.work === p} disabled={t.running} onClick={() => store.preset(p)}>
                  {p} min
                </button>
              ))}
            </div>
          </div>
          <div className="tm-two">
            <Minutes id={`${uid}-w`} label="Focus · minutes" value={t.work} range={WORK_RANGE} disabled={t.running} onCommit={(work) => store.setLengths({ work })} />
            <Minutes id={`${uid}-b`} label="Break · minutes" value={t.brk} range={BREAK_RANGE} disabled={t.running} onCommit={(brk) => store.setLengths({ brk })} />
          </div>
          <div className="tv-row tm-btns">
            <button type="button" className="btn btn-primary tm-go" onClick={store.toggle}>
              {t.running ? 'Pause' : fresh ? 'Start' : 'Resume'}
            </button>
            <button type="button" className="btn" onClick={store.reset}>
              Reset
            </button>
          </div>
          <div className="tm-stat">
            <span className="tm-big">{t.today}</span>
            <span>focus session{t.today === 1 ? '' : 's'} finished today</span>
          </div>
          <p className="wb-note tm-note" role="status">
            {t.msg || 'A chime plays when a session or break ends. The clock on your desk follows along; it is not linked to any task.'}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A minute field. What you type is kept as typed (an empty box while you retype is fine) and applied whenever it
 * is a number; leaving the field shows the length in use.
 */
function Minutes({ id, label, value, range, disabled, onCommit }: { id: string; label: string; value: number; range: readonly [number, number]; disabled: boolean; onCommit: (n: number) => void }) {
  // While you type, the box shows what you typed; otherwise the length in use (a preset may have changed it).
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="field-input">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={range[0]}
          max={range[1]}
          value={draft ?? String(value)}
          disabled={disabled}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = e.target.valueAsNumber;
            if (Number.isFinite(n)) onCommit(n);
          }}
        />
      </div>
    </div>
  );
}

const RING = 'M60 8a52 52 0 1 1 0 104a52 52 0 1 1 0-104';

/** The Ring: one segment per minute (up to 60), draining as the time runs out; coral for focus, mint for a break. */
export function ringDashes(left: number, total: number) {
  const n = Math.max(1, Math.min(60, Math.round(total / 60)));
  const gap = n > 30 ? 1.1 : n > 12 ? 1.8 : 3;
  const seg = (100 - gap * n) / n;
  const k = Math.ceil((left / total) * n - 1e-9);
  const fill = k >= n ? `${seg} ${gap}` : k <= 0 ? '0 100' : `${Array(k).fill(`${seg} ${gap}`).join(' ')} 0 100`;
  return { track: `${seg} ${gap}`, fill, lit: Math.max(0, Math.min(n, k)), segments: n };
}

function Dial({ t }: { t: TimerState }) {
  const d = ringDashes(t.left, lengthOf(t));
  return (
    <svg className="tm-ring" viewBox="0 0 120 120" aria-hidden="true" data-lit={d.lit} data-segments={d.segments}>
      <path d={RING} pathLength={100} fill="none" stroke="var(--ring-track)" strokeWidth={8} style={{ strokeDasharray: d.track }} />
      <path d={RING} pathLength={100} fill="none" stroke={t.mode === 'work' ? 'var(--coral)' : 'var(--mint)'} strokeWidth={8} style={{ strokeDasharray: d.fill }} />
    </svg>
  );
}
