import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { frameStep } from './frame';
import { Hit, type Target } from './interaction';
import { boardOrder, dueLabel, isLate, openCountByCategory, weekSummary, type DeskData, type DeskTask } from './model';
import { add, B, C, color, disposeTree, group, Kit, repaint, std, type PaintedTexture, type V3 } from './three/kit';
import { chip, hashSeed, icon, mixHex, roundRect, shade, squiggle, wrapText } from './three/paint';
import { DESK_Y, LEGACY_FIT, ORGANIZER } from './three/room';

/*
 * The interactive objects. Each one builds its meshes once with the same builder code as the prototype, then
 * repaints its canvas textures whenever the data it shows changes. Clicking any of them goes through <Hit>.
 */

interface ObjectProps {
  kit: Kit;
  data: DeskData;
}

/** Keeps a built object for the life of the component and frees its GPU memory afterwards. */
function useBuilt<T extends { root: THREE.Object3D }>(build: () => T): T {
  const [built] = useState(build);
  useEffect(() => () => disposeTree(built.root), [built]);
  return built;
}

/** The latest props, readable from canvas paint callbacks that were created once. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  // Layout effects run before the repaint effects below, so a repaint always sees the new value.
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

const invalidateAfter = (invalidate: () => void, textures: PaintedTexture[]) => {
  textures.forEach(repaint);
  invalidate();
};

/* ================= corkboard and notes ================= */

const BOARD: V3 = [0.08, 1.62, 0];
const BOARD_TARGET: Target = { key: 'board', label: 'Corkboard', sub: 'All tasks', focus: BOARD, view: [0.08, 1.62, 1.72], lift: 'none' };
export const NOTE_SLOTS: Array<[number, number]> = [0.225, -0.02, -0.265].flatMap((ry) => [-0.495, -0.165, 0.165, 0.495].map((rx): [number, number] => [0.08 + rx, 1.62 + ry]));
const PIN_COLORS = ['#E04A3A', '#F2B233', '#2FA36B', '#3B7DD8', '#8C5BD6', '#E04A3A', '#2FA36B', '#F2B233', '#3B7DD8', '#E04A3A', '#8C5BD6', '#2FA36B'];
const NOTE_TILT = [-0.02, 0.015, -0.01, 0.02, -0.015, 0.01, 0.012, -0.018, 0.02, -0.01, 0.015, -0.02];

