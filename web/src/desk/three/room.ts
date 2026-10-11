import * as THREE from 'three';
import { add, B, C, color, group, Kit, lathe, RBX, std, type PaintedTexture, type V3 } from './kit';
import { luminance, noise, roundRect, seeded, speckle } from './paint';

/**
 * The static part of the room: walls, window, desk, shelves, books, plants, props and the daylight.
 * Nothing here is clickable or tied to data; the interactive objects are React components (see ../objects).
 * Ported one-to-one from prototype/room.html so the look does not drift.
 */
export interface Room {
  root: THREE.Group;
  /** Moves the scene between dusk (light mode, lamp off) and night (dark mode, lamp on). */
  setNight(night: boolean): void;
  /** Turns the wall clock's hands to the current time. */
  tickClock(): void;
}

/**
 * Decay and strength that make three's physical point/spot falloff follow the prototype's legacy curve
 * ((1 - d / distance) ^ decay) over the distances that matter in this room. Fitted numerically.
 */
export const LEGACY_FIT = {
  fill: { decay: 1.25, scale: 1.1 }, // 2 to 3.5 m from the ceiling fill to the desk and wall
  spot: { decay: 0.5, scale: 0.7 }, // 0.6 to 2 m from the lamp
  glow: { decay: 1, scale: 0.2 }, // 0.2 to 1.2 m around the bulb
};

/** Desk-top height: everything standing on the desk sits on this plane. */
export const DESK_Y = 0.751;

export function buildRoom(kit: Kit): Room {
  const root = new THREE.Group();
  const state = { night: false };
  const M = kit.mat;

  /* ---------- room shell ---------- */
  const wallT = kit.ctex(512, 512, (x, w, h) => { x.fillStyle = '#CFC6C3'; x.fillRect(0, 0, w, h); noise(x, w, h, 9000, 0.035); }, [6, 3]);
  add(root, new THREE.PlaneGeometry(9, 4), new THREE.MeshStandardMaterial({ map: wallT, roughness: 0.95 }), [0, 1.6, 0], [0, 0, 0], false, true);
  const floorT = kit.ctex(512, 512, (x, w, h) => { x.fillStyle = '#3B3532'; x.fillRect(0, 0, w, h); noise(x, w, h, 20000, 0.08); }, [8, 8]);
  add(root, new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial({ map: floorT, roughness: 1 }), [0, 0, 2.5], [-Math.PI / 2, 0, 0], false, true);
  add(root, B(9, 0.1, 0.02), std('#E9E3DA'), [0, 0.05, 0.01], [0, 0, 0], false, true); // skirting

  /* ---------- window (left) ---------- */
  const sky: PaintedTexture = kit.ctex(512, 1024, (x, w, h) => paintSky(x, w, h, state.night));
  const win = group(root, [-1.72, 1.66, 0]);
  add(win, new THREE.PlaneGeometry(0.86, 1.62), new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }), [0, 0, 0.004], [0, 0, 0], false, false);
  const frameM = std('#2B2D31', { roughness: 0.5, metalness: 0.4 });
  for (const [px, py, w, h] of [[0, 0.83, 0.9, 0.06], [0, -0.83, 0.9, 0.06], [-0.45, 0, 0.06, 1.72], [0.45, 0, 0.06, 1.72], [0, 0.12, 0.86, 0.035]] as const) {
    add(win, B(w, h, 0.06), frameM, [px, py, 0.03]);
  }
  add(win, B(0.04, 1.62, 0.04), frameM, [0.02, 0, 0.03]);
  add(root, B(1.1, 0.04, 0.26), std('#E8E2D8'), [-1.68, 0.86, 0.13]); // sill

  /* ---------- desk ---------- */
  const desk = group(root);
  add(desk, B(3.6, 0.045, 0.82), M.wood, [0, 0.728, 0.41]);
  add(desk, B(0.04, 0.7, 0.78), M.wood, [-1.72, 0.35, 0.41]);
  add(desk, B(0.62, 0.7, 0.76), M.wood, [1.04, 0.35, 0.42]); // drawer unit
  for (let i = 0; i < 3; i++) {
    add(desk, B(0.56, 0.2, 0.02), M.wood, [1.04, 0.58 - i * 0.225, 0.81]);
    add(desk, B(0.18, 0.022, 0.025), M.black, [1.04, 0.63 - i * 0.225, 0.83]);
  }
  add(desk, B(0.04, 0.7, 0.78), M.wood, [0.72, 0.35, 0.42]);
  add(root, C(0.13, 0.11, 0.32, 24), std('#232427', { roughness: 0.7 }), [0.45, 0.16, 0.32]); // bin

  /* ---------- poster ---------- */
  const posterT = kit.ctex(320, 480, (x, w, h) => {
    x.fillStyle = '#F7F4EE'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#2B2E33'; x.font = '700 62px Caveat, cursive'; x.textAlign = 'center';
    ['Better', 'Plans', 'Bigger', 'Goals'].forEach((s, i) => x.fillText(s, w / 2, 120 + i * 72));
    x.font = '700 48px Caveat, cursive'; x.fillText(':)', w / 2, 420);
  });
  const poster = group(root, [1.56, 1.6, 0]);
  add(poster, B(0.24, 0.34, 0.02), M.black, [0, 0, 0.01]);
  add(poster, new THREE.PlaneGeometry(0.2, 0.3), new THREE.MeshStandardMaterial({ map: posterT, roughness: 0.9 }), [0, 0, 0.021], [0, 0, 0], false, true);

  buildOrganizerFrame(kit, root);
  buildBookshelf(kit, root);
  buildDeskItems(kit, root);
  buildChair(kit, root);
  buildPlants(kit, root);
  buildDeskExtras(kit, root);
  const tickClock = buildWallClock(kit, root);

  /* bed corner */
  const bed = group(root, [2.05, 0, 1.2]);
  add(bed, B(1, 0.42, 2), std('#5A6670', { roughness: 1 }), [0, 0.21, 0]);
  add(bed, B(1.02, 0.14, 2.02), std('#7B8A93', { roughness: 1 }), [0, 0.47, 0]);

  /* ---------- daylight ---------- */
  // three now uses physical light units; the old "legacy" lights were scaled by π, so the prototype's values are too.
  // Point and spot lights also fall off differently now (inverse power instead of linear-to-zero), so their decay
  // and strength are refitted to match the prototype's falloff across the room (see LEGACY_FIT).
  const hemi = new THREE.HemisphereLight(color('#FFE9D2'), color('#3A2A20'), 0.55 * Math.PI);
  const sun = new THREE.DirectionalLight(color('#FFB27A'), 1.0 * Math.PI);
  sun.position.set(-3.5, 2.4, 2.2);
  sun.target.position.set(0.4, 0.9, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 2.5, bottom: -1, near: 0.5, far: 9 });
  sun.shadow.bias = -0.0005;
  const fill = new THREE.PointLight(color('#FFD6A8'), 0.35 * Math.PI * LEGACY_FIT.fill.scale, 6, LEGACY_FIT.fill.decay);
  fill.position.set(0, 2.2, 2.2);
  root.add(hemi, sun, sun.target, fill);

  return {
    root,
    tickClock,
    setNight(night) {
      state.night = night;
      hemi.intensity = (night ? 0.14 : 0.62) * Math.PI;
      hemi.color.set(night ? '#9FB0E0' : '#FFE9D2');
      sun.color.set(night ? '#6F86C8' : '#FFAA70');
      sun.intensity = (night ? 0.35 : 1.25) * Math.PI;
      fill.intensity = (night ? 0.08 : 0.42) * Math.PI * LEGACY_FIT.fill.scale;
      const c = sky.userData.canvas;
      sky.userData.paint(c.getContext('2d')!, c.width, c.height);
      sky.needsUpdate = true;
    },
  };
}

