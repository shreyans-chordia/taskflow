import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { hexToHsv, hsvToHex, normalizeHex, PALETTE } from './color';
import './color.css';

/**
 * A colour swatch that opens the room's colour picker: a big preview with the hex code, sixteen presets, and a
 * custom area (saturation/brightness square, hue slider, hex field). A preset applies at once; a custom colour
 * applies with "Use colour" or Enter in the hex field.
 */
export function ColorButton({ value, label, onChange }: { value: string; label: string; onChange: (hex: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        className="cswatch"
        style={{ '--sw': value } as CSSProperties}
        aria-label={`${label}: ${value.toUpperCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && anchor && (
        <ColorPicker
          value={value}
          anchor={anchor}
          onPick={(hex) => {
            setOpen(false);
            anchor.focus();
            if (hex !== value.toUpperCase()) onChange(hex);
          }}
          onClose={(refocus) => {
            setOpen(false);
            if (refocus) anchor.focus();
          }}
        />
      )}
    </>
  );
}

export function ColorPicker({ value, anchor, onPick, onClose }: {
  value: string;
  anchor: HTMLElement;
  onPick: (hex: string) => void;
  /** `refocus` is false when the picker closed because the user clicked somewhere else. */
  onClose: (refocus: boolean) => void;
}) {
  const start = normalizeHex(value) ?? '#4F86D9';
  const [hsv, setHsv] = useState(() => hexToHsv(start));
  const [hex, setHex] = useState(start);
  const [typed, setTyped] = useState<string | null>(null); // the hex field while someone is typing in it
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const sv = useRef<HTMLDivElement>(null);

  const setFromHsv = (next: { h: number; s: number; v: number }) => {
    setHsv(next);
    setHex(hsvToHex(next.h, next.s, next.v));
    setTyped(null);
  };

  // Beside the swatch, flipped above it when there is no room below, always inside the window.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const W = el.offsetWidth, H = el.offsetHeight;
    const left = Math.min(Math.max(12, r.left - 10), window.innerWidth - W - 12);
    let top = r.bottom + 10;
    if (top + H > window.innerHeight - 12) top = Math.max(12, r.top - H - 10);
    setPos({ left, top });
  }, [anchor]);

  // Start on the chosen preset (or the first), and close on a press anywhere else.
  useEffect(() => {
    const el = root.current;
    (el?.querySelector<HTMLElement>('.cp-sw[aria-pressed="true"]') ?? el?.querySelector<HTMLElement>('.cp-sw'))?.focus();
    const away = (e: globalThis.PointerEvent) => {
      const t = e.target as Node;
      if (!el?.contains(t) && !anchor.contains(t)) onClose(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const pickAt = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setFromHsv({ ...hsv, s, v });
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the picker only, not the panel behind it
      onClose(true);
    } else if (e.key === 'Tab') {
      // Keep focus inside the picker while it is open.
      const f = [...root.current!.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]')];
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i === 0) {
        e.preventDefault();
        f[f.length - 1]!.focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0]!.focus();
      }
    }
  };

  const svKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
    if (!step) return;
    e.preventDefault();
    setFromHsv({ ...hsv, s: Math.min(1, Math.max(0, hsv.s + step[0]!)), v: Math.min(1, Math.max(0, hsv.v + step[1]!)) });
  };

  return createPortal(
    <div
      ref={root}
      className="cpick glass"
      role="dialog"
      aria-label="Choose a colour"
      style={{ '--sw': hex, '--hue': `hsl(${Math.round(hsv.h)} 100% 50%)`, left: pos?.left ?? -9999, top: pos?.top ?? 0 } as CSSProperties}
      onKeyDown={onKey}
      // Presses inside the picker must not reach the panel's "click outside closes" handler (React bubbles portals).
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cp-head">
        <span className="cp-prev" />
        <div>
          <div className="eyebrow">Colour</div>
          <div className="cp-hexl">{hex}</div>
        </div>
        <button type="button" className="cp-x" aria-label="Close colour picker" onClick={() => onClose(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="cp-grid" role="group" aria-label="Preset colours">
        {PALETTE.map((h) => (
          <button key={h} type="button" className="cp-sw" style={{ '--sw': h } as CSSProperties} aria-label={h} aria-pressed={h === hex} onClick={() => onPick(h)} />
        ))}
      </div>
      <div className="cp-lbl">Custom</div>
      <div
        ref={sv}
        className="cp-sv"
        tabIndex={0}
        role="slider"
        aria-label="Saturation and brightness. Arrow keys adjust."
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        aria-valuenow={Math.round(hsv.v * 100)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.focus();
          pickAt(e);
        }}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && pickAt(e)}
        onKeyDown={svKey}
      >
        <span className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <input
        type="range"
        className="cp-hue"
        min={0}
        max={359}
        step={1}
        aria-label="Hue"
        value={Math.round(hsv.h)}
        onChange={(e) => setFromHsv({ ...hsv, h: +e.target.value })}
      />
      <div className="cp-row">
        <input
          className="cp-hex"
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour code"
          value={typed ?? hex}
          onChange={(e) => {
            setTyped(e.target.value);
            const h = normalizeHex(e.target.value);
            if (h) {
              setHsv(hexToHsv(h));
              setHex(h);
            }
          }}
          onBlur={() => setTyped(null)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault(); // inside the task form, Enter must not submit the task
            const h = normalizeHex(typed ?? hex);
            if (h) onPick(h);
          }}
        />
        <button type="button" className="btn btn-primary cp-use" onClick={() => onPick(hex)}>
          Use colour
        </button>
      </div>
    </div>,
    document.body,
  );
}