export function Corkboard({ kit, data }: ObjectProps) {
  const invalidate = useThree((s) => s.invalidate);
  const order = useMemo(() => boardOrder(data.tasks), [data.tasks]);
  const latest = useLatest({ order, today: data.today });

  const built = useBuilt(() => {
    const root = new THREE.Group();
    const frame = group(root, BOARD);
    add(frame, B(1.46, 1.0, 0.035), kit.mat.wood, [0, 0, 0.018]);
    const clickable = group(root, BOARD);
    const cork = kit.ctex(1280, 853, (x, w, h) => {
      x.fillStyle = '#9C6A38';
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        const v = Math.random();
        x.fillStyle = v < 0.5 ? `rgba(70,40,15,${0.25 * Math.random()})` : `rgba(240,200,140,${0.22 * Math.random()})`;
        x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
      const hidden = Math.max(0, latest.current.order.length - NOTE_SLOTS.length);
      if (hidden) {
        x.fillStyle = 'rgba(253,249,240,.92)';
        x.font = '28px "Patrick Hand", cursive';
        x.textAlign = 'center';
        x.fillText(`+${hidden} more in your list`, w / 2, h - 28);
        x.textAlign = 'left';
      }
    });
    add(clickable, new THREE.PlaneGeometry(1.38, 0.92), new THREE.MeshStandardMaterial({ map: cork, roughness: 1 }), [0, 0, 0.036], [0, 0, 0], false, true);
    const lbl = kit.ctex(400, 140, (x, w, h) => {
      x.fillStyle = '#F7F2E8'; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,0,0,.05)'; x.fillRect(0, h - 10, w, 10);
      icon(x, 'boxcheck', 58, 72, 46, '#2B2E33');
      x.fillStyle = '#2B2E33'; x.font = '62px "Patrick Hand", cursive'; x.fillText('My Tasks', 100, 92);
    });
    add(clickable, new THREE.PlaneGeometry(0.24, 0.084), new THREE.MeshStandardMaterial({ map: lbl, roughness: 0.9 }), [-0.56, 0.405, 0.042], [0, 0, 0.04]);
    // "Small steps" note, pinned for decoration
    const ss = kit.ctex(300, 220, (x, w, h) => {
      x.fillStyle = '#C9DCE6'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2B2E33'; x.font = '38px "Patrick Hand", cursive'; x.textAlign = 'center';
      x.fillText('Small steps', w / 2, 80); x.fillText('Big results', w / 2, 128);
      x.font = '34px "Patrick Hand"'; x.fillText(':)', w / 2, 178);
    });
    const ssg = group(frame, [-0.6, -0.415, 0.042]);
    ssg.rotation.z = 0.03;
    add(ssg, new THREE.PlaneGeometry(0.12, 0.088), new THREE.MeshStandardMaterial({ map: ss, roughness: 0.9 }));
    add(ssg, new THREE.SphereGeometry(0.008, 12, 10), std('#E04A3A', { roughness: 0.3 }), [0, 0.038, 0.01]);

    const notes = NOTE_SLOTS.map(([nx, ny], i) => {
      const g = group(root, [nx, ny, 0.042]);
      g.rotation.z = NOTE_TILT[i]!;
      const tex = kit.ctex(512, 368, (x, w, h) => paintNote(x, w, h, latest.current.order[i], latest.current.today));
      add(g, new THREE.PlaneGeometry(0.27, 0.195), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
      add(g, new THREE.SphereGeometry(0.011, 16, 12), std(PIN_COLORS[i]!, { roughness: 0.3 }), [0, 0.085, 0.012]);
      add(g, C(0.002, 0.002, 0.02, 6), kit.mat.metal, [0, 0.085, 0.002], [Math.PI / 2, 0, 0]);
      root.remove(g); // mounted through React so only slots with a task exist (and can be clicked)
      return { g, tex };
    });
    root.remove(clickable);
    return { root, frame, clickable, cork, notes };
  });

  // The clickable cork and the notes are detached from `root` while unmounted, so free them separately.
  useEffect(() => () => [built.clickable, ...built.notes.map((n) => n.g)].forEach(disposeTree), [built]);
  useEffect(() => invalidateAfter(invalidate, [built.cork, ...built.notes.map((n) => n.tex)]), [order, data.today, built, invalidate]);

  return (
    <>
      <primitive object={built.root} dispose={null} />
      <Hit target={BOARD_TARGET}>
        <primitive object={built.clickable} dispose={null} />
      </Hit>
      {built.notes.map((n, i) => {
        const t = order[i];
        if (!t) return null;
        const [nx, ny] = NOTE_SLOTS[i]!;
        const target: Target = {
          key: `note:${t.id}`,
          label: t.title,
          sub: `${t.category?.name ?? 'No category'} · ${t.level.name} · ${dueLabel(t, data.today)}`,
          focus: [nx, ny, 0],
          view: [nx * 0.7 + 0.02, ny, 0.95],
          lift: 'z',
        };
        return (
          <Hit key={i} target={target}>
            <primitive object={n.g} dispose={null} />
          </Hit>
        );
      })}
    </>
  );
}

