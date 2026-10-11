import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import type { V3 } from './three/kit';

/** Something on the desk you can hover and click. */
export interface Target {
  key: string;
  label: string;
  sub?: string;
  /** The point the camera looks at when it flies in. */
  focus?: V3;
  /** Where the camera flies to. Without one the click acts in place (the lamp). */
  view?: V3;
  /** Which way the object rises on hover; 'none' for things that would cover others. */
  lift: 'y' | 'z' | 'none';
}

export interface DeskApi {
  /** False while a panel is open or the camera is flying: the room ignores the pointer then. */
  interactive: RefObject<boolean>;
  hovered: RefObject<{ target: Target; obj: THREE.Object3D } | null>;
  setHovered(h: { target: Target; obj: THREE.Object3D } | null): void;
  activate(target: Target): void;
  /** Moves the HTML hover label to a point on the canvas, in CSS pixels. */
  placeTag(x: number, y: number): void;
  reducedMotion: boolean;
}

export const DeskContext = createContext<DeskApi | null>(null);

export function useDesk(): DeskApi {
  const v = useContext(DeskContext);
  if (!v) throw new Error('useDesk must be used inside the desk scene');
  return v;
}

const LIFT = 0.014;

/** Wraps an object so it lifts on hover and opens on click, like a thing you would pick up. */
export function Hit({ target, children }: { target: Target; children: ReactNode }) {
  const desk = useDesk();
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const invalidate = useThree((s) => s.invalidate);

  // Glide up and settle back with exponential easing, independent of frame rate.
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || target.lift === 'none') return;
    const goal = desk.hovered.current?.target.key === target.key ? 1 : 0;
    if (t.current === goal) return;
    const k = desk.reducedMotion ? 1 : 1 - Math.exp(-Math.min(0.05, dt) * 1000 / 70);
    let next = t.current + (goal - t.current) * k;
    if (Math.abs(goal - next) < 0.002) next = goal;
    t.current = next;
    g.position.set(0, 0, 0);
    g.position[target.lift] = LIFT * next;
    if (next !== goal) invalidate();
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.nativeEvent.pointerType !== 'mouse' || !desk.interactive.current) return;
    desk.setHovered({ target, obj: ref.current! });
    invalidate();
  };
  const out = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (desk.hovered.current?.target.key === target.key) desk.setHovered(null);
    invalidate();
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    // A drag (looking around on a phone) is not a click.
    if (e.delta > 6 || !desk.interactive.current) return;
    desk.setHovered(null);
    desk.activate(target);
  };

  return (
    <group ref={ref} name={target.key} onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  );
}

/** Keeps the HTML hover label pinned above whatever is hovered, every rendered frame. */
export function TagTracker() {
  const desk = useDesk();
  const box = useRef(new THREE.Box3());
  const p = useRef(new THREE.Vector3());
  useFrame(({ camera, size }) => {
    const h = desk.hovered.current;
    if (!h) return;
    const b = box.current.setFromObject(h.obj);
    p.current.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2).project(camera);
    desk.placeTag(Math.max(80, Math.min(size.width - 80, ((p.current.x + 1) / 2) * size.width)), Math.max(70, ((1 - p.current.y) / 2) * size.height));
  });
  return null;
}
