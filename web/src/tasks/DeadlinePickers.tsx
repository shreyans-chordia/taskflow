import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Popover, PopoverHead } from '../components/Popover';
import { addMonths, monthGrid, monthLabel, monthOf, WEEKDAYS } from './calendar';
import { addDays, today as todayFn } from './format';
import { dateLabel, dateName, datePresets, parseDate, parseTime, time12, TIME_PRESETS, timeShort } from './when';
import './pickers.css';

/*
 * The task form's deadline fields (DL-1), in the room's colour-picker style: a field-like button opens a frosted
 * popover with a preview and the value at the top, quick picks that apply at once, a custom area (a month grid; hour
 * and minute sliders), and a typed field with a "Use" button, as the colour picker has for hex codes.
 */

type Trigger = { id: string; labelId: string; disabled?: boolean };

/** The field-like button that opens a picker; its name is the field's label plus the value. */
function PickerButton({ id, labelId, disabled, icon, text, empty, open, onToggle, anchorRef }: Trigger & {
  icon: ReactNode;
  text: string;
  empty: boolean;
  open: boolean;
  onToggle: () => void;
  anchorRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={anchorRef}
      id={id}
      type="button"
      className="dt-btn"
      aria-labelledby={`${labelId} ${id}-v`}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="dt-ic" aria-hidden="true">
        {icon}
      </span>
      <span id={`${id}-v`} className={`dt-val${empty ? ' dt-empty' : ''}`}>
        {text}
      </span>
      <svg className="dt-chev" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 10l5 5 5-5" />
      </svg>
    </button>
  );
}

/** Shared open/close wiring: focus goes back to the button when the picker closes on purpose. */
function usePicker() {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) anchor?.focus();
  };
  return { anchor, setAnchor, open, toggle: () => setOpen((o) => !o), close };
}

/* ================= date ================= */

export function DateButton({ value, onChange, ...trigger }: Trigger & { value: string; onChange: (day: string) => void }) {
  const p = usePicker();
  return (
    <>
      <PickerButton {...trigger} anchorRef={p.setAnchor} open={p.open} onToggle={p.toggle} icon={<CalendarIcon />} text={value ? dateLabel(value) : 'No deadline'} empty={!value} />
      {p.open && p.anchor && (
        <DatePicker
          value={value}
          anchor={p.anchor}
          onPick={(day) => {
            p.close(true);
            if (day !== value) onChange(day);
          }}
          onClose={p.close}
        />
      )}
    </>
  );
}

