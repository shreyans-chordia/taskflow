import * as THREE from 'three';
import type { V3 } from './three/kit';

/** CSS-style cubic-bezier easing, solved with a few Newton steps. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 1 - 3 * x2 + 3 * x1, bx = 3 * x2 - 6 * x1, cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const fx = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(fx) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= fx / d;
    }
    t = Math.min(1, Math.max(0, t));
    return ((ay * t + by) * t + cy) * t;
  };
}

/** Unhurried start, long soft landing. */
const EASE = cubicBezier(0.42, 0, 0.18, 1);

/**
 * Moves the camera around the room: the responsive home view, a gentle arc when flying to an object and back,
 * and sideways panning on narrow screens where the whole desk does not fit.
 */
export class CameraController {
  readonly look = new THREE.Vector3();
  home = { pos: new THREE.Vector3(0, 1.36, 2.85), look: new THREE.Vector3(0, 1.13, 0), fov: 47 };
  flying = false;
  atObject = false;
  panX = 0;
  private flight: {
    t0: number;
    ms: number;
    p0: THREE.Vector3;
    l0: THREE.Vector3;
    f0: number;
    f1: number;
    ctrl: THREE.Vector3;
    pos: THREE.Vector3;
    lookAt: THREE.Vector3;
    at?: [number, () => void];
    fired: boolean;
    done: () => void;
  } | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly invalidate: () => void,
    private readonly reducedMotion: () => boolean,
  ) {}

  /** Wide screens see the whole desk; narrow ones back off until the corkboard fits across and can pan. */
  resize(aspect: number): void {
    const c = this.camera;
    c.aspect = aspect;
    if (aspect >= 1.25) {
      this.home = { pos: new THREE.Vector3(0, 1.36, 2.85), look: new THREE.Vector3(0, 1.13, 0), fov: 47 };
    } else {
      const fit = 1.5 / (2 * Math.tan((29 * Math.PI) / 180) * aspect);
      const d = Math.max(aspect < 0.8 ? 2.05 : 2.3, Math.min(3.1, fit));
      this.home = { pos: new THREE.Vector3(this.panX, 1.45, d), look: new THREE.Vector3(this.panX, 1.4, 0), fov: 58 };
    }
    c.fov = this.atObject ? this.home.fov - 3 : this.home.fov;
    c.updateProjectionMatrix();
    if (!this.flying && !this.atObject) this.snapHome();
    this.invalidate();
  }

  get canPan(): boolean {
    return this.camera.aspect < 1.25 && !this.atObject && !this.flying;
  }

  pan(x: number): void {
    this.panX = Math.max(-1.25, Math.min(1.25, x));
    this.resize(this.camera.aspect);
  }

  snapHome(): void {
    this.camera.position.copy(this.home.pos);
    this.look.copy(this.home.look);
    this.camera.lookAt(this.look);
  }

  /** Starts the camera a little back and above home, for the "walking into the room" entrance. */
  enterFrom(offset: V3): Promise<void> {
    this.camera.position.copy(this.home.pos).add(new THREE.Vector3(...offset));
    this.look.copy(this.home.look);
    this.camera.lookAt(this.look);
    return this.fly(this.home.pos, this.home.look, 1300, { fov: this.home.fov });
  }

  async flyToObject(view: V3, focus: V3, onArrive: () => void): Promise<void> {
    this.atObject = true;
    const to = new THREE.Vector3(...view);
    await this.fly(to, new THREE.Vector3(...focus), this.flyTime(to), { fov: this.home.fov - 3, at: [0.6, onArrive] });
  }

  async flyHome(): Promise<void> {
    await this.fly(this.home.pos, this.home.look, this.flyTime(this.home.pos), { fov: this.home.fov });
    this.atObject = false;
  }

  private flyTime(to: THREE.Vector3): number {
    return Math.round(Math.min(1250, Math.max(820, 700 + this.camera.position.distanceTo(to) * 300)));
  }

  /**
   * A gentle arc, drifting back and up a little mid-flight like a hand-held dolly; the eye turns slightly ahead of
   * the body. This only plans the flight: `update` advances it from inside the renderer's frame loop, so every frame
   * drawn shows exactly where the camera is at that moment (a second requestAnimationFrame loop beside the
   * renderer's drew some frames before the move and some after it, which made the motion judder).
   */
  fly(pos: THREE.Vector3, lookAt: THREE.Vector3, ms: number, o: { fov?: number; at?: [number, () => void] } = {}): Promise<void> {
    this.flight?.done(); // a new flight replaces one still under way
    const cam = this.camera;
    if (this.reducedMotion()) ms = Math.min(ms, 160);
    const p0 = cam.position.clone(), l0 = this.look.clone(), f0 = cam.fov, f1 = o.fov ?? f0;
    const d = p0.distanceTo(pos), mid = p0.clone().lerp(pos, 0.5), lm = l0.clone().lerp(lookAt, 0.5);
    const ctrl = mid.clone().add(mid.clone().sub(lm).normalize().multiplyScalar(d * 0.12)).add(new THREE.Vector3(0, d * 0.05, 0));
    this.flying = true;
    return new Promise((resolve) => {
      // t0 is set by the first frame that draws the flight, so it starts from rest wherever the click landed.
      this.flight = { t0: -1, ms, p0, l0, f0, f1, ctrl, pos: pos.clone(), lookAt: lookAt.clone(), at: o.at, fired: false, done: resolve };
      this.invalidate();
    });
  }

  /** Called once per rendered frame, before drawing. Moves the camera along the current flight, if there is one. */
  update(now: number): void {
    const f = this.flight;
    if (!f) return;
    if (f.t0 < 0) f.t0 = now;
    const cam = this.camera;
    const x = Math.min(1, (now - f.t0) / f.ms), t = EASE(x), tl = EASE(Math.min(1, x * 1.15)), u = 1 - t;
    cam.position.set(
      u * u * f.p0.x + 2 * u * t * f.ctrl.x + t * t * f.pos.x,
      u * u * f.p0.y + 2 * u * t * f.ctrl.y + t * t * f.pos.y,
      u * u * f.p0.z + 2 * u * t * f.ctrl.z + t * t * f.pos.z,
    );
    this.look.lerpVectors(f.l0, f.lookAt, tl);
    if (f.f1 !== f.f0) {
      cam.fov = f.f0 + (f.f1 - f.f0) * t;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.look);
    if (!f.fired && f.at && x >= f.at[0]) {
      f.fired = true;
      f.at[1]();
    }
    if (x < 1) {
      this.invalidate(); // ask for the next frame
    } else {
      this.flight = null;
      this.flying = false;
      f.done();
    }
  }
}
