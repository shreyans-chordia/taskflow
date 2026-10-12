/** Colour helpers for the colour picker (ported from the prototype). Hex is "#RRGGBB"; h is 0–360, s and v 0–1. */

/** The picker's 16 presets, two rows of eight: warm reds to purples, then blues and greens to the neutrals. */
export const PALETTE = [
  '#E04A2F', '#E25F5F', '#D96BB0', '#C2185B', '#9A68D6', '#5C6BC0', '#2F4E7A', '#4F86D9',
  '#2FA6A0', '#4E9E78', '#6DB352', '#9DB59A', '#F0A81C', '#F2AE2E', '#8C6A4F', '#8E959E',
];

export const isHex = (h: string) => /^#[0-9a-f]{6}$/i.test(h);

/** "4f86d9", "#4F86D9" or " #4f86d9 " → "#4F86D9"; anything else → null. */
export function normalizeHex(input: string): string | null {
  let v = input.trim();
  if (v[0] !== '#') v = `#${v}`;
  return isHex(v) ? v.toUpperCase() : null;
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const f = (k: number) => {
    const kk = (k + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(kk, 4 - kk, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