export function DatePicker({ value, anchor, onPick, onClose }: { value: string; anchor: HTMLElement; onPick: (day: string) => void; onClose: (refocus: boolean) => void }) {
  const today = todayFn();
  const [cursor, setCursor] = useState(value || today); // the day the grid's keyboard focus is on
  const [month, setMonth] = useState(monthOf(value || today));
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState(false);
  const grid = useRef<HTMLTableElement>(null);
  const moved = useRef(false);
  const shown = value || cursor;

  // After an arrow key, focus follows the cursor (into the next month if need be).
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus();
  }, [cursor, month]);

  const moveTo = (day: string) => {
    moved.current = true;
    setCursor(day);
    setMonth(monthOf(day));
  };

  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const d = new Date(`${cursor}T00:00`);
    const steps: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      Home: () => addDays(cursor, -d.getDay()),
      End: () => addDays(cursor, 6 - d.getDay()),
      PageUp: () => shiftMonth(cursor, -1),
      PageDown: () => shiftMonth(cursor, 1),
    };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    moveTo(step());
  };

  const applyTyped = () => {
    const day = parseDate(typed, today);
    if (day) onPick(day);
    else setBad(true);
  };

  const cursorInMonth = monthOf(cursor) === month;
  const presets = datePresets(today);

  return (
    <Popover anchor={anchor} label="Choose a date" className="dpick" focus='.dp-day[tabindex="0"]' onClose={onClose}>
      <PopoverHead preview={<PagePreview day={shown} />} caption="Deadline" value={dateLabel(shown)} closeLabel="Close date picker" onClose={() => onClose(true)} />
      <div className="dp-pres" role="group" aria-label="Quick picks">
        {presets.map((pr) => (
          <button key={pr.label} type="button" className="dp-pre" aria-pressed={pr.day === value} aria-label={`${pr.label}, ${dateName(pr.day)}`} onClick={() => onPick(pr.day)}>
            <span>{pr.label}</span>
            <span className="dp-pre-d">{shortDate(pr.day)}</span>
          </button>
        ))}
      </div>
      <div className="dp-nav">
        <span className="cp-lbl">{monthLabel(month)}</span>
        <button type="button" className="cp-x" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
          <Chevron dir="left" />
        </button>
        <button type="button" className="cp-x" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
          <Chevron dir="right" />
        </button>
      </div>
      <table ref={grid} className="dp-grid" aria-label={monthLabel(month)} onKeyDown={onGridKey}>
        <thead>
          <tr>
            {WEEKDAYS.map((w) => (
              <th key={w} scope="col" abbr={w}>
                {w.slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGrid(month).map((week) => (
            <tr key={week[0]!.day}>
              {week.map((c) => {
                // One day in the grid is in the Tab order: the cursor, or the 1st when the cursor is in another month.
                const tabbable = cursorInMonth ? c.day === cursor : c.inMonth && c.date === 1;
                return (
                  <td key={c.day}>
                    <button
                      type="button"
                      className={`dp-day${c.inMonth ? '' : ' out'}${c.day === today ? ' today' : ''}`}
                      data-day={c.day}
                      tabIndex={tabbable ? 0 : -1}
                      aria-pressed={c.day === value}
                      aria-label={`${dateName(c.day)}${c.day === today ? ', today' : ''}`}
                      onClick={() => onPick(c.day)}
                      onFocus={() => setCursor(c.day)}
                    >
                      {c.date}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="cp-row">
        <input
          className={`cp-hex dt-typed${bad ? ' bad' : ''}`}
          spellCheck={false}
          aria-label="Type a date"
          aria-invalid={bad || undefined}
          aria-describedby={bad ? 'dp-bad' : undefined}
          placeholder="e.g. 22/10/2026"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault(); // inside the task form, Enter must not submit the task
            applyTyped();
          }}
        />
        <button type="button" className="btn btn-primary cp-use" disabled={!typed.trim()} onClick={applyTyped}>
          Use date
        </button>
      </div>
      {bad && (
        <p className="dt-err" id="dp-bad" role="alert">
          Try 22/10/2026, 22 Oct or tomorrow.
        </p>
      )}
      {value && (
        <button type="button" className="link dt-clear" onClick={() => onPick('')}>
          No deadline
        </button>
      )}
    </Popover>
  );
}

/** The same day of the month in the next (or previous) month, or that month's last day. */
function shiftMonth(day: string, n: number): string {
  const target = addMonths(monthOf(day), n);
  const [y, m] = target.split('-').map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return `${target}-${String(Math.min(+day.slice(8), last)).padStart(2, '0')}`;
}

/** "Sat 17". */
function shortDate(day: string) {
  const d = new Date(`${day}T00:00`);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.getDate()}`;
}

/** A tear-off calendar page: the month on a blue band over the day's number. */
function PagePreview({ day }: { day: string }) {
  const d = new Date(`${day}T00:00`);
  return (
    <span className="dp-prev" aria-hidden="true">
      <span className="dp-prev-m">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
      <span className="dp-prev-d">{d.getDate()}</span>
    </span>
  );
}

/* ================= time ================= */

export function TimeButton({ value, onChange, ...trigger }: Trigger & { value: string; onChange: (time: string) => void }) {
  const p = usePicker();
  return (
    <>
      <PickerButton {...trigger} anchorRef={p.setAnchor} open={p.open} onToggle={p.toggle} icon={<ClockIcon />} text={value ? time12(value) : 'No time'} empty={!value} />
      {p.open && p.anchor && (
        <TimePicker
          value={value}
          anchor={p.anchor}
          onPick={(time) => {
            p.close(true);
            if (time !== value) onChange(time);
          }}
          onClose={p.close}
        />
      )}
    </>
  );
}

export function TimePicker({ value, anchor, onPick, onClose }: { value: string; anchor: HTMLElement; onPick: (time: string) => void; onClose: (refocus: boolean) => void }) {
  const start = value || '09:00';
  const [h, setH] = useState(+start.slice(0, 2));
  const [m, setM] = useState(+start.slice(3, 5));
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState(false);
  const pending = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const use = () => {
    if (!typed.trim()) return onPick(pending);
    const t = parseTime(typed);
    if (t) onPick(t);
    else setBad(true);
  };

  return (
    <Popover anchor={anchor} label="Choose a time" className="tpick" focus={(TIME_PRESETS as readonly string[]).includes(value) ? '.tp-pre[aria-pressed="true"]' : '.tp-pre'} onClose={onClose}>
      <PopoverHead preview={<ClockPreview time={pending} />} caption="Time" value={`${time12(pending)} · ${pending}`} closeLabel="Close time picker" onClose={() => onClose(true)} />
      <div className="tp-pres" role="group" aria-label="Quick picks">
        {TIME_PRESETS.map((t) => (
          <button key={t} type="button" className="tp-pre" aria-pressed={t === value} aria-label={time12(t)} onClick={() => onPick(t)}>
            {timeShort(t)}
          </button>
        ))}
      </div>
      <div className="cp-lbl">Custom</div>
      <Slider label="Hour" value={h} max={23} text={String(h).padStart(2, '0')} valueText={time12(pending)} onChange={setH} />
      <Slider label="Minute" value={m} max={59} text={String(m).padStart(2, '0')} valueText={time12(pending)} onChange={setM} />
      <div className="cp-row">
        <input
          className={`cp-hex dt-typed${bad ? ' bad' : ''}`}
          spellCheck={false}
          aria-label="Type a time"
          aria-invalid={bad || undefined}
          aria-describedby={bad ? 'tp-bad' : undefined}
          placeholder="e.g. 6:30 pm"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            setBad(false);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault(); // inside the task form, Enter must not submit the task
            use();
          }}
        />
        <button type="button" className="btn btn-primary cp-use" onClick={use}>
          Use time
        </button>
      </div>
      {bad && (
        <p className="dt-err" id="tp-bad" role="alert">
          Try 18:30, 6:30 pm or 6pm.
        </p>
      )}
      {value && (
        <button type="button" className="link dt-clear" onClick={() => onPick('')}>
          No time
        </button>
      )}
    </Popover>
  );
}

/** A slider in the hue slider's style, filled up to its value. */
function Slider({ label, value, max, text, valueText, onChange }: { label: string; value: number; max: number; text: string; valueText: string; onChange: (n: number) => void }) {
  return (
    <label className="tp-sl">
      <span className="tp-sl-l">{label}</span>
      <input
        type="range"
        className="tp-range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={`${label} ${text}, ${valueText}`}
        style={{ '--fill': `${(value / max) * 100}%` } as CSSProperties}
        onChange={(e) => onChange(+e.target.value)}
      />
      <span className="tp-sl-v">{text}</span>
    </label>
  );
}

/** A small clock face showing the time being picked: the Ring motif with two hands. */
function ClockPreview({ time }: { time: string }) {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const hourA = ((h % 12) + m / 60) * 30, minA = m * 6;
  return (
    <svg className="tp-prev" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="20" className="tp-face" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="22" y1="4.5" x2="22" y2={i % 3 ? '6.5' : '8'} transform={`rotate(${i * 30} 22 22)`} className="tp-tick" />
      ))}
      <line x1="22" y1="22" x2="22" y2="12" transform={`rotate(${hourA} 22 22)`} className="tp-hand h" />
      <line x1="22" y1="22" x2="22" y2="8" transform={`rotate(${minA} 22 22)`} className="tp-hand m" />
      <circle cx="22" cy="22" r="2.2" className="tp-pin" />
    </svg>
  );
}

/* ================= icons ================= */

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 5L8 12L15 19' : 'M9 5L16 12L9 19'} />
    </svg>
  );
}
