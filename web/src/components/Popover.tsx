import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './color.css';

/**
 * The frosted popover the room's pickers open in (colour, date, time): placed under its button, flipped above it
 * when there is no room, kept inside the window. Escape closes it (and only it, not the panel behind), a press
 * anywhere else closes it, and Tab stays inside while it is open.
 */
export function Popover({ anchor, label, className = '', style, focus, onClose, children }: {
  anchor: HTMLElement;
  label: string;
  className?: string;
  style?: CSSProperties;
  /** A selector for what takes focus when it opens; the first focusable element otherwise. */
  focus?: string;
  /** `refocus` is false when it closed because the user pressed somewhere else. */
  onClose: (refocus: boolean) => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    anchor.scrollIntoView?.({ block: 'nearest' }); // a button half off screen (on a phone) comes into view first
    const r = anchor.getBoundingClientRect();
    const W = el.offsetWidth, H = el.offsetHeight;
    const left = Math.min(Math.max(12, r.left - 10), window.innerWidth - W - 12);
    let top = r.bottom + 10;
    if (top + H > window.innerHeight - 12) top = Math.max(12, Math.min(r.top - H - 10, window.innerHeight - H - 12));
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const el = root.current;
    const first = (focus && el?.querySelector<HTMLElement>(focus)) || el?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const away = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (!el?.contains(t) && !anchor.contains(t)) onClose(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the popover only, not the panel behind it
      onClose(true);
    } else if (e.key === 'Tab') {
      const f = [...root.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1]!.focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0]!.focus();
      }
    }
  };

  return createPortal(
    <div
      ref={root}
      className={`cpick glass ${className}`}
      role="dialog"
      aria-label={label}
      style={{ ...style, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onKeyDown={onKey}
      // Presses inside must not reach the panel's "click outside closes" handler (React bubbles portals).
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Focusable, in order: what Tab cycles through. Roving lists expose only their current item (tabindex 0). */
const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]';

/** The popover's head: a preview, a caption over the value, and the × (as in the colour picker). */
export function PopoverHead({ preview, caption, value, closeLabel, onClose }: { preview: ReactNode; caption: string; value: string; closeLabel: string; onClose: () => void }) {
  return (
    <div className="cp-head">
      {preview}
      <div>
        <div className="eyebrow">{caption}</div>
        <div className="cp-hexl">{value}</div>
      </div>
      <button type="button" className="cp-x" aria-label={closeLabel} onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6L18 18M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
