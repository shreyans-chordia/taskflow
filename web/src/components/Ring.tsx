const PATH = 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18';

/** The brand's segmented Ring: `filled` of `segments` arcs, drawn clockwise from the top. */
export function Ring({ filled, segments, color, size = 24, track = 'var(--ring-track)' }: { filled: number; segments: number; color: string; size?: number; track?: string }) {
  const n = Math.max(1, Math.min(60, segments));
  const gap = n === 1 ? 0 : n > 30 ? 1.1 : 6;
  const seg = (100 - gap * n) / n;
  const k = Math.max(0, Math.min(n, filled));
  const unit = `${seg} ${gap}`;
  const fill = k >= n ? unit : k === 0 ? '0 100' : `${Array(k).fill(unit).join(' ')} 0 100`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATH} pathLength={100} fill="none" stroke={track} strokeWidth={3.5} style={{ strokeDasharray: unit }} />
      <path d={PATH} pathLength={100} fill="none" stroke={color} strokeWidth={3.5} style={{ strokeDasharray: fill }} />
    </svg>
  );
}

/** The TaskFlow mark: three priority arcs and a pencil tick. `micro` is the heavier cut for small sizes. */
export function Logo({ size = 34, micro = size < 48 }: { size?: number; micro?: boolean }) {
  return micro ? (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M71.7 23.9 A38 38 0 0 1 97.2 67.9" stroke="#E04A2F" strokeWidth={13} />
      <path d="M85.4 88.2 A38 38 0 0 1 34.6 88.2" stroke="#F0A81C" strokeWidth={13} />
      <path d="M22.8 67.9 A38 38 0 0 1 48.3 23.9" stroke="#4E9E78" strokeWidth={13} />
      <path d="M41 62 L54 75 L80 46" stroke="var(--g-ink)" strokeWidth={10} />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M65.6 20.4 A40 40 0 0 1 98.8 69.7" stroke="#E04A2F" strokeWidth={9} />
      <path d="M92.3 85.2 A41 41 0 0 1 31.5 89.5" stroke="#F0A81C" strokeWidth={9} />
      <path d="M23.4 74.8 A39.5 39.5 0 0 1 49.1 22" stroke="#4E9E78" strokeWidth={9} />
      <path d="M42 63 L54 75 Q67 58 81 44" stroke="var(--g-ink)" strokeWidth={6.5} />
    </svg>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATH} pathLength={100} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={3} />
      <path d={PATH} pathLength={100} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" style={{ strokeDasharray: '30 70' }} />
    </svg>
  );
}