function paintNote(x: CanvasRenderingContext2D, w: number, h: number, t: DeskTask | undefined, today: string) {
  x.clearRect(0, 0, w, h);
  if (!t) return;
  const paper = t.category?.note ?? '#F6DC8F';
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, paper);
  g.addColorStop(1, shade(paper, -10));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,.05)';
  x.fillRect(0, h - 22, w, 22);
  icon(x, t.done ? 'boxcheck' : 'box', 44, 74, 38, '#2B2E33');
  x.fillStyle = t.done ? 'rgba(43,46,51,.5)' : '#2B2E33';
  x.font = '50px "Patrick Hand", cursive';
  const lines = wrapText(x, t.title, w - 100).slice(0, 2);
  lines.forEach((ln, i) => {
    x.fillText(ln, 80, 90 + i * 50);
    if (t.done) squiggle(x, 80, 74 + i * 50, x.measureText(ln).width, hashSeed(t.id) + i);
  });
  const cy = 90 + lines.length * 50 + 2;
  let cx = 80;
  if (t.category) cx += chip(x, cx, cy, t.category.name, shade(t.category.color, 55, true), shade(t.category.color, -45), t.category.icon) + 10;
  chip(x, cx, cy, t.level.name, mixHex(t.level.color, '#FFFFFF', 0.26), shade(t.level.color, -45), 'flag');
  icon(x, 'cal', 96, h - 52, 30, '#2B2E33');
  const late = isLate(t, today);
  x.fillStyle = late ? '#B4232A' : '#2B2E33';
  x.font = `${late ? '700' : '500'} 29px Inter, sans-serif`;
  x.fillText((late ? 'Overdue · ' : '') + dueLabel(t, today), 124, h - 42);
  if (t.subtasks.total) {
    x.fillStyle = 'rgba(43,46,51,.7)';
    x.textAlign = 'right';
    x.fillText(`${t.subtasks.done}/${t.subtasks.total}`, w - 28, h - 42);
    x.textAlign = 'left';
  }
}

/* ================= wall calendar ================= */

const CAL_TARGET: Target = { key: 'calendar', label: 'Wall calendar', sub: 'Deadlines by date', focus: [-0.97, 1.52, 0], view: [-0.97, 1.52, 0.9], lift: 'z' };

export function WallCalendar({ kit, data }: ObjectProps) {
  const invalidate = useThree((s) => s.invalidate);
  const latest = useLatest(data);
  const built = useBuilt(() => {
    const root = new THREE.Group();
    root.position.set(-0.97, 1.52, 0);
    root.scale.setScalar(0.9);
    const tex = kit.ctex(560, 720, (x, w, h) => {
      const { today, tasks } = latest.current;
      const now = new Date(`${today}T00:00`);
      x.fillStyle = '#F8F6F2'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#2B2E33'; x.textAlign = 'center'; x.font = '500 40px "Patrick Hand", cursive';
      x.fillText(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), w / 2, 108);
      x.font = '600 34px Inter'; x.fillStyle = '#5E626A'; x.fillText('‹', 52, 106); x.fillText('›', w - 52, 106);
      x.font = '600 20px Inter';
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d, i) => x.fillText(d, 52 + i * 76, 168));
      const y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= days; d++) {
        const idx = first + d - 1, cx = 52 + (idx % 7) * 76, cy = 236 + Math.floor(idx / 7) * 82;
        const ds = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (ds === today) {
          x.fillStyle = '#2F6FD6'; x.beginPath(); x.arc(cx, cy - 9, 26, 0, 7); x.fill(); x.fillStyle = '#fff';
        } else x.fillStyle = '#3B3F46';
        x.font = '500 26px Inter';
        x.fillText(String(d), cx, cy);
        // up to three dots per day, most important first (DL-4)
        const due = tasks.filter((t) => t.due === ds && !t.done).sort((a, b) => b.level.rank - a.level.rank);
        due.slice(0, 3).forEach((t, k) => {
          x.fillStyle = t.level.color;
          x.beginPath();
          x.arc(cx - (Math.min(due.length, 3) - 1) * 7 + k * 14, cy + 26, 5, 0, 7);
          x.fill();
        });
      }
      x.textAlign = 'left';
    });
    add(root, B(0.44, 0.58, 0.006), kit.mat.white, [0, 0, 0.004]);
    add(root, new THREE.PlaneGeometry(0.44, 0.58), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), [0, 0, 0.0075], [0, 0, 0], false, true);
    for (let i = 0; i < 18; i++) add(root, new THREE.TorusGeometry(0.009, 0.0018, 6, 14), kit.mat.metal, [-0.2 + i * 0.0235, 0.29, 0.009], [0, Math.PI / 2, 0], false);
    add(root, new THREE.TorusGeometry(0.03, 0.003, 8, 24, Math.PI), kit.mat.metal, [0, 0.3, 0.006]);
    add(root, new THREE.SphereGeometry(0.008, 10, 8), kit.mat.black, [0, 0.33, 0.006]);
    return { root, tex };
  });
  useEffect(() => invalidateAfter(invalidate, [built.tex]), [data, built, invalidate]);
  return (
    <Hit target={CAL_TARGET}>
      <primitive object={built.root} dispose={null} />
    </Hit>
  );
}

