import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type Ctx, seeded, speckle, woodCanvas } from './paint';

export type V3 = [number, number, number];
type Paint = (x: Ctx, w: number, h: number) => void;

/** A canvas texture that remembers how it was painted, so it can be repainted when data, theme or fonts change. */
export type PaintedTexture = THREE.CanvasTexture & { userData: { canvas: HTMLCanvasElement; paint: Paint } };

/** Colours are written as sRGB hex; three converts them to its linear working space. */
export const color = (hex: string) => new THREE.Color(hex);
export const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const C = (r1: number, r2: number, h: number, s = 32) => new THREE.CylinderGeometry(r1, r2, h, s);
export const lathe = (pts: Array<[number, number]>, seg = 48) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg);
export const RBX = (w: number, h: number, d: number, r = 0.003) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
export const std = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.8, metalness: 0, ...o });

/**
 * Builder toolkit for one desk. It owns the shared materials and texture caches, so everything it made can be
 * repainted (data, theme, late fonts) and released together when the desk unmounts.
 */
export class Kit {
  readonly painted: PaintedTexture[] = [];
  private readonly cache = new Map<string, THREE.Texture>();
  readonly mat: Record<'wood' | 'woodDark' | 'black' | 'white' | 'metal', THREE.Material>;

  constructor(readonly maxAnisotropy: number) {
    this.mat = {
      wood: new THREE.MeshStandardMaterial({ map: this.fromCanvas(woodCanvas(1024, 512, '#B9824B', '70,38,12'), [1, 1]), roughness: 0.55, metalness: 0 }),
      woodDark: new THREE.MeshStandardMaterial({ map: this.fromCanvas(woodCanvas(512, 256, '#7A4A22', '30,14,4')), roughness: 0.6 }),
      black: std('#1E1F22', { roughness: 0.45, metalness: 0.3 }),
      white: std('#F3EFE8', { roughness: 0.5 }),
      metal: std('#9AA0A6', { roughness: 0.3, metalness: 0.8 }),
    };
  }

  /** A repaintable canvas texture. */
  ctex(w: number, h: number, paint: Paint, repeat?: [number, number]): PaintedTexture {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const t = this.fromCanvas(canvas, repeat) as PaintedTexture;
    t.anisotropy = this.maxAnisotropy;
    t.userData = { canvas, paint };
    paint(canvas.getContext('2d')!, w, h);
    this.painted.push(t);
    return t;
  }

  /** A canvas texture painted once (procedural props). */
  canvasTex(w: number, h: number, paint: Paint, repeat?: [number, number]): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!, w, h);
    return this.fromCanvas(c, repeat);
  }

  fromCanvas(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    return t;
  }

  cached<T extends THREE.Texture>(key: string, make: () => T): T {
    let t = this.cache.get(key);
    if (!t) this.cache.set(key, (t = make()));
    return t as T;
  }

  repaintAll(): void {
    this.painted.forEach(repaint);
  }

  /* ---------- shared procedural textures ---------- */

  /** Stacked paper sheets seen edge-on. */
  pageEdges(vertical: boolean): THREE.CanvasTexture {
    return this.cached(vertical ? 'pagesV' : 'pagesH', () => {
      const t = this.canvasTex(256, 256, (x, w, h) => {
        x.fillStyle = '#EFE8D6';
        x.fillRect(0, 0, w, h);
        const r = seeded(5);
        for (let y = 0; y < h; y += 1.6) {
          x.fillStyle = `rgba(${r() < 0.5 ? '110,95,70' : '255,255,255'},${0.06 + r() * 0.2})`;
          x.fillRect(0, y, w, 0.9);
        }
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(90,70,40,.22)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,40,.22)');
        x.fillStyle = g;
        x.fillRect(0, 0, w, h);
      });
      if (vertical) {
        t.center.set(0.5, 0.5);
        t.rotation = Math.PI / 2;
      }
      return t;
    });
  }

  /** Bookcloth: fine weave, speckle, worn edges. */
  clothTex(col: string, seed: number): THREE.CanvasTexture {
    return this.canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = col;
      x.fillRect(0, 0, w, h);
      const r = seeded(seed);
      for (let i = 0; i < w; i += 2) {
        x.fillStyle = `rgba(255,255,255,${r() * 0.05})`; x.fillRect(i, 0, 1, h);
        x.fillStyle = `rgba(0,0,0,${r() * 0.06})`; x.fillRect(0, i, w, 1);
      }
      speckle(x, w, h, 900, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.06)'], [1, 2], seed + 9);
      x.strokeStyle = 'rgba(255,255,255,.14)';
      x.lineWidth = 7;
      x.strokeRect(0, 0, w, h);
    });
  }

  paperTex(base: string, seed: number): THREE.CanvasTexture {
    return this.canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 2200, ['rgba(0,0,0,.035)', 'rgba(255,255,255,.07)', 'rgba(120,100,60,.04)'], [1, 2.4], seed);
    });
  }

  ceramicTex(base: string, dots: string[], seed: number): THREE.CanvasTexture {
    return this.canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      speckle(x, w, h, 700, dots, [1, 2.2], seed);
    });
  }

  corkTex(): THREE.CanvasTexture {
    return this.cached('cork', () =>
      this.canvasTex(256, 256, (x, w, h) => {
        x.fillStyle = '#B98A55';
        x.fillRect(0, 0, w, h);
        speckle(x, w, h, 7000, ['#8C6236', '#D3A86F', '#A6773F', '#6E4A26'], [1, 3.5], 41);
      }),
    );
  }

  /** Three light steps give the plants their flat, illustrated shading. */
  toonRamp(): THREE.DataTexture {
    return this.cached('toon', () => {
      const t = new THREE.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, THREE.RedFormat);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    });
  }
}

export function repaint(t: PaintedTexture): void {
  const c = t.userData.canvas;
  t.userData.paint(c.getContext('2d')!, c.width, c.height);
  t.needsUpdate = true;
}

export function add(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  p: V3 = [0, 0, 0],
  r: V3 = [0, 0, 0],
  cast = true,
  recv = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = cast;
  m.receiveShadow = recv;
  parent.add(m);
  return m;
}

export function group(parent: THREE.Object3D, p: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(...p);
  parent.add(g);
  return g;
}

/** Releases every geometry, material and texture under `root` (GPU memory is not garbage collected). */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<object>();
  const once = (o: { dispose(): void } | null | undefined) => {
    if (o && !seen.has(o)) {
      seen.add(o);
      o.dispose();
    }
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) once(m.geometry);
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) once(v);
      once(mat);
    }
    const shadow = (o as THREE.DirectionalLight).isLight ? (o as THREE.DirectionalLight).shadow : undefined;
    if (shadow?.map) once(shadow.map);
  });
}