/* ---------- window view: dusk or night sky over a lit skyline ---------- */
function paintSky(x: CanvasRenderingContext2D, w: number, h: number, night: boolean) {
  const g = x.createLinearGradient(0, 0, 0, h);
  if (night) { g.addColorStop(0, '#0B1230'); g.addColorStop(0.55, '#1B2350'); g.addColorStop(0.8, '#2B2C5A'); g.addColorStop(1, '#3B2F55'); }
  else { g.addColorStop(0, '#36508C'); g.addColorStop(0.4, '#7A6FA8'); g.addColorStop(0.62, '#E7869A'); g.addColorStop(0.78, '#F7A86A'); g.addColorStop(1, '#F9C27E'); }
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  if (night) {
    for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`; x.fillRect(Math.random() * w, Math.random() * h * 0.55, 1.5, 1.5); }
  } else {
    x.globalAlpha = 0.35;
    for (let i = 0; i < 9; i++) {
      x.fillStyle = i % 2 ? '#4A4E86' : '#8B6C9E';
      const y = 120 + Math.random() * 420;
      roundRect(x, -40 + Math.random() * 200, y, 260 + Math.random() * 260, 14 + Math.random() * 18, 12);
      x.fill();
    }
    x.globalAlpha = 1;
  }
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const base = h * 0.78;
  for (let layer = 0; layer < 2; layer++) {
    let px = -10;
    while (px < w) {
      const bw = 30 + rnd() * 60, bh = (layer ? 140 : 60) + rnd() * (layer ? 260 : 160);
      x.fillStyle = layer ? (night ? '#0A0C18' : '#2C2440') : night ? '#141734' : '#4A3B5C';
      x.fillRect(px, base - bh + (layer ? 60 : 0), bw, h);
      for (let wy = base - bh + (layer ? 70 : 10); wy < h; wy += 14) {
        for (let wx = px + 5; wx < px + bw - 6; wx += 11) {
          if (rnd() < (night ? 0.42 : 0.22)) {
            x.fillStyle = rnd() < 0.8 ? '#FFD27A' : '#FFF2C4';
            x.globalAlpha = 0.55 + rnd() * 0.45;
            x.fillRect(wx, wy, 5, 7);
            x.globalAlpha = 1;
          }
        }
      }
      px += bw + (layer ? 4 : 10);
    }
  }
}

/* ---------- organizer cabinet: the trays inside are the category objects ---------- */
export const ORGANIZER = { x: 1.03, z: 0.19, w: 0.38, h: 0.47, d: 0.28, step: 0.07 };
function buildOrganizerFrame(kit: Kit, root: THREE.Object3D) {
  const { x: X, z: Z, w: W, h: H, d: D, step } = ORGANIZER;
  const g = group(root, [X, 0.75, Z]);
  add(g, B(W, 0.016, D), kit.mat.wood, [0, H, 0]);
  add(g, B(0.016, H, D), kit.mat.wood, [-W / 2, H / 2, 0]);
  add(g, B(0.016, H, D), kit.mat.wood, [W / 2, H / 2, 0]);
  add(g, B(W, H, 0.01), kit.mat.woodDark, [0, H / 2, -D / 2]);
  add(g, B(W, 0.016, D), kit.mat.wood, [0, 0.008, 0]);
  for (let i = 0; i < 6; i++) add(g, B(W - 0.03, 0.005, D - 0.02), kit.mat.woodDark, [0, H - 0.048 - i * step - 0.031, 0]);
}

function buildBookshelf(kit: Kit, root: THREE.Object3D) {
  const g = group(root, [1.42, 0.75, 0.17]);
  const W = 0.3, H = 0.47, D = 0.26;
  add(g, B(W, 0.016, D), kit.mat.wood, [0, H, 0]);
  add(g, B(0.016, H, D), kit.mat.wood, [W / 2, H / 2, 0]);
  add(g, B(W, H, 0.01), kit.mat.woodDark, [0, H / 2, -D / 2]);
  add(g, B(W, 0.016, D), kit.mat.wood, [0, 0.24, 0]);
  const cols = ['#2E3A4F', '#E8E1D6', '#7A3B32', '#C9B79C', '#3C3F45', '#4F6B57', '#D8D2C8'];
  let x0 = -W / 2 + 0.02;
  cols.forEach((c, i) => {
    const w = 0.026 + (i % 3) * 0.006, h = 0.15 + (i % 2) * 0.04;
    shelfBook(kit, g, x0 + w / 2 + (i === 6 ? 0.006 : 0), 0.248 + h / 2 + 0.002, 0.02, w, h, 0.17, c, 300 + i, i === 6 ? 0.12 : 0);
    x0 += w + 0.004;
  });
  add(g, lathe([[0, 0], [0.028, 0], [0.032, 0.004], [0.032, 0.088], [0.0308, 0.09], [0.0294, 0.09], [0.029, 0.085], [0.029, 0.007], [0, 0.007]]),
    new THREE.MeshStandardMaterial({ map: kit.ceramicTex('#2F3135', ['rgba(255,255,255,.07)', 'rgba(0,0,0,.25)'], 82), roughness: 0.62, side: THREE.DoubleSide }), [0.08, 0.008, 0.05]);
  ([[0.07, 0.02], [0.09, -0.01], [0.08, 0.015]] as const).forEach(([px, pz], i) =>
    add(g, C(0.004, 0.004, 0.13, 6), std(['#2F4E7A', '#C0392B', '#1E1F22'][i]!), [px, 0.125, 0.05 + pz], [0.1 * (i - 1), 0, 0.15 * (i - 1)]));
}

/** A hardcover lying flat, spine toward the camera (+z). */
function hardcover(kit: Kit, parent: THREE.Object3D, p: V3, rotY: number, o: { w: number; t: number; d: number; col: string; title: string; fg: string; foil: string; seed: number }) {
  const { w, t, d, col, title, fg, foil, seed } = o;
  const g = group(parent, p);
  g.rotation.y = rotY;
  const cloth = new THREE.MeshStandardMaterial({ map: kit.clothTex(col, seed), roughness: 0.78 });
  const pages = new THREE.MeshStandardMaterial({ map: kit.pageEdges(false), roughness: 0.95 });
  const cov = 0.0028;
  add(g, RBX(w, cov, d, 0.0012), cloth, [0, t / 2 - cov / 2, 0]);
  add(g, RBX(w, cov, d, 0.0012), cloth, [0, -t / 2 + cov / 2, 0]);
  add(g, B(w - 0.01, t - cov * 2, d - 0.008), pages, [0, 0, -0.002]);
  const spineT = kit.ctex(512, 64, (x, cw, ch) => {
    x.fillStyle = col; x.fillRect(0, 0, cw, ch);
    const r = seeded(seed + 3);
    for (let i = 0; i < 1400; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.06})`; x.fillRect(r() * cw, r() * ch, 2, 1); }
    const gr = x.createLinearGradient(0, 0, 0, ch);
    gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(0.2, 'rgba(255,255,255,.1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.42)');
    x.fillStyle = gr; x.fillRect(0, 0, cw, ch);
    x.fillStyle = foil; x.fillRect(16, 9, 2.5, ch - 18); x.fillRect(22, 9, 1.2, ch - 18); x.fillRect(cw - 19, 9, 2.5, ch - 18); x.fillRect(cw - 24, 9, 1.2, ch - 18);
    x.fillStyle = fg; x.font = '600 25px Georgia, "Times New Roman", serif'; x.textBaseline = 'middle';
    x.fillText(title.toUpperCase().split('').join(String.fromCharCode(8202)), 40, ch / 2 + 1);
    x.fillStyle = foil; x.fillRect(cw - 62, ch / 2 - 7, 14, 14);
  });
  add(g, B(w, t, 0.004), [cloth, cloth, cloth, cloth, new THREE.MeshStandardMaterial({ map: spineT, roughness: 0.7 }), cloth], [0, 0, d / 2 - 0.002]);
}