/* ================= hanging keys: add, edit, search ================= */

const KEYS = [
  { key: 'add', label: 'Add Task', sub: 'New task form', col: '#2E9E4F', ic: 'plus' as const, x: 0.98 },
  { key: 'manage', label: 'Edit / Delete', sub: 'Edit or delete a task', col: '#F2B233', ic: 'pencil' as const, x: 1.12 },
  { key: 'search', label: 'Search', sub: 'Find and filter tasks', col: '#3B7DD8', ic: 'search' as const, x: 1.26 },
];

export function Keys({ kit }: { kit: Kit }) {
  const built = useBuilt(() => {
    const root = new THREE.Group();
    const keys = KEYS.map((o) => {
      const g = group(root, [o.x, 1.74, 0]);
      add(g, C(0.018, 0.018, 0.012, 20), kit.mat.black, [0, 0, 0.006], [Math.PI / 2, 0, 0]);
      add(g, new THREE.TorusGeometry(0.016, 0.0035, 8, 20), kit.mat.metal, [0, -0.025, 0.02]);
      for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.008, 0.002, 6, 12), kit.mat.metal, [0, -0.048 - i * 0.013, 0.02], [0, i % 2 ? Math.PI / 2 : 0, 0], false);
      const fobT = kit.ctex(256, 256, (x, w, h) => {
        const gr = x.createRadialGradient(w * 0.4, h * 0.35, 10, w / 2, h / 2, w / 2);
        gr.addColorStop(0, shade(o.col, 25)); gr.addColorStop(1, shade(o.col, -15));
        x.fillStyle = gr; x.fillRect(0, 0, w, h);
        if (o.ic === 'pencil') {
          x.save(); x.translate(w / 2, h / 2); x.rotate(-0.8);
          x.fillStyle = '#FFE08A'; x.fillRect(-70, -16, 110, 32);
          x.fillStyle = '#F2A0A0'; x.fillRect(40, -16, 26, 32);
          x.fillStyle = '#F5D7A8'; x.beginPath(); x.moveTo(-70, -16); x.lineTo(-100, 0); x.lineTo(-70, 16); x.fill();
          x.fillStyle = '#2B2E33'; x.beginPath(); x.moveTo(-90, -6); x.lineTo(-100, 0); x.lineTo(-90, 6); x.fill();
          x.restore();
        } else icon(x, o.ic, w / 2, h / 2, 150, '#FFFFFF');
      });
      fobT.center.set(0.5, 0.5);
      fobT.rotation = Math.PI / 2;
      const side = std('#DDD', { roughness: 0.4, metalness: 0.3 });
      add(g, C(0.04, 0.04, 0.012, 40), [side, new THREE.MeshStandardMaterial({ map: fobT, roughness: 0.35 }), side], [0, -0.135, 0.024], [Math.PI / 2, 0, 0]);
      root.remove(g);
      return { g, o };
    });
    return { root, keys };
  });
  useEffect(() => () => built.keys.forEach((k) => disposeTree(k.g)), [built]);
  return (
    <>
      {built.keys.map(({ g, o }) => (
        <Hit key={o.key} target={{ key: o.key, label: o.label, sub: o.sub, focus: [o.x, 1.65, 0], view: [o.x, 1.64, 0.6], lift: 'z' }}>
          <primitive object={g} dispose={null} />
        </Hit>
      ))}
    </>
  );
}

