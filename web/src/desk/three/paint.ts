/**
 * 2D canvas helpers for the textures painted onto the desk: icons, chips, wrapped text, wood grain and paper noise.
 * Ported from prototype/room.html; the drawings are identical so the React desk looks the same as the prototype.
 */
export type Ctx = CanvasRenderingContext2D;

/** Seeded random numbers, so procedural textures look the same on every load. */
export const seeded = (seed: number) => {
  let s = (seed >>> 0) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

export function roundRect(x: Ctx, X: number, Y: number, W: number, H: number, R: number): void {
  x.beginPath();
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

export type IconKind = 'book' | 'code' | 'person' | 'heart' | 'bag' | 'dots' | 'search' | 'flag' | 'cal' | 'plus' | 'check' | 'box' | 'boxcheck';

/** Line icons on a 24-unit grid, centred on (cx, cy) and scaled to `s` pixels. */
export function icon(x: Ctx, kind: IconKind, cx: number, cy: number, s: number, col: string): void {
  x.save();
  x.translate(cx, cy);
  x.scale(s / 24, s / 24);
  x.strokeStyle = col;
  x.fillStyle = col;
  x.lineWidth = 2.4;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  switch (kind) {
    case 'book':
      x.moveTo(-10, -8); x.lineTo(-10, 8); x.quadraticCurveTo(-4, 5, 0, 8); x.quadraticCurveTo(4, 5, 10, 8); x.lineTo(10, -8);
      x.quadraticCurveTo(4, -11, 0, -8); x.quadraticCurveTo(-4, -11, -10, -8); x.moveTo(0, -8); x.lineTo(0, 8); x.stroke();
      break;
    case 'code':
      x.moveTo(-5, -7); x.lineTo(-11, 0); x.lineTo(-5, 7); x.moveTo(5, -7); x.lineTo(11, 0); x.lineTo(5, 7); x.moveTo(2, -9); x.lineTo(-2, 9); x.stroke();
      break;
    case 'person':
      x.arc(0, -5, 5, 0, 7); x.moveTo(-9, 10); x.quadraticCurveTo(-9, 1, 0, 1); x.quadraticCurveTo(9, 1, 9, 10); x.stroke();
      break;
    case 'heart':
      x.moveTo(0, 9); x.bezierCurveTo(-14, 0, -8, -12, 0, -4); x.bezierCurveTo(8, -12, 14, 0, 0, 9); x.stroke();
      break;
    case 'bag':
      roundRect(x, -10, -5, 20, 14, 3); x.moveTo(-4, -5); x.lineTo(-4, -9); x.lineTo(4, -9); x.lineTo(4, -5); x.moveTo(-10, 1); x.lineTo(10, 1); x.stroke();
      break;
    case 'dots':
      [-7, 0, 7].forEach((d) => { x.moveTo(d + 2.4, 0); x.arc(d, 0, 2.4, 0, 7); });
      x.fill();
      break;
    case 'search':
      x.lineWidth = 3.6; x.arc(-2.5, -2.5, 6.5, 0, 7); x.moveTo(2.4, 2.4); x.lineTo(9, 9); x.stroke();
      break;
    case 'flag':
      x.moveTo(-6, 10); x.lineTo(-6, -9); x.lineTo(7, -5); x.lineTo(-6, -1); x.stroke();
      break;
    case 'cal':
      roundRect(x, -9, -7, 18, 17, 3); x.moveTo(-9, -2); x.lineTo(9, -2); x.moveTo(-4, -10); x.lineTo(-4, -5); x.moveTo(4, -10); x.lineTo(4, -5); x.stroke();
      break;
    case 'plus':
      x.lineWidth = 4; x.moveTo(-8, 0); x.lineTo(8, 0); x.moveTo(0, -8); x.lineTo(0, 8); x.stroke();
      break;
    case 'check':
      x.lineWidth = 4; x.moveTo(-8, 0); x.lineTo(-2, 6); x.lineTo(9, -7); x.stroke();
      break;
    case 'box':
      x.lineWidth = 2; roundRect(x, -9, -9, 18, 18, 3); x.stroke();
      break;
    case 'boxcheck':
      x.lineWidth = 2; roundRect(x, -9, -9, 18, 18, 3); x.stroke();
      x.beginPath(); x.lineWidth = 3; x.moveTo(-5, 0); x.lineTo(-1, 4); x.lineTo(6, -5); x.stroke();
      break;
  }
  x.restore();
}

export function wrapText(x: Ctx, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (x.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A rounded label with an optional icon; returns its width so chips can be laid out in a row. */
export function chip(x: Ctx, X: number, Y: number, label: string, bg: string, fg: string, ic?: IconKind): number {
  x.font = '600 25px Inter, sans-serif';
  const w = x.measureText(label).width + (ic ? 56 : 28);
  x.fillStyle = bg;
  roundRect(x, X, Y, w, 42, 21);
  x.fill();
  if (ic) icon(x, ic, X + 23, Y + 21, 22, fg);
  x.fillStyle = fg;
  x.textBaseline = 'middle';
  x.fillText(label, X + (ic ? 42 : 14), Y + 22);
  x.textBaseline = 'alphabetic';
  return w;
}

export function noise(x: Ctx, w: number, h: number, n: number, a: number): void {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function speckle(x: Ctx, w: number, h: number, n: number, cols: string[], size: [number, number], seed: number): void {
  const r = seeded(seed);
  for (let i = 0; i < n; i++) {
    x.fillStyle = cols[Math.floor(r() * cols.length)]!;
    const s = size[0] + r() * (size[1] - size[0]);
    x.fillRect(r() * w, r() * h, s, s);
  }
}

export function woodCanvas(w: number, h: number, base: string, dark: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 180; i++) {
    x.strokeStyle = `rgba(${dark},${0.04 + Math.random() * 0.1})`;
    x.lineWidth = 0.6 + Math.random() * 2.2;
    x.beginPath();
    let y = Math.random() * h;
    x.moveTo(0, y);
    for (let px = 0; px <= w; px += 40) {
      y += (Math.random() - 0.5) * 3;
      x.lineTo(px, y);
    }
    x.stroke();
  }
  noise(x, w, h, 4000, 0.05);
  return c;
}

/** Darkens (negative `amt`) or brightens a colour by a percentage, or blends it toward white when `toWhite`. */
export function shade(hex: string, amt: number, toWhite = false): string {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (toWhite) {
    const k = amt / 100;
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  } else {
    const k = 1 + amt / 100;
    r *= k; g *= k; b *= k;
  }
  return `rgb(${Math.round(Math.min(255, r))},${Math.round(Math.min(255, g))},${Math.round(Math.min(255, b))})`;
}

/** `k` of colour a and `1 - k` of colour b. */
export function mixHex(a: string, b: string, k: number): string {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * k + ((B >> s) & 255) * (1 - k));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

export const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
};

/** A quick hand-drawn scribble through the text of a finished task. */
export function squiggle(x: Ctx, x0: number, y: number, w: number, seed: number): void {
  const r = seeded(seed + 11);
  x.save();
  x.strokeStyle = 'rgba(43,46,51,.85)';
  x.lineWidth = 4;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.beginPath();
  let px = x0 - 6;
  x.moveTo(px, y + (r() - 0.5) * 3);
  let up = r() < 0.5 ? 1 : -1;
  while (px < x0 + w + 4) {
    const st = 16 + r() * 10, amp = 3.5 + r() * 3.5;
    x.quadraticCurveTo(px + st / 2, y + up * amp, px + st, y + (r() - 0.5) * 3);
    px += st;
    up = -up;
  }
  x.stroke();
  x.restore();
}

/** A stable small number from a string id, for seeding per-task scribbles. */
export const hashSeed = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 100000;
