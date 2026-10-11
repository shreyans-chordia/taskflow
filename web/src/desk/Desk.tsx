import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as THREE from 'three';
import { CameraController } from './camera';
import { DeskContext, TagTracker, type DeskApi, type Target } from './interaction';
import type { DeskData } from './model';
import { Corkboard, Keys, Lamp, Notebook, PomodoroClock, RAIL_TARGETS, Trays, WallCalendar } from './objects';
import { Kit, color, disposeTree } from './three/kit';
import { buildRoom } from './three/room';
import './desk.css';

export interface DeskProps {
  data: DeskData;
  /** Dark mode: the lamp is on. */
  night: boolean;
  onToggleLamp(): void;
  /** Called when the camera has nearly arrived at a clicked object: show its panel. */
  onOpen(target: Target): void;
  /** True while a panel is open; when it turns false the camera flies home. */
  panelOpen: boolean;
}

const RAIL: Array<[key: keyof typeof RAIL_TARGETS | 'lamp', label: string]> = [
  ['board', 'Tasks'], ['add', 'Add task'], ['manage', 'Edit / Delete'], ['search', 'Search'], ['calendar', 'Calendar'],
  ['categories', 'Categories'], ['notebook', 'Weekly review'], ['timer', 'Pomodoro'], ['lamp', 'Lamp'],
];

/** Every font painted onto the canvases; the desk waits briefly for them so the first frame is not in fallback fonts. */
const CANVAS_FONTS = ['40px "Patrick Hand"', '700 40px Caveat', '600 20px Inter', '700 40px "JetBrains Mono"', '600 40px "Barlow Condensed"'];

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** The 3D desk: the app's home screen. Click any object (or use the rail) to open what it stands for. */
export default function Desk({ data, night, onToggleLamp, onOpen, panelOpen }: DeskProps) {
  const reducedMotion = useReducedMotion();
  const [fontsReady, setFontsReady] = useState(false);
  const [ready, setReady] = useState(false);
  const tagRef = useRef<HoverTagHandle>(null);
  const controller = useRef<CameraController | null>(null);
  const interactive = useRef(false);
  const hovered = useRef<{ target: Target; obj: THREE.Object3D } | null>(null);
  const busy = useRef(false);
  const wasOpen = useRef(panelOpen);
  const drag = useRef<{ x: number; pan: number; moved: boolean } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    const loads = Promise.all(CANVAS_FONTS.map((f) => document.fonts?.load(f).catch(() => undefined)));
    void Promise.race([loads, new Promise((r) => setTimeout(r, 2500))]).then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const setHovered = useCallback<DeskApi['setHovered']>((h) => {
    hovered.current = h;
    tagRef.current?.show(h?.target ?? null);
    document.body.style.cursor = h ? 'pointer' : '';
  }, []);
  useEffect(() => () => {
    document.body.style.cursor = '';
  }, []);

  const activate = useCallback(
    async (target: Target) => {
      if (target.key === 'lamp') return onToggleLamp();
      const cam = controller.current;
      if (busy.current || !cam) return;
      busy.current = true;
      interactive.current = false;
      setHovered(null);
      if (target.view && target.focus) await cam.flyToObject(target.view, target.focus, () => onOpen(target));
      else onOpen(target);
      busy.current = false;
    },
    [onOpen, onToggleLamp, setHovered],
  );

  // Panel closed: drift back home, then the room listens to the pointer again.
  useEffect(() => {
    if (wasOpen.current && !panelOpen) {
      const cam = controller.current;
      void (async () => {
        if (cam?.atObject) await new Promise((r) => setTimeout(r, reducedMotion ? 0 : 90)).then(() => cam.flyHome());
        interactive.current = true;
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
        returnFocus.current = null;
      })();
    }
    if (panelOpen) interactive.current = false;
    wasOpen.current = panelOpen;
  }, [panelOpen, reducedMotion]);

  const api = useMemo<DeskApi>(
    () => ({
      interactive,
      hovered,
      setHovered,
      activate: (t) => void activate(t),
      placeTag: (x, y) => tagRef.current?.place(x, y),
      reducedMotion,
    }),
    [activate, setHovered, reducedMotion],
  );

  const onController = useCallback((c: CameraController | null) => {
    controller.current = c;
    return () => {
      controller.current = null;
    };
  }, []);

  const onEntered = useCallback(() => {
    setReady(true);
    interactive.current = !panelOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phones: drag sideways to look along the desk.
  const pointerDown = (e: ReactPointerEvent) => {
    drag.current = { x: e.clientX, pan: controller.current?.panX ?? 0, moved: false };
  };
  const pointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current, cam = controller.current;
    if (!d || !cam?.canPan) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) cam.pan(d.pan - (dx / e.currentTarget.clientWidth) * 1.4);
  };
  const pointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="desk" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      {fontsReady && (
        <Canvas
          className="desk-canvas"
          frameloop="demand"
          shadows={{ type: THREE.PCFShadowMap }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          camera={{ fov: 47, near: 0.05, far: 40, position: [0, 1.36, 2.85] }}
          onCreated={({ gl }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping;
          }}
          onPointerMissed={() => setHovered(null)}
          aria-hidden="true"
        >
          <DeskContext.Provider value={api}>
            <Scene data={data} night={night} reducedMotion={reducedMotion} onController={onController} onEntered={onEntered} />
            <TagTracker />
          </DeskContext.Provider>
        </Canvas>
      )}

      <HoverTag ref={tagRef} hidden={panelOpen} />

      <nav className="desk-rail" aria-label="Desk shortcuts" hidden={!ready}>
        <div className="desk-rail-inner glass">
          {RAIL.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-label={key === 'lamp' ? `Lamp: switch to ${night ? 'light' : 'dark'} mode` : undefined}
              disabled={panelOpen}
              onClick={(e) => {
                returnFocus.current = e.currentTarget;
                if (key === 'lamp') onToggleLamp();
                else void activate(RAIL_TARGETS[key]!);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <div className={`desk-loading${ready ? ' gone' : ''}`} role="status" aria-live="polite">
        <span>Setting up your desk…</span>
      </div>
    </div>
  );
}

interface HoverTagHandle {
  show(t: Target | null): void;
  place(x: number, y: number): void;
}

/** The label above whatever the mouse is over. Its own state, so hovering does not re-render the 3D scene. */
function HoverTag({ ref, hidden }: { ref: React.Ref<HoverTagHandle>; hidden: boolean }) {
  const [tag, setTag] = useState<Target | null>(null);
  const el = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    show: setTag,
    place: (x, y) => {
      if (!el.current) return;
      el.current.style.left = `${x}px`;
      el.current.style.top = `${y}px`;
    },
  }), []);
  return (
    <div ref={el} className="desk-tag glass" hidden={!tag || hidden}>
      {tag?.label}
      {tag?.sub && <small>{tag.sub}</small>}
    </div>
  );
}