/* ================= desk lamp: dark mode switch ================= */

const LAMP_ON = { spot: 4.2, glow: 1.3, bulb: '#FFF6E0', inner: '#E9B57A' };
const LAMP_OFF = { bulb: '#8F8B84', inner: '#2E2B29' };

export function Lamp({ kit, on, reducedMotion }: { kit: Kit; on: boolean; reducedMotion: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const built = useBuilt(() => {
    const root = new THREE.Group();
    const mount = new THREE.Vector3(1.64, 2.1, 0.02), elbow = new THREE.Vector3(1.47, 2.2, 0.24), head = new THREE.Vector3(1.2, 2.02, 0.26);
    add(root, C(0.045, 0.045, 0.02, 24), kit.mat.black, [mount.x, mount.y, 0.01], [Math.PI / 2, 0, 0]);
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const m = add(root, C(r, r, a.distanceTo(b), 12), kit.mat.black);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    };
    rod(mount, elbow, 0.011);
    rod(elbow, head, 0.011);
    add(root, new THREE.SphereGeometry(0.018, 12, 10), kit.mat.black, [elbow.x, elbow.y, elbow.z]);
    const shadeG = group(root, [head.x, head.y, head.z]);
    shadeG.lookAt(new THREE.Vector3(0.1, 0.75, 0.55));
    shadeG.rotateX(-Math.PI / 2);
    const outer = new THREE.CylinderGeometry(0.04, 0.1, 0.15, 40, 1, true);
    outer.translate(0, -0.075, 0);
    add(shadeG, outer, std('#1C1D20', { roughness: 0.35, metalness: 0.4, side: THREE.FrontSide }));
    const inner = new THREE.MeshBasicMaterial({ color: color(LAMP_ON.inner), side: THREE.BackSide });
    add(shadeG, outer.clone(), inner, [0, 0, 0], [0, 0, 0], false, false).scale.setScalar(0.985);
    add(shadeG, new THREE.SphereGeometry(0.043, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), kit.mat.black);
    const bulb = new THREE.MeshBasicMaterial({ color: color(LAMP_ON.bulb) });
    add(shadeG, new THREE.SphereGeometry(0.03, 16, 12), bulb, [0, -0.1, 0], [0, 0, 0], false, false);

    const bulbWorld = new THREE.Vector3();
    root.updateMatrixWorld(true);
    shadeG.localToWorld(bulbWorld.set(0, -0.11, 0));
    // Physical light units: the prototype's values scaled by π (as three did before r155) and refitted for falloff.
    const spot = new THREE.SpotLight(color('#FFC98A'), LAMP_ON.spot, 4.5, 0.95, 0.75, LEGACY_FIT.spot.decay);
    spot.position.copy(bulbWorld);
    spot.target.position.set(-0.05, 0.75, 0.45);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0008;
    spot.shadow.radius = 4;
    const glow = new THREE.PointLight(color('#FFC98A'), LAMP_ON.glow, 1.6, LEGACY_FIT.glow.decay);
    glow.position.copy(bulbWorld).add(new THREE.Vector3(0, 0.05, 0.05));
    const haloT = kit.canvasTex(256, 256, (x, w, h) => {
      const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,225,170,.95)'); gr.addColorStop(0.25, 'rgba(255,200,130,.35)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.position.copy(bulbWorld);
    halo.scale.set(0.3, 0.3, 1);
    const lights = new THREE.Group();
    lights.add(spot, spot.target, glow, halo);
    const parts = { root, lights, spot, glow, halo, bulb, inner, level: on ? 1 : 0 };
    setLampLevel(parts, parts.level); // first paint: no fade
    return parts;
  });

  // The bulb, the shade lining, the halo and both lights fade together over about 0.4 s.
  const goal = on ? 1 : 0;
  useEffect(() => invalidate(), [on, invalidate]);
  useFrame((_, dt) => {
    const cur = built.level;
    if (cur === goal) return;
    const step = reducedMotion ? 1 : frameStep(dt) / 0.4;
    setLampLevel(built, goal > cur ? Math.min(goal, cur + step) : Math.max(goal, cur - step));
    invalidate();
  });

  return (
    <>
      <Hit target={{ key: 'lamp', label: 'Desk lamp', sub: on ? 'Click to switch off · light mode' : 'Click to switch on · dark mode', lift: 'none' }}>
        <primitive object={built.root} dispose={null} />
      </Hit>
      <primitive object={built.lights} dispose={null} />
    </>
  );
}

interface LampParts {
  spot: THREE.SpotLight;
  glow: THREE.PointLight;
  halo: THREE.Sprite;
  bulb: THREE.MeshBasicMaterial;
  inner: THREE.MeshBasicMaterial;
  level: number;
}
function setLampLevel(p: LampParts, k: number) {
  p.level = k;
  p.spot.intensity = LAMP_ON.spot * Math.PI * LEGACY_FIT.spot.scale * k;
  p.glow.intensity = LAMP_ON.glow * Math.PI * LEGACY_FIT.glow.scale * k;
  p.spot.visible = p.glow.visible = p.halo.visible = k > 0.001;
  p.halo.material.opacity = k;
  p.bulb.color.set(LAMP_OFF.bulb).lerp(color(LAMP_ON.bulb), k);
  p.inner.color.set(LAMP_OFF.inner).lerp(color(LAMP_ON.inner), k);
}

/* ================= organizer trays: the first six categories ================= */

export function Trays({ kit, data }: ObjectProps) {
  const invalidate = useThree((s) => s.invalidate);
  const counts = useMemo(() => openCountByCategory(data), [data]);
  const latest = useLatest({ cats: data.categories, counts });
  const { x: X, z: Z, w: W, h: H, d: D, step } = ORGANIZER;

  const built = useBuilt(() => {
    const root = new THREE.Group();
    const trays = Array.from({ length: 6 }, (_, i) => {
      const y = H - 0.048 - i * step;
      const g = group(root, [X, 0.75 + y, Z + 0.012]);
      const body = std('#8E959E', { roughness: 0.55 });
      const front = kit.ctex(512, 80, (x, w, h) => {
        const c = latest.current.cats[i];
        if (!c) return;
        body.color.set(c.color);
        const gr = x.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, shade(c.color, 12)); gr.addColorStop(1, shade(c.color, -8));
        x.fillStyle = gr; x.fillRect(0, 0, w, h);
        x.fillStyle = '#20242B'; x.font = '500 40px Inter, sans-serif'; x.textBaseline = 'middle';
        x.fillText(c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name, 34, h / 2 + 2);
        const n = latest.current.counts.get(c.id) ?? 0;
        if (n) {
          x.fillStyle = 'rgba(255,255,255,.85)'; roundRect(x, w - 76, 16, 56, 48, 24); x.fill();
          x.fillStyle = '#20242B'; x.textAlign = 'center'; x.font = '600 30px Inter'; x.fillText(String(n), w - 48, h / 2 + 2); x.textAlign = 'left';
        }
        x.textBaseline = 'alphabetic';
      });
      add(g, B(W - 0.04, 0.052, D - 0.02), [body, body, body, body, new THREE.MeshStandardMaterial({ map: front, roughness: 0.55 }), body]);
      add(g, B(W - 0.08, 0.036, 0.008), kit.mat.white, [0, 0.009, -0.05], [-0.12, 0, 0]); // paper sticking out
      root.remove(g);
      return { g, front, y };
    });
    return { root, trays };
  });
  useEffect(() => () => built.trays.forEach((t) => disposeTree(t.g)), [built]);
  useEffect(() => invalidateAfter(invalidate, built.trays.map((t) => t.front)), [data.categories, counts, built, invalidate]);

  return (
    <>
      {built.trays.map(({ g, y }, i) => {
        const c = data.categories[i];
        if (!c) return null;
        return (
          <Hit key={i} target={{ key: `tray:${c.id}`, label: c.name, sub: 'Tasks in this category', focus: [X, 0.75 + y, Z], view: [X, 0.75 + y + 0.16, 0.85], lift: 'z' }}>
            <primitive object={g} dispose={null} />
          </Hit>
        );
      })}
    </>
  );
}

