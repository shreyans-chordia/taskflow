import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';

/*
 * The desk's shortcut rail with the "rubber" thumb of React Bits' RubberSegment: moving to another item stretches
 * the thumb across both, then it lands on the new one with a small squash and relaxes. The labels under the thumb
 * are revealed in the active colour through a clip-path, so the colour changes exactly at its edge.
 *
 * Unlike RubberSegment this is not a radio group: the items are actions (fly to an object, switch the lamp), so they
 * stay plain buttons in a <nav>, and there is no dragging. The thumb follows hover and keyboard focus, and rests on
 * the item whose panel is open (`active`); with nothing open it fades out when the pointer leaves.
 */

// Timings and springs from RubberSegment (speed 1, stretch 100, squash 3).
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SPRING_UI = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const SPRING_RELAX = { type: 'spring', duration: 0.16, bounce: 0 } as const;
const DILATE = 0.19;
const HANDOFF = 0.15;
const SQUASH = 3;
/** Thumb corner radius, matching the buttons. */
const RADIUS = 10;

export interface RailItem {
  key: string;
  label: string;
  ariaLabel?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}

export function RubberRail({ items, active, disabled, label }: { items: RailItem[]; active: string | null; disabled?: boolean; label: string }) {
  const reduce = useReducedMotion() ?? false;
  const inner = useRef<HTMLDivElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const slots = useRef<Array<{ l: number; r: number }>>([]);
  const cur = useRef(-1); // the slot the thumb is on or heading to; -1 when hidden
  const gen = useRef(0);
  const handoff = useRef(0);
  const hovering = useRef(false);

  const edgeL = useMotionValue(0);
  const edgeR = useMotionValue(0);
  const width = useMotionValue(0);
  const opacity = useMotionValue(0);
  const clipPath = useTransform(() => `inset(0 ${Math.max(0, width.get() - edgeR.get())}px 0 ${Math.max(0, edgeL.get())}px round ${RADIUS}px)`);

  const activeIndex = active ? items.findIndex((i) => i.key === active) : -1;

  const measure = useCallback(() => {
    const box = inner.current;
    if (!box) return;
    const pad = parseFloat(getComputedStyle(box).paddingLeft) || 0;
    slots.current = buttons.current.map((b) => (b ? { l: b.offsetLeft - pad, r: b.offsetLeft - pad + b.offsetWidth } : { l: 0, r: 0 }));
    const last = slots.current[slots.current.length - 1];
    width.set(last ? last.r : 0);
    const s = slots.current[cur.current];
    if (s) {
      edgeL.jump(s.l);
      edgeR.jump(s.r);
    }
  }, [edgeL, edgeR, width]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (inner.current) ro.observe(inner.current);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure, items.length]);

  useEffect(
    () => () => {
      window.clearTimeout(handoff.current);
      edgeL.stop();
      edgeR.stop();
      opacity.stop();
    },
    [edgeL, edgeR, opacity],
  );

  /** Lands on slot `to`: the leading edge springs in, the trailing edge overshoots by SQUASH and relaxes back. */
  const land = useCallback(
    (to: number) => {
      const b = slots.current[to];
      if (!b) return;
      const g = ++gen.current;
      const dir = Math.sign((b.l + b.r) / 2 - (edgeL.get() + edgeR.get()) / 2) || 1;
      const [lead, leadTo, trail, trailTo] = dir > 0 ? [edgeR, b.r, edgeL, b.l] : [edgeL, b.l, edgeR, b.r];
      animate(lead, leadTo, SPRING_UI);
      animate(trail, trailTo + dir * SQUASH, SPRING_UI).then(() => {
        if (gen.current === g) animate(trail, trailTo, SPRING_RELAX);
      });
    },
    [edgeL, edgeR],
  );

  /** Shows the thumb on slot `to`: appears in place if hidden, otherwise stretches across and lands. */
  const moveTo = useCallback(
    (to: number) => {
      const b = slots.current[to];
      if (!b || to === cur.current) return;
      const from = cur.current;
      cur.current = to;
      window.clearTimeout(handoff.current);
      gen.current += 1;
      if (from < 0 || reduce || opacity.get() < 0.05) {
        edgeL.jump(b.l);
        edgeR.jump(b.r);
        animate(opacity, 1, reduce ? { duration: 0 } : { duration: 0.16, ease: EASE_OUT });
        return;
      }
      animate(opacity, 1, { duration: 0.12 });
      const a = { l: edgeL.get(), r: edgeR.get() };
      const tween = { duration: DILATE, ease: EASE_OUT };
      animate(edgeL, Math.min(a.l, b.l), tween);
      animate(edgeR, Math.max(a.r, b.r), tween);
      handoff.current = window.setTimeout(() => land(to), HANDOFF * 1000);
    },
    [edgeL, edgeR, opacity, land, reduce],
  );

  /** With nothing pointed at or focused: back to the open panel's item, or fade out where it is. */
  const settle = useCallback(() => {
    if (activeIndex >= 0) return moveTo(activeIndex);
    cur.current = -1;
    window.clearTimeout(handoff.current);
    animate(opacity, 0, reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT });
  }, [activeIndex, moveTo, opacity, reduce]);

  // A panel opened or closed (from the rail or from an object on the desk).
  useEffect(() => {
    if (!hovering.current) settle();
  }, [settle]);

  return (
    <nav className="desk-rail" aria-label={label}>
      <div
        ref={inner}
        className="desk-rail-inner glass"
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          hovering.current = false;
          if (!inner.current?.contains(document.activeElement) || !document.activeElement?.matches(':focus-visible')) settle();
        }}
        onBlur={(e) => {
          if (!inner.current?.contains(e.relatedTarget as Node) && !hovering.current) settle();
        }}
      >
        {items.map((item, i) => (
          <button
            key={item.key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            aria-label={item.ariaLabel}
            aria-current={i === activeIndex ? 'true' : undefined}
            disabled={disabled}
            onPointerEnter={(e) => {
              if (disabled || e.pointerType !== 'mouse') return;
              hovering.current = true;
              moveTo(i);
            }}
            onPointerDown={(e) => {
              if (!disabled && e.pointerType !== 'mouse') moveTo(i); // touch and pen have no hover: the tap moves it
            }}
            onFocus={(e) => {
              if (e.currentTarget.matches(':focus-visible')) moveTo(i); // keyboard focus, not the focus a click gives
            }}
            onClick={item.onClick}
          >
            {item.label}
          </button>
        ))}
        <motion.div className="desk-rail-thumb" aria-hidden="true" style={{ clipPath, opacity }}>
          {items.map((item) => (
            <span key={item.key}>{item.label}</span>
          ))}
        </motion.div>
      </div>
    </nav>
  );
}