/** Everything inside the canvas: the room, the interactive objects, the camera and the theme. */
function Scene({ data, night, reducedMotion, onController, onEntered }: {
  data: DeskData;
  night: boolean;
  reducedMotion: boolean;
  onController(c: CameraController | null): (() => void) | void;
  onEntered(): void;
}) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const [{ kit, room }] = useState(() => {
    const k = new Kit(gl.capabilities.getMaxAnisotropy());
    return { kit: k, room: buildRoom(k) };
  });
  const [cam] = useState(() => new CameraController(camera, invalidate, () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false));

  useEffect(() => onController(cam), [cam, onController]);
  // Development builds only: lets devtools (and screenshot scripts) inspect and move the camera.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __desk?: object }).__desk = { cam, camera, get };
  }, [cam, camera, get]);
  useEffect(() => () => disposeTree(room.root), [room]);

  useEffect(() => cam.resize(size.width / Math.max(1, size.height)), [cam, size]);

  // Theme: dusk with the lamp off, or night with the lamp on.
  useEffect(() => {
    room.setNight(night);
    const s = get();
    s.scene.background = color(night ? '#07080C' : '#120F0D');
    s.gl.toneMappingExposure = night ? 1.12 : 1.05;
    invalidate();
  }, [night, room, get, invalidate]);

  // The wall clock ticks once a second, on the second.
  useEffect(() => {
    let iv = 0;
    const tick = () => {
      room.tickClock();
      invalidate();
    };
    const t = window.setTimeout(() => {
      tick();
      iv = window.setInterval(tick, 1000);
    }, 1000 - new Date().getMilliseconds() + 5);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(iv);
    };
  }, [room, invalidate]);

  // Fonts that arrived late: repaint every canvas once they are in.
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      kit.repaintAll();
      invalidate();
    });
    return () => {
      alive = false;
    };
  }, [kit, invalidate]);

  // Walk into the room once the first frame is drawn.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      onEntered();
      if (!reducedMotion) void cam.enterFrom([0, 0.12, 0.75]);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <primitive object={room.root} dispose={null} />
      <Corkboard kit={kit} data={data} />
      <WallCalendar kit={kit} data={data} />
      <Keys kit={kit} />
      <Lamp kit={kit} on={night} reducedMotion={reducedMotion} />
      <Trays kit={kit} data={data} />
      <Notebook kit={kit} data={data} />
      <PomodoroClock kit={kit} />
    </>
  );
}