/* ================= notebook: weekly review ================= */

const NOTEBOOK_TARGET: Target = { key: 'notebook', label: 'Notebook', sub: 'Weekly review', focus: [-0.22, 0.76, 0.5], view: [-0.22, 1.2, 0.95], lift: 'y' };

export function Notebook({ kit, data }: ObjectProps) {
  const invalidate = useThree((s) => s.invalidate);
  const latest = useLatest(data);
  const built = useBuilt(() => {
    const root = new THREE.Group();
    const nb = group(root, [-0.22, DESK_Y + 0.004, 0.5]);
    nb.rotation.y = 0.04;
    const tex = kit.ctex(640, 480, (x, w, h) => {
      const wk = weekSummary(latest.current);
      x.fillStyle = '#FBF9F4'; x.fillRect(0, 0, w, h);
      x.strokeStyle = 'rgba(47,78,122,.18)'; x.lineWidth = 2;
      for (let y = 96; y < h; y += 52) { x.beginPath(); x.moveTo(60, y); x.lineTo(w - 20, y); x.stroke(); }
      x.fillStyle = '#2B2E33'; x.font = '46px "Patrick Hand", cursive'; x.fillText('This week:', 80, 78);
      x.font = '36px "Patrick Hand", cursive';
      const rows: Array<['boxcheck' | 'box', string, string]> = [
        ['boxcheck', `${wk.done.length} done`, '#2B2E33'],
        ['box', `${wk.open.length} still due`, '#2B2E33'],
        ['box', `${wk.overdue.length} overdue`, wk.overdue.length ? '#B4232A' : '#2B2E33'],
      ];
      rows.forEach(([ic, txt, col], i) => { const y = 136 + i * 52; icon(x, ic, 104, y - 11, 24, col); x.fillStyle = col; x.fillText(txt, 132, y); });
      // a tiny bar chart of completions, Monday to Sunday
      const max = Math.max(1, ...wk.perDay);
      x.font = '26px "Patrick Hand", cursive';
      wk.perDay.forEach((n, i) => {
        const bx = 380 + i * 34, bh = (n / max) * 110;
        x.fillStyle = wk.days[i] === latest.current.today ? '#2F4E7A' : 'rgba(47,78,122,.45)';
        x.fillRect(bx, 250 - bh, 22, Math.max(3, bh));
        x.fillStyle = '#2B2E33';
        x.fillText('MTWTFSS'[i]!, bx + 4, 284);
      });
    });
    const edges = new THREE.MeshStandardMaterial({ map: kit.pageEdges(false), roughness: 0.95 });
    add(nb, new THREE.BoxGeometry(0.352, 0.004, 0.262), new THREE.MeshStandardMaterial({ map: kit.clothTex('#2E3440', 61), roughness: 0.6 }), [0.004, 0.002, 0]);
    add(nb, B(0.336, 0.009, 0.246), [edges, edges, kit.mat.white, kit.mat.white, edges, edges], [0.004, 0.0085, 0]);
    add(nb, new THREE.PlaneGeometry(0.336, 0.246), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), [0.004, 0.0132, 0], [-Math.PI / 2, 0, 0], false, true);
    for (let i = 0; i < 12; i++) add(nb, new THREE.TorusGeometry(0.008, 0.0016, 8, 16), kit.mat.metal, [-0.165, 0.011, -0.11 + i * 0.02], [0, 0, Math.PI / 2], false);
    return { root, tex };
  });
  useEffect(() => invalidateAfter(invalidate, [built.tex]), [data, built, invalidate]);
  return (
    <Hit target={NOTEBOOK_TARGET}>
      <primitive object={built.root} dispose={null} />
    </Hit>
  );
}

