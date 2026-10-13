import { useRef, useState, type KeyboardEvent } from 'react';
import { Popover, PopoverHead } from '../components/Popover';
import './pickers.css';

/*
 * Where a new priority level sits among the others (PR-2), in the colour picker's style: a field-like button opens a
 * frosted popover listing every slot, each with a little ladder that shows the new level (in its colour) among the
 * existing ones. Slot 0 is the top, the most important.
 */

type Level = { id: string; name: string; color: string };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
export const slotLabel = (levels: Level[], slot: number) => (slot === 0 ? 'At the top' : `Below ${levels[slot - 1]?.name ?? ''}`);
const slotNote = (levels: Level[], slot: number) => `${ordinal(slot + 1)} of ${levels.length + 1}${slot === 0 ? ' · highest' : slot === levels.length ? ' · lowest' : ''}`;

export function PlaceButton({ levels, color, value, onChange, label = 'Where it sits' }: {
  levels: Level[];
  /** The new level's colour, shown in each ladder. */
  color: string;
  value: number;
  onChange: (slot: number) => void;
  label?: string;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) anchor?.focus();
  };
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className="dt-btn pl-btn"
        aria-label={`${label}: ${slotLabel(levels, value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dt-ic" aria-hidden="true">
          <Ladder levels={levels} slot={value} color={color} size="sm" />
        </span>
        <span className="dt-val pl-val">{slotLabel(levels, value)}</span>
        <svg className="dt-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" />
        </svg>
      </button>
      {open && anchor && (
        <PlaceMenu
          levels={levels}
          color={color}
          value={value}
          label={label}
          anchor={anchor}
          onPick={(slot) => {
            close(true);
            if (slot !== value) onChange(slot);
          }}
          onClose={close}
        />
      )}
    </>
  );
}

export function PlaceMenu({ levels, color, value, label, anchor, onPick, onClose }: {
  levels: Level[];
  color: string;
  value: number;
  label: string;
  anchor: HTMLElement;
  onPick: (slot: number) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [active, setActive] = useState(value); // the slot the keyboard is on, previewed in the head
  const list = useRef<HTMLDivElement>(null);
  const slots = Array.from({ length: levels.length + 1 }, (_, i) => i);

  const go = (slot: number) => {
    const s = Math.max(0, Math.min(levels.length, slot));
    setActive(s);
    list.current?.querySelector<HTMLElement>(`[data-slot="${s}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: levels.length }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    go(to);
  };

  return (
    <Popover anchor={anchor} label={label} className="plpick" focus='.pl-opt[aria-selected="true"]' onClose={onClose}>
      <PopoverHead
        preview={<span className="pl-prev"><Ladder levels={levels} slot={active} color={color} size="lg" /></span>}
        caption="Position"
        value={slotNote(levels, active)}
        closeLabel="Close position menu"
        onClose={() => onClose(true)}
      />
      <div ref={list} className="pl-list" role="listbox" aria-label={label} onKeyDown={onKey}>
        {slots.map((slot) => (
          <div
            key={slot}
            role="option"
            className="pl-opt"
            data-slot={slot}
            tabIndex={slot === active ? 0 : -1}
            aria-selected={slot === value}
            onFocus={() => setActive(slot)}
            onMouseEnter={() => setActive(slot)}
            onClick={() => onPick(slot)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault(); // inside the task form, Enter must not submit the task
              onPick(slot);
            }}
          >
            <Ladder levels={levels} slot={slot} color={color} size="md" />
            <span className="pl-text">
              <span className="pl-name">
                {slot > 0 && <i className="cdot" style={{ background: levels[slot - 1]!.color }} />}
                {slotLabel(levels, slot)}
              </span>
              <span className="pl-note">{slotNote(levels, slot)}</span>
            </span>
            {slot === value && (
              <svg className="pl-tick" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </Popover>
  );
}

/** The levels as a stack of bars, most important on top, with the new one (in its colour, wider) at `slot`. */
function Ladder({ levels, slot, color, size }: { levels: Level[]; slot: number; color: string; size: 'sm' | 'md' | 'lg' }) {
  const bars = levels.map((l) => ({ key: l.id, color: l.color, fresh: false }));
  bars.splice(slot, 0, { key: 'new', color, fresh: true });
  return (
    <span className={`pl-ladder ${size}`} aria-hidden="true">
      {bars.map((b) => (
        <i key={b.key} className={b.fresh ? 'fresh' : undefined} style={{ background: b.color }} />
      ))}
    </span>
  );
}