/** An upright book on a shelf, spine toward the camera. */
function shelfBook(kit: Kit, parent: THREE.Object3D, x0: number, y0: number, z0: number, w: number, h: number, d: number, col: string, seed: number, lean: number) {
  const r = seeded(seed), dark = luminance(col) < 0.5;
  const cloth = new THREE.MeshStandardMaterial({ map: kit.clothTex(col, seed), roughness: 0.8 });
  const spine = kit.canvasTex(64, 256, (c, cw, ch) => {
    c.fillStyle = col; c.fillRect(0, 0, cw, ch);
    const gr = c.createLinearGradient(0, 0, cw, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(0.25, 'rgba(255,255,255,.1)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = gr; c.fillRect(0, 0, cw, ch);
    c.fillStyle = dark ? 'rgba(236,224,196,.85)' : 'rgba(40,34,28,.78)';
    c.fillRect(8, 14, cw - 16, 2); c.fillRect(8, 19, cw - 16, 1); c.fillRect(8, ch - 20, cw - 16, 1); c.fillRect(8, ch - 16, cw - 16, 2);
    c.fillRect(cw / 2 - 3, 42, 6, 70 + r() * 70); c.fillRect(cw / 2 - 2, ch - 56, 4, 18);
  });
  const top = new THREE.MeshStandardMaterial({ map: kit.pageEdges(true), roughness: 0.95 });
  add(parent, B(w, h, d), [cloth, cloth, top, cloth, new THREE.MeshStandardMaterial({ map: spine, roughness: 0.75 }), cloth], [x0, y0, z0], [0, 0, lean]);
}

/* ---------- desk props (the notebook and the Pomodoro clock are interactive objects) ---------- */
function buildDeskItems(kit: Kit, root: THREE.Object3D) {
  const Y = DESK_Y;
  // desk mat: felt with a stitched border
  const mw = 1.1, md = 0.52, r = 0.05;
  const shape = new THREE.Shape();
  shape.moveTo(-mw / 2 + r, -md / 2); shape.lineTo(mw / 2 - r, -md / 2); shape.quadraticCurveTo(mw / 2, -md / 2, mw / 2, -md / 2 + r);
  shape.lineTo(mw / 2, md / 2 - r); shape.quadraticCurveTo(mw / 2, md / 2, mw / 2 - r, md / 2); shape.lineTo(-mw / 2 + r, md / 2);
  shape.quadraticCurveTo(-mw / 2, md / 2, -mw / 2, md / 2 - r); shape.lineTo(-mw / 2, -md / 2 + r); shape.quadraticCurveTo(-mw / 2, -md / 2, -mw / 2 + r, -md / 2);
  const mg = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false });
  mg.rotateX(-Math.PI / 2);
  const feltT = kit.canvasTex(1100, 520, (x, w, h) => {
    x.fillStyle = '#2B2B2E'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 26000, ['rgba(255,255,255,.035)', 'rgba(0,0,0,.18)', 'rgba(120,120,130,.05)'], [1, 2.6], 51);
    x.strokeStyle = 'rgba(205,200,190,.38)'; x.lineWidth = 2.6; x.setLineDash([11, 7]);
    x.beginPath();
    const i = 16, rr2 = 36;
    x.moveTo(i + rr2, i); x.arcTo(w - i, i, w - i, h - i, rr2); x.arcTo(w - i, h - i, i, h - i, rr2); x.arcTo(i, h - i, i, i, rr2); x.arcTo(i, i, w - i, i, rr2);
    x.stroke(); x.setLineDash([]);
    const e = x.createLinearGradient(0, 0, 0, h);
    e.addColorStop(0, 'rgba(0,0,0,.25)'); e.addColorStop(0.05, 'rgba(0,0,0,0)'); e.addColorStop(0.95, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,.25)');
    x.fillStyle = e; x.fillRect(0, 0, w, h);
  });
  feltT.repeat.set(1 / mw, 1 / md);
  feltT.offset.set(0.5, 0.5);
  add(root, mg, new THREE.MeshStandardMaterial({ map: feltT, roughness: 0.95 }), [0.05, Y, 0.5], [0, 0, 0], false, true);

  // pen on the mat: barrel, rubber grip, metal tip, end cap and clip
  const pen = group(root, [0.1, Y + 0.0085, 0.5]);
  pen.rotation.y = -1.2;
  const lacquer = std('#1C1D21', { roughness: 0.22, metalness: 0.25 }), chrome = std('#C9CDD2', { roughness: 0.18, metalness: 0.9 });
  add(pen, C(0.0045, 0.0045, 0.1, 20), lacquer, [0, 0, 0], [0, 0, Math.PI / 2]);
  add(pen, C(0.0049, 0.0046, 0.032, 20), std('#2A2B2E', { roughness: 0.85 }), [-0.066, 0, 0], [0, 0, Math.PI / 2]);
  add(pen, new THREE.ConeGeometry(0.0046, 0.014, 20), chrome, [-0.089, 0, 0], [0, 0, Math.PI / 2]);
  add(pen, C(0.0047, 0.0047, 0.012, 20), chrome, [0.056, 0, 0], [0, 0, Math.PI / 2]);
  add(pen, B(0.04, 0.0014, 0.0022), chrome, [0.036, 0.0052, 0]);

  // closed laptop: brushed aluminium lid, seam, hinge and front notch
  const lap = group(root, [-0.78, Y, 0.47]);
  lap.rotation.y = 0.08;
  const brushed = kit.canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#B4B8BE'; x.fillRect(0, 0, w, h);
    const rr = seeded(21);
    for (let y = 0; y < h; y++) { x.fillStyle = `rgba(${rr() < 0.5 ? '255,255,255' : '60,64,70'},${rr() * 0.07})`; x.fillRect(0, y, w, 1); }
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(255,255,255,${rr() * 0.06})`; x.fillRect(rr() * w, rr() * h, 40 + rr() * 140, 1); }
    const g = x.createRadialGradient(w * 0.35, h * 0.3, 10, w * 0.5, h * 0.5, w * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.08)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  const alu = new THREE.MeshStandardMaterial({ map: brushed, roughness: 0.36, metalness: 0.5 });
  const aluEdge = std('#A3A7AD', { roughness: 0.3, metalness: 0.6 }), seam = std('#2A2C30', { roughness: 0.6 });
  add(lap, RBX(0.5, 0.0085, 0.34, 0.004), [aluEdge, aluEdge, alu, aluEdge, aluEdge, aluEdge], [0, 0.0043, 0]);
  add(lap, B(0.492, 0.0014, 0.332), seam, [0, 0.009, 0], [0, 0, 0], false);
  add(lap, RBX(0.497, 0.0066, 0.337, 0.0035), [aluEdge, aluEdge, alu, aluEdge, aluEdge, aluEdge], [0, 0.0128, 0]);
  add(lap, B(0.075, 0.0042, 0.006), seam, [0, 0.0095, 0.168], [0, 0, 0], false);
  add(lap, C(0.0045, 0.0045, 0.38, 16), std('#3A3D42', { roughness: 0.4, metalness: 0.5 }), [0, 0.0092, -0.168], [0, 0, Math.PI / 2]);

  // book stack
  hardcover(kit, root, [-1.25, Y + 0.022, 0.5], 0.05, { w: 0.32, t: 0.044, d: 0.22, col: '#E7DDCA', title: 'Better You', fg: '#3A3530', foil: '#9C7A3C', seed: 71 });
  hardcover(kit, root, [-1.25, Y + 0.066, 0.5], -0.03, { w: 0.3, t: 0.044, d: 0.21, col: '#2E4057', title: 'System Design', fg: '#EDE6D6', foil: '#C9A55A', seed: 72 });
  hardcover(kit, root, [-1.25, Y + 0.11, 0.5], 0.02, { w: 0.29, t: 0.044, d: 0.2, col: '#1F2D44', title: 'Clean Code', fg: '#EDE6D6', foil: '#C9A55A', seed: 73 });

  // pen holder: matte ceramic cup with pens, a pencil and a highlighter
  add(root, lathe([[0, 0], [0.039, 0], [0.042, 0.004], [0.042, 0.108], [0.0408, 0.111], [0.0392, 0.111], [0.0388, 0.106], [0.0388, 0.008], [0, 0.008]]),
    new THREE.MeshStandardMaterial({ map: kit.ceramicTex('#2F3135', ['rgba(255,255,255,.07)', 'rgba(0,0,0,.25)'], 81), roughness: 0.62, side: THREE.DoubleSide }), [-0.72, Y, 0.16]);
  const tool = (dx: number, dz: number, tx: number, tz: number, build: (t: THREE.Group) => void) => {
    const t = group(root, [-0.72 + dx, Y + 0.008, 0.16 + dz]);
    t.rotation.set(tx, 0, tz);
    build(t);
  };
  const penIn = (col: string) => (t: THREE.Group) => {
    add(t, C(0.0042, 0.0042, 0.13, 16), std(col, { roughness: 0.3, metalness: 0.2 }), [0, 0.065, 0]);
    add(t, C(0.0049, 0.0049, 0.045, 16), std(col, { roughness: 0.3, metalness: 0.2 }), [0, 0.15, 0]);
    add(t, new THREE.SphereGeometry(0.0049, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(col, { roughness: 0.3 }), [0, 0.1725, 0]);
    add(t, B(0.0015, 0.034, 0.003), chrome, [0.0055, 0.15, 0]);
  };
  tool(-0.014, 0.01, 0.1, 0.12, penIn('#1E1F22'));
  tool(0.013, -0.009, -0.08, -0.14, penIn('#2F4E7A'));
  tool(0.002, 0.015, 0.14, -0.03, (t) => {
    add(t, C(0.0042, 0.0042, 0.15, 6), std('#F2B233', { roughness: 0.45 }), [0, 0.075, 0]);
    add(t, C(0.0045, 0.0045, 0.012, 16), std('#C8CBD0', { roughness: 0.25, metalness: 0.85 }), [0, 0.156, 0]);
    add(t, C(0.0042, 0.0042, 0.011, 16), std('#E59A9C', { roughness: 0.8 }), [0, 0.1675, 0]);
  });
  tool(0.016, 0.012, 0.12, 0.2, (t) => {
    add(t, C(0.0068, 0.0068, 0.1, 18), std('#F5E04A', { roughness: 0.35 }), [0, 0.05, 0]);
    add(t, C(0.0072, 0.0072, 0.036, 18), std('#2B2C30', { roughness: 0.4 }), [0, 0.114, 0]);
  });

  // focus card in a slotted wooden stand
  const fc = kit.ctex(240, 300, (x, w, h) => {
    x.fillStyle = '#F7F0DC'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 1800, ['rgba(0,0,0,.035)', 'rgba(120,100,60,.05)'], [1, 2.2], 91);
    x.fillStyle = '#2B2E33'; x.font = '38px "Patrick Hand", cursive'; x.textAlign = 'center';
    ['Focus', 'Build', 'Grow', ':)'].forEach((s, i) => x.fillText(s, w / 2, 70 + i * 60));
  });
  const paper = new THREE.MeshStandardMaterial({ map: kit.paperTex('#F1EAD6', 92), roughness: 0.9 });
  const card = group(root, [0.4, Y + 0.012, 0.123]);
  card.rotation.set(-0.08, -0.1, 0);
  add(card, B(0.1, 0.125, 0.0016), [paper, paper, paper, paper, new THREE.MeshStandardMaterial({ map: fc, roughness: 0.9 }), paper], [0, 0.0625, 0]);
  add(root, RBX(0.095, 0.014, 0.036, 0.004), kit.mat.woodDark, [0.4, Y + 0.007, 0.125], [0, -0.1, 0]);
  add(root, B(0.085, 0.002, 0.004), seam, [0.4, Y + 0.0141, 0.1255], [0, -0.1, 0], false);

  // mug: turned ceramic, coffee with crema, cork coaster
  const mug = group(root, [1.27, Y, 0.6]);
  add(mug, C(0.07, 0.07, 0.008, 48), new THREE.MeshStandardMaterial({ map: kit.corkTex(), roughness: 0.95 }), [0, 0.004, 0]);
  const glaze = new THREE.MeshStandardMaterial({ map: kit.ceramicTex('#F2EEE7', ['rgba(80,70,60,.18)', 'rgba(0,0,0,.08)'], 101), roughness: 0.22, side: THREE.DoubleSide });
  add(mug, lathe([[0, 0.008], [0.05, 0.008], [0.055, 0.011], [0.0565, 0.02], [0.058, 0.121], [0.0572, 0.1245], [0.055, 0.1235], [0.0538, 0.116], [0.0532, 0.022], [0, 0.019]], 56), glaze);
  const mugT = kit.ctex(512, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#2B2E33'; x.font = '44px "Patrick Hand", cursive'; x.textAlign = 'center';
    ['Good', 'Things', 'Take Time', ':)'].forEach((s, i) => x.fillText(s, w / 2, 60 + i * 52));
  });
  add(mug, new THREE.CylinderGeometry(0.0583, 0.0578, 0.09, 40, 1, true, -Math.PI * 0.45, Math.PI * 0.9), new THREE.MeshStandardMaterial({ map: mugT, roughness: 0.25, transparent: true }), [0, 0.072, 0], [0, 0, 0], false, false);
  add(mug, new THREE.TorusGeometry(0.03, 0.0075, 14, 28, Math.PI * 1.15), glaze, [0.06, 0.073, 0], [0, 0, -Math.PI * 0.575]);
  const coffee = kit.canvasTex(128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#3A2214'); g.addColorStop(0.75, '#4B2C18'); g.addColorStop(0.9, '#8A5A34'); g.addColorStop(1, '#6B4126');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  add(mug, new THREE.CircleGeometry(0.0534, 40), new THREE.MeshStandardMaterial({ map: coffee, roughness: 0.1 }), [0, 0.108, 0], [-Math.PI / 2, 0, 0], false, true);

  // sticky-note pad: layered sheets with a lifted top corner
  const sheets = kit.canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(0, y, w, 1); }
  });
  const pad = group(root, [0.74, Y, 0.6]);
  pad.rotation.y = 0.06;
  const cols = ['#F6DC8F', '#F7B7CF', '#BCD0F2', '#CFE6A9', '#F8BBC2', '#D9C9F2'];
  cols.forEach((c, i) => {
    const side = new THREE.MeshStandardMaterial({ color: color(c), map: sheets, roughness: 0.9 });
    const top = new THREE.MeshStandardMaterial({ color: color(c), map: kit.paperTex('#FFFFFF', 110 + i), roughness: 0.9 });
    add(pad, B(0.12, 0.0068, 0.1), [side, side, top, side, side, side], [i % 2 ? 0.0015 : -0.001, 0.0034 + i * 0.0068, ((i % 3) - 1) * 0.001], [0, i * 0.008, 0]);
  });
  const curl = new THREE.PlaneGeometry(0.12, 0.1, 12, 10), cp = curl.attributes.position!;
  for (let i = 0; i < cp.count; i++) {
    const u = cp.getX(i) / 0.12 + 0.5, v = cp.getY(i) / 0.1 + 0.5, k = Math.max(0, (u - 0.62) / 0.38) * Math.max(0, (0.38 - v) / 0.38);
    cp.setZ(i, 0.016 * Math.pow(k, 1.6));
  }
  curl.computeVertexNormals();
  add(pad, curl, new THREE.MeshStandardMaterial({ color: color(cols[5]!), map: kit.paperTex('#FFFFFF', 120), roughness: 0.9, side: THREE.DoubleSide }), [0, 0.0412, 0], [-Math.PI / 2, 0, 0.04]);
}

/* ---------- chair ---------- */
function buildChair(kit: Kit, root: THREE.Object3D) {
  const g = group(root, [-0.22, -0.3, 1.95]);
  g.rotation.y = 0.16;
  const meshT = kit.canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#1A1B1E'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 2;
    for (let i = -h; i < w; i += 8) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke();
      x.beginPath(); x.moveTo(i + h, 0); x.lineTo(i, h); x.stroke();
    }
  }, [3, 3]);
  const back = new THREE.Shape();
  back.moveTo(-0.26, 0); back.quadraticCurveTo(-0.3, 0.4, -0.2, 0.62); back.quadraticCurveTo(0, 0.7, 0.2, 0.62); back.quadraticCurveTo(0.3, 0.4, 0.26, 0); back.quadraticCurveTo(0, -0.05, -0.26, 0);
  const bg = new THREE.ExtrudeGeometry(back, { depth: 0.03, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 });
  add(g, bg, new THREE.MeshStandardMaterial({ map: meshT, roughness: 0.8 }), [0, 0.62, 0.06], [-0.12, 0, 0]);
  const frame = std('#141416', { roughness: 0.5 });
  add(g, B(0.5, 0.07, 0.48), frame, [0, 0.5, -0.22]);
  add(g, C(0.025, 0.025, 0.45, 12), kit.mat.metal, [0, 0.25, -0.2]);
  add(g, B(0.06, 0.03, 0.28), frame, [0.3, 0.7, -0.18]); add(g, B(0.03, 0.2, 0.03), frame, [0.3, 0.6, -0.08]);
  add(g, B(0.06, 0.03, 0.28), frame, [-0.3, 0.7, -0.18]); add(g, B(0.03, 0.2, 0.03), frame, [-0.3, 0.6, -0.08]);
}

/* ---------- plants: plump cel-shaded leaves with a soft ink outline ---------- */
const INK = '#22301F';
type LeafKind = 'heart' | 'round' | 'sword' | 'plump' | 'paddle';
interface Leaf { pos: THREE.Vector3; q: THREE.Quaternion; s: number; col: string }

/** A copy pushed out along its normals: its back faces read as an ink line around the shape. */
function swell(geo: THREE.BufferGeometry, d: number) {
  const g = geo.clone(), p = g.attributes.position!, n = g.attributes.normal!;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  return g;
}
const inkMat = (hex = INK) => new THREE.MeshBasicMaterial({ color: color(hex), side: THREE.BackSide });

/** One plump leaf: a sphere squashed and drawn out into a leaf outline, folded along the midrib and arched. */
function leafGeo(kind: LeafKind) {
  const g = new THREE.SphereGeometry(1, 18, 14), p = g.attributes.position!;
  const S: Record<LeafKind, [number, number, number, number, number]> = { heart: [0.5, 1, 0.07, 0.25, 0.18], round: [0.5, 0.52, 0.07, 0.12, 0.06], sword: [0.13, 1, 0.05, 0.05, 0.08], plump: [0.3, 0.62, 0.2, 0.04, 0.1], paddle: [0.42, 1, 0.05, 0.2, 0.14] };
  const [W, Lh, T, fold, arch] = S[kind];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 1) / 2;
    let w: number;
    if (kind === 'heart') w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.62)), 0.8) * (1 + 0.25 * (1 - t));
    else if (kind === 'round') w = Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
    else if (kind === 'sword') w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.5)), 0.7) * (1 - 0.35 * t);
    else if (kind === 'plump') w = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.7);
    else w = Math.pow(Math.sin(Math.PI * Math.pow(t, 1.25)), 0.75);
    const X = x * W * w, Z = z * T * Math.max(w, 0.25);
    p.setXYZ(i, X, t * Lh * 2, Z - fold * X * X * 4 + arch * t * t);
  }
  g.computeVertexNormals();
  return g;
}

function leafTex(kit: Kit, variegated: boolean) {
  return kit.canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,230,.0)'); g.addColorStop(1, 'rgba(0,30,0,.16)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (variegated) {
      const r = seeded(5);
      x.fillStyle = 'rgba(255,250,215,.75)';
      for (let k = 0; k < 9; k++) { const cx = r() * w; x.beginPath(); x.ellipse(cx, h * (0.15 + r() * 0.7), 3 + r() * 9, 14 + r() * 30, (r() - 0.5) * 0.6, 0, 7); x.fill(); }
    }
    x.strokeStyle = 'rgba(255,255,225,.85)'; x.lineWidth = 4; x.lineCap = 'round';
    for (const cx of [w * 0.25, w * 0.75]) {
      x.beginPath(); x.moveTo(cx, h * 0.06); x.lineTo(cx, h * 0.96); x.stroke();
      x.lineWidth = 2.2;
      for (let k = 1; k < 5; k++) {
        const y = h * (0.94 - k * 0.17);
        x.beginPath(); x.moveTo(cx, y); x.quadraticCurveTo(cx + 18, y - 14, cx + 40, y - 34); x.moveTo(cx, y); x.quadraticCurveTo(cx - 18, y - 14, cx - 40, y - 34); x.stroke();
      }
      x.lineWidth = 4;
    }
  });
}

function buildPlants(kit: Kit, root: THREE.Object3D) {
  const r = seeded(7), V = (a = 0, b = 0, c = 0) => new THREE.Vector3(a, b, c), UP = V(0, 1, 0), CAM = V(0, 0.3, 1).normalize();
  const toon = (hex: string) => new THREE.MeshToonMaterial({ color: color(hex), gradientMap: kit.toonRamp() });
  const inked = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: V3, d = 0.0022, ink = INK) => {
    const m = add(root, geo, mat, pos, [0, 0, 0], true, true);
    add(root, swell(geo, d), inkMat(ink), pos, [0, 0, 0], false, false);
    return m;
  };
  // leaf length along `dir`, face turned toward the viewer
  const orient = (dir: THREE.Vector3, roll = 0) => {
    const d = dir.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(UP, d);
    const nrm = V(0, 0, 1).applyQuaternion(q), want = CAM.clone().sub(d.clone().multiplyScalar(CAM.dot(d))).normalize();
    const a = Math.atan2(V().crossVectors(nrm, want).dot(d), nrm.dot(want)) + roll;
    return new THREE.Quaternion().setFromAxisAngle(d, a).multiply(q);
  };
  const stemM = toon('#4E8B3E');
  const stem = (pts: THREE.Vector3[], rad = 0.0028) => {
    const c = new THREE.CatmullRomCurve3(pts);
    inked(new THREE.TubeGeometry(c, Math.max(10, pts.length * 6), rad, 6, false), stemM, [0, 0, 0], 0.0016);
    return c;
  };
  const potGeo = (rb: number, rt: number, h: number) =>
    lathe([[0, 0], [rb - 0.004, 0], [rb, 0.004], [rt, h - 0.014], [rt + 0.006, h - 0.012], [rt + 0.006, h], [rt - 0.002, h], [rt - 0.004, h - 0.01], [rt - 0.012, h - 0.03], [0, h - 0.03]]);
  const pot = (x: number, y: number, z: number, rb: number, rt: number, h: number, mat: THREE.Material, ink = '#2B2E33') => {
    inked(potGeo(rb, rt, h), mat, [x, y, z], 0.0026, ink);
    add(root, new THREE.CircleGeometry(rt - 0.004, 32), toon('#4A3426'), [x, y + h - 0.016, z], [-Math.PI / 2, 0, 0], false, true);
    const pr = seeded(Math.round(x * 100 + 300)); // a few pebbles on the soil
    for (let k = 0; k < 7; k++) {
      const a = pr() * 7, d = pr() * (rt - 0.02);
      add(root, new THREE.SphereGeometry(0.004 + pr() * 0.004, 8, 6), toon(pr() < 0.5 ? '#CFC4AE' : '#8F857A'), [x + Math.cos(a) * d, y + h - 0.015, z + Math.sin(a) * d], [0, 0, 0], false, false);
    }
    return y + h - 0.016;
  };
  const GREENS = ['#3F8F4F', '#4FA055', '#2F7A47', '#62B35E', '#3A8A5C'];
  const pick = (a: string[]) => a[Math.floor(r() * a.length)]!;
  const hearts: Leaf[] = [], heartsV: Leaf[] = [], rounds: Leaf[] = [], plumps: Leaf[] = [];

  // 1) hanging pothos above the window: dense trailing vines, a few variegated leaves
  const white = toon('#F4F0E8'), terracotta = toon('#C96B44'), concrete = toon('#B9B4AC');
  const hy = pot(-1.33, 2.31, 0.14, 0.072, 0.095, 0.11, white);
  add(root, new THREE.TorusGeometry(0.003, 0.0012, 6, 12), kit.mat.metal, [-1.33, 2.5, 0.14]);
  for (const k of [-1, 1]) add(root, C(0.0008, 0.0008, 0.2, 4), kit.mat.metal, [-1.33 + k * 0.045, 2.42, 0.14], [0, 0, -k * 0.42], false, false);
  for (let k = 0; k < 10; k++) {
    const a = Math.PI * (0.05 + (0.9 * k) / 9);
    hearts.push({ pos: V(-1.33 + Math.cos(a) * 0.085, hy + 0.005, 0.14 + Math.sin(a) * 0.06), q: orient(V(Math.cos(a) * 0.9, 0.25, Math.sin(a) * 0.6 + 0.3), (r() - 0.5) * 0.5), s: 0.05 + r() * 0.012, col: pick(GREENS) });
  }
  for (let v = 0; v < 7; v++) {
    const x0 = -1.43 + v * 0.033, len = 0.45 + r() * 0.75, pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      pts.push(V(x0 + Math.sin(t * 4.5 + v * 1.3) * 0.045 * t + (v - 3) * 0.018 * t, hy + 0.005 - t * len, 0.17 + 0.03 * Math.sin(k * 1.4 + v) + t * 0.05));
    }
    const c = stem(pts, 0.0022), n = Math.round(len / 0.038);
    for (let i = 1; i <= n; i++) {
      const t = Math.min(0.995, i / n), side = i % 2 ? 1 : -1, P = c.getPointAt(t);
      const L0 = { pos: P, q: orient(V(side * (0.8 + r() * 0.4), -0.35 - r() * 0.35, 0.35 + r() * 0.3), (r() - 0.5) * 0.4), s: (0.05 - 0.016 * t) * (0.9 + r() * 0.25), col: pick(GREENS) };
      (r() < 0.22 ? heartsV : hearts).push(L0);
    }
  }
  // 2) window sill: a lush heart-leaf philodendron in a white pot
  const sy = pot(-1.52, 0.88, 0.14, 0.058, 0.075, 0.135, white);
  for (let i = 0; i < 24; i++) {
    const a = Math.PI * (-0.05 + 1.1 * r()), rr = 0.04 + r() * 0.11, hgt = 0.08 + r() * 0.17, ox = Math.cos(a), oz = Math.sin(a) * 0.6 + 0.15;
    const tip = V(-1.52 + ox * rr, sy + hgt, 0.14 + oz * rr);
    stem([V(-1.52 + ox * 0.01, sy, 0.14 + oz * 0.01), V(-1.52 + ox * rr * 0.3, sy + hgt * 0.75, 0.14 + oz * rr * 0.3), tip], 0.0026);
    hearts.push({ pos: tip, q: orient(V(ox * 0.9, -0.15 + r() * 0.5, oz + 0.25), (r() - 0.5) * 0.4), s: 0.06 + r() * 0.028, col: pick(GREENS) });
  }
  // 3) organizer top: a pilea with round coin leaves on thin stems, in terracotta
  const py = pot(1.42, 1.22, 0.14, 0.045, 0.058, 0.09, terracotta, '#5A2E1C');
  add(root, C(0.064, 0.06, 0.012, 32), toon('#B65E3A'), [1.42, 1.22 + 0.084, 0.14], [0, 0, 0], false, false);
  stem([V(1.42, py, 0.14), V(1.421, py + 0.1, 0.145), V(1.418, py + 0.16, 0.15)], 0.004);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, h0 = py + 0.04 + r() * 0.12, len = 0.06 + r() * 0.08, ox = Math.cos(a), oz = Math.sin(a);
    const tip = V(1.42 + ox * len, h0 + 0.03 + r() * 0.03, 0.148 + oz * len * 0.8);
    stem([V(1.42, h0, 0.148), V(1.42 + ox * len * 0.5, h0 + 0.035, 0.148 + oz * len * 0.4), tip], 0.0016);
    rounds.push({ pos: tip, q: orient(V(ox * 0.5, 0.7, oz * 0.5 + 0.35), r() * 0.4), s: 0.036 + r() * 0.02, col: pick(['#4E9E4A', '#5BAA52', '#3F8F45', '#6BB85C']) });
  }
  // 4) desk: echeveria rosette in a small concrete pot
  const ey = pot(0.68, DESK_Y, 0.27, 0.042, 0.05, 0.065, concrete, '#3A3D42');
  for (let ring = 0; ring < 3; ring++) {
    const n = 7 + ring * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4, out = 0.62 - ring * 0.22;
      plumps.push({
        pos: V(0.68 + Math.cos(a) * 0.008 * ring, ey + 0.012 + ring * 0.008, 0.27 + Math.sin(a) * 0.008 * ring),
        q: new THREE.Quaternion().setFromUnitVectors(UP, V(Math.cos(a) * out, 1 - out * 0.6, Math.sin(a) * out).normalize()),
        s: 0.062 - ring * 0.012,
        col: ['#8DB5A2', '#9BC3AE', '#A9CDB6'][ring]!,
      });
    }
  }
  // 5) desk: tiny ribbed cactus with a pink flower
  const cy = pot(-0.5, DESK_Y, 0.16, 0.03, 0.036, 0.05, terracotta, '#5A2E1C');
  const cg = new THREE.SphereGeometry(1, 24, 16), cp = cg.attributes.position!;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), rib = 1 + 0.08 * Math.cos(Math.atan2(z, x) * 8);
    cp.setXYZ(i, x * 0.026 * rib, (y + 1) * 0.036, z * 0.026 * rib);
  }
  cg.computeVertexNormals();
  inked(cg, toon('#5E9E58'), [-0.5, cy - 0.004, 0.16], 0.0018);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * 7; add(root, new THREE.SphereGeometry(0.0055, 10, 8), toon('#F28CA8'), [-0.5 + Math.cos(a) * 0.005, cy + 0.071, 0.16 + Math.sin(a) * 0.005], [0, 0, 0], false, false); }
  add(root, new THREE.SphereGeometry(0.004, 8, 6), toon('#F7D36A'), [-0.5, cy + 0.075, 0.16], [0, 0, 0], false, false);

  const batch = (kind: LeafKind, leaves: Leaf[], variegated = false, ink = INK) => {
    if (!leaves.length) return;
    const geo = leafGeo(kind);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ map: leafTex(kit, variegated), gradientMap: kit.toonRamp() }), leaves.length);
    const om = new THREE.InstancedMesh(swell(geo, 0.045), inkMat(ink), leaves.length);
    const o = new THREE.Object3D(), col = new THREE.Color();
    leaves.forEach((L0, i) => {
      o.position.copy(L0.pos); o.quaternion.copy(L0.q); o.scale.setScalar(L0.s); o.updateMatrix();
      im.setMatrixAt(i, o.matrix); om.setMatrixAt(i, o.matrix);
      im.setColorAt(i, col.set(L0.col));
    });
    im.castShadow = true;
    root.add(im, om);
  };
  batch('heart', hearts); batch('heart', heartsV, true); batch('round', rounds); batch('plump', plumps, false, '#2F4A3E');
}

/* ---------- extra props, so the desk feels lived-in ---------- */
function buildDeskExtras(kit: Kit, root: THREE.Object3D) {
  const Y = DESK_Y;
  // headphones resting on the closed laptop
  const hp = group(root, [-0.8, Y + 0.0165, 0.45]);
  hp.rotation.y = 0.5;
  const shell = std('#2A2C31', { roughness: 0.45, metalness: 0.15 }), padM = std('#B9A58C', { roughness: 0.9 }), steel = std('#8E949B', { roughness: 0.3, metalness: 0.8 });
  add(hp, new THREE.TorusGeometry(0.085, 0.006, 12, 40, Math.PI), shell, [0, 0.006, 0], [-Math.PI / 2, 0, 0]);
  add(hp, new THREE.TorusGeometry(0.085, 0.0025, 8, 40, Math.PI), steel, [0, 0.012, 0], [-Math.PI / 2, 0, 0], false);
  for (const s of [-1, 1]) {
    const cup = group(hp, [s * 0.085, 0, 0.012]);
    add(cup, C(0.038, 0.036, 0.024, 32), shell, [0, 0.016, 0]);
    add(cup, new THREE.TorusGeometry(0.03, 0.009, 10, 28), padM, [0, 0.003, 0], [Math.PI / 2, 0, 0]);
    add(cup, C(0.02, 0.02, 0.002, 24), std('#3A3D42', { roughness: 0.6 }), [0, 0.0285, 0], [0, 0, 0], false);
  }
  // phone, face up, near the sticky notes
  const ph = group(root, [1.0, Y, 0.6]);
  ph.rotation.y = -0.35;
  add(ph, RBX(0.074, 0.008, 0.152, 0.008), std('#1D1E22', { roughness: 0.3, metalness: 0.4 }), [0, 0.004, 0]);
  const scr = kit.ctex(148, 300, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2F4E7A'); g.addColorStop(0.6, '#5D4B6E'); g.addColorStop(1, '#E88A6A');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(253,249,240,.92)'; x.textAlign = 'center';
    x.font = '600 40px Inter, sans-serif'; x.fillText('9:41', w / 2, 92);
    x.font = '500 13px Inter, sans-serif'; x.fillText('Focus at 7 pm', w / 2, 116);
    x.fillStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.moveTo(0, h * 0.1); x.lineTo(w, 0); x.lineTo(w, h * 0.25); x.lineTo(0, h * 0.4); x.fill();
    x.fillStyle = '#05060A'; x.beginPath(); x.arc(w / 2, 14, 5, 0, 7); x.fill();
  });
  add(ph, new THREE.PlaneGeometry(0.068, 0.146), new THREE.MeshStandardMaterial({ map: scr, roughness: 0.08, metalness: 0.2 }), [0, 0.0082, 0], [-Math.PI / 2, 0, 0], false, true);
  // reading glasses, folded on the desk mat
  const gl = group(root, [0.47, Y + 0.006, 0.66]);
  gl.rotation.y = 0.25;
  const frame = std('#2B2E33', { roughness: 0.35, metalness: 0.3 });
  const lens = new THREE.MeshStandardMaterial({ color: color('#CFE3F0'), roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28 });
  for (const s of [-1, 1]) {
    add(gl, new THREE.TorusGeometry(0.021, 0.0022, 8, 28), frame, [s * 0.026, 0.018, 0], [-0.35, 0, 0]);
    add(gl, new THREE.CircleGeometry(0.0205, 28), lens, [s * 0.026, 0.018, 0.0004], [-0.35, 0, 0], false, false);
    add(gl, B(0.05, 0.0024, 0.0024), frame, [s * 0.02, 0.006, -0.02], [0, s * 0.25, 0]);
  }
  add(gl, new THREE.TorusGeometry(0.007, 0.0018, 6, 12, Math.PI), frame, [0, 0.026, -0.004], [-0.35, 0, 0]);
  // steel water bottle behind the book stack
  const bt = group(root, [-1.57, Y, 0.3]);
  add(bt, lathe([[0, 0], [0.032, 0], [0.034, 0.006], [0.034, 0.19], [0.03, 0.205], [0.019, 0.215], [0.019, 0.222], [0, 0.222]], 40),
    new THREE.MeshStandardMaterial({ color: color('#7FA08E'), roughness: 0.35, metalness: 0.35 }));
  add(bt, C(0.021, 0.021, 0.03, 32), std('#2B2E33', { roughness: 0.5 }), [0, 0.236, 0]);
  add(bt, new THREE.TorusGeometry(0.012, 0.003, 8, 20), std('#2B2E33', { roughness: 0.5 }), [0, 0.254, 0]);
  add(bt, new THREE.CylinderGeometry(0.0345, 0.0345, 0.03, 40, 1, true), std('#E8E1D3', { roughness: 0.8 }), [0, 0.09, 0], [0, 0, 0], false);
  // index cards held with a binder clip
  const ic = group(root, [0.5, Y + 0.004, 0.4]);
  ic.rotation.y = -0.18;
  const cardM = new THREE.MeshStandardMaterial({ map: kit.paperTex('#F6F1E4', 131), roughness: 0.9 });
  for (let i = 0; i < 6; i++) add(ic, B(0.102, 0.0016, 0.066), cardM, [(i % 2) * 0.0012, 0.0008 + i * 0.0017, (i % 3) * 0.0008], [0, i * 0.01, 0]);
  add(ic, B(0.03, 0.014, 0.014), std('#1E1F22', { roughness: 0.4, metalness: 0.4 }), [0, 0.006, -0.03]);
  add(ic, new THREE.TorusGeometry(0.009, 0.0011, 6, 12, Math.PI), std('#C9CDD2', { roughness: 0.2, metalness: 0.9 }), [0, 0.016, -0.03], [Math.PI / 2, 0, 0]);
  // a polaroid propped against the wall
  const pol = kit.ctex(200, 240, (x, w, h) => {
    x.fillStyle = '#F7F4EE'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, 14, 0, 180);
    g.addColorStop(0, '#F2B58A'); g.addColorStop(0.55, '#E88A6A'); g.addColorStop(1, '#5D4B6E');
    x.fillStyle = g; x.fillRect(14, 14, w - 28, 166);
    x.fillStyle = '#3B3149'; x.beginPath(); x.moveTo(14, 180); x.lineTo(60, 120); x.lineTo(96, 150); x.lineTo(140, 100); x.lineTo(w - 14, 160); x.lineTo(w - 14, 180); x.fill();
    x.fillStyle = '#FFE6B8'; x.beginPath(); x.arc(130, 70, 16, 0, 7); x.fill();
    x.fillStyle = '#2B2E33'; x.font = '30px "Patrick Hand", cursive'; x.textAlign = 'center'; x.fillText('trip 2025', w / 2, 220);
  });
  const pg2 = group(root, [-0.3, Y, 0.05]);
  pg2.rotation.set(-0.12, 0.06, 0);
  add(pg2, B(0.074, 0.088, 0.0016), [cardM, cardM, cardM, cardM, new THREE.MeshStandardMaterial({ map: pol, roughness: 0.7 }), cardM], [0, 0.044, 0]);
}

/* ---------- wall clock: shows the viewer's local time ---------- */
function buildWallClock(kit: Kit, root: THREE.Object3D): () => void {
  const g = group(root, [-0.97, 2.13, 0]);
  const rim = std('#2B2E33', { roughness: 0.4, metalness: 0.25 });
  add(g, lathe([[0, 0], [0.148, 0], [0.155, 0.006], [0.155, 0.03], [0.146, 0.036], [0.138, 0.03], [0.138, 0.008], [0, 0.008]], 64), rim, [0, 0, 0], [Math.PI / 2, 0, 0]);
  const face = kit.ctex(512, 512, (x, w) => {
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#FBF8F1'; x.fillRect(0, 0, w, w);
    const c = w / 2;
    x.translate(c, c);
    for (let i = 0; i < 60; i++) {
      x.save(); x.rotate((i * Math.PI) / 30); x.fillStyle = '#2B2E33';
      if (i % 5) x.fillRect(-1.5, -232, 3, 12); else x.fillRect(-4, -236, 8, 26);
      x.restore();
    }
    x.fillStyle = '#2B2E33'; x.font = '600 50px "Barlow Condensed", "Arial Narrow", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i * Math.PI) / 6; x.fillText(String(i), Math.sin(a) * 172, -Math.cos(a) * 172); }
    x.font = '600 22px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillStyle = '#6B6F76'; x.fillText('TASKFLOW', 0, 82);
    x.setTransform(1, 0, 0, 1, 0, 0);
  });
  add(g, new THREE.CircleGeometry(0.139, 64), new THREE.MeshStandardMaterial({ map: face, roughness: 0.85 }), [0, 0, 0.0086], [0, 0, 0], false, true);
  const hand = (len: number, wid: number, tail: number, z: number, mat: THREE.Material) => {
    const p = group(g, [0, 0, z]);
    add(p, B(wid, len + tail, 0.003), mat, [0, (len - tail) / 2, 0], [0, 0, 0], true, false);
    return p;
  };
  const ink = std('#2B2E33', { roughness: 0.5 }), coral = std('#E04A2F', { roughness: 0.45 });
  const hH = hand(0.072, 0.011, 0.016, 0.012, ink), hM = hand(0.108, 0.007, 0.018, 0.015, ink), hS = hand(0.118, 0.0028, 0.03, 0.018, coral);
  add(g, C(0.009, 0.009, 0.008, 20), coral, [0, 0, 0.02], [Math.PI / 2, 0, 0], false, false);
  const tick = () => {
    const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    hS.rotation.z = (-s * Math.PI) / 30;
    hM.rotation.z = (-m * Math.PI) / 30;
    hH.rotation.z = (-h * Math.PI) / 6;
  };
  tick();
  return tick;
}