/* ================= Pomodoro clock (decoupled from tasks, POM-5) ================= */

const TIMER_TARGET: Target = { key: 'timer', label: 'Pomodoro clock', sub: 'Focus timer', focus: [0.2, 0.84, 0.16], view: [0.2, 1.0, 0.62], lift: 'y' };

export function PomodoroClock({ kit }: { kit: Kit }) {
  const built = useBuilt(() => {
    const root = new THREE.Group();
    const ck = group(root, [0.2, DESK_Y + 0.085, 0.16]);
    add(ck, C(0.085, 0.085, 0.05, 48), kit.mat.woodDark, [0, 0, 0], [Math.PI / 2, 0, 0]);
    // Idle face until the timer panel is ported: 25:00, the default focus length (POM-1).
    const face = kit.ctex(512, 512, (x, w, h) => {
      x.fillStyle = '#0D0E10'; x.fillRect(0, 0, w, h);
      x.lineWidth = 16; x.strokeStyle = '#26282C'; x.beginPath(); x.arc(w / 2, h / 2, 200, 0, 7); x.stroke();
      x.strokeStyle = '#FF6B4A'; x.lineCap = 'round'; x.beginPath(); x.arc(w / 2, h / 2, 200, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.9999); x.stroke();
      x.fillStyle = '#E8473A'; x.beginPath(); x.arc(w / 2, 150, 22, 0, 7); x.fill();
      x.fillStyle = '#4FA35B'; x.fillRect(w / 2 - 3, 122, 6, 12);
      x.fillStyle = '#F3EFE8'; x.font = '700 104px "JetBrains Mono", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('25:00', w / 2, h / 2 + 10);
      x.font = '600 26px Inter'; x.fillStyle = '#9AA0A6'; x.fillText('▶  ❚❚  ↺', w / 2, h / 2 + 96);
      x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    });
    add(ck, new THREE.CircleGeometry(0.07, 48), new THREE.MeshBasicMaterial({ map: face, toneMapped: false }), [0, 0, 0.0255], [0, 0, 0], false, false);
    add(ck, B(0.08, 0.02, 0.05), kit.mat.woodDark, [0, -0.08, 0]);
    return { root };
  });
  return (
    <Hit target={TIMER_TARGET}>
      <primitive object={built.root} dispose={null} />
    </Hit>
  );
}

/** Every target the shortcut rail can open, so the rail works without a mouse or a 3D-capable pointer. */
export const RAIL_TARGETS: Record<string, Target> = {
  board: BOARD_TARGET,
  add: { key: 'add', label: 'Add Task', focus: [0.98, 1.65, 0], view: [0.98, 1.64, 0.6], lift: 'z' },
  manage: { key: 'manage', label: 'Edit / Delete', focus: [1.12, 1.65, 0], view: [1.12, 1.64, 0.6], lift: 'z' },
  search: { key: 'search', label: 'Search', focus: [1.26, 1.65, 0], view: [1.26, 1.64, 0.6], lift: 'z' },
  calendar: CAL_TARGET,
  categories: { key: 'categories', label: 'Categories', focus: [ORGANIZER.x, 1.0, ORGANIZER.z], view: [ORGANIZER.x, 1.16, 0.85], lift: 'none' },
  notebook: NOTEBOOK_TARGET,
  timer: TIMER_TARGET,
};
