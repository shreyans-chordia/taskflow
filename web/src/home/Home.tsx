import { useQuery } from '@tanstack/react-query';
import { Component, lazy, Suspense, useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import { AccountMenu } from '../components/AccountMenu';
import type { Target } from '../desk/interaction';
import { toDeskData } from '../desk/model';
import { TaskViews, type TaskView } from '../tasks/TaskViews';
import { PomodoroView } from '../timer/PomodoroView';
import { TimerNotices } from '../timer/TimerNotices';
import { Workbench } from '../workbench/Workbench';
import './home.css';

// three.js is large, so the desk loads in its own chunk; the sign-in screen starts fetching it early.
const loadDesk = () => import('../desk/Desk');
const Desk = lazy(loadDesk);
export const preloadDesk = () => void loadDesk().catch(() => undefined);

/** True when this browser can draw WebGL. Without it the 2D list is shown instead of a broken screen. */
export function canDrawDesk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** The signed-in home: the 3D desk, or the plain task list where 3D is not available. */
export function Home({ night, onToggleTheme }: { night: boolean; onToggleTheme: () => void }) {
  const [webgl] = useState(canDrawDesk);
  const [failed, setFailed] = useState(false);
  if (!webgl || failed) return <Workbench onToggleTheme={onToggleTheme} />;
  return (
    <DeskBoundary onError={() => setFailed(true)}>
      <DeskHome night={night} onToggleTheme={onToggleTheme} />
    </DeskBoundary>
  );
}

function DeskHome({ night, onToggleTheme }: { night: boolean; onToggleTheme: () => void }) {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });
  const priorities = useQuery({ queryKey: ['priorities'], queryFn: prioritiesApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const [open, setOpen] = useState<Target | null>(null);

  const data = useMemo(() => toDeskData(tasks.data ?? [], categories.data ?? [], priorities.data ?? []), [tasks.data, categories.data, priorities.data]);
  const onOpen = useCallback((t: Target) => setOpen(t), []);

  return (
    <div className="home">
      {/* While a panel is open the room behind it is out of reach for keyboard and screen readers. */}
      <div className="home-room" inert={!!open}>
        <Suspense fallback={<div className="home-loading" role="status">Setting up your desk…</div>}>
          <Desk data={data} night={night} onToggleLamp={onToggleTheme} onOpen={onOpen} panelOpen={!!open} />
        </Suspense>
        <header className="home-bar">
          <AccountMenu />
        </header>
      </div>
      {open && <Panel target={open} onClose={() => setOpen(null)} />}
      <TimerNotices />
    </div>
  );
}

/** What each desk object opens. The weekly review and Pomodoro still open the list until they get their own screens. */
function viewFor(target: Target): TaskView {
  const [kind, id] = target.key.split(':');
  if (kind === 'calendar') return { type: 'calendar' };
  if (kind === 'search') return { type: 'search' };
  if (kind === 'notebook') return { type: 'review' };
  if (kind === 'categories') return { type: 'categories' };
  if (kind === 'note' && id) return { type: 'detail', id };
  if (kind === 'add') return { type: 'form' };
  if (kind === 'tray' && id) return { type: 'categories', categoryId: id };
  if (kind === 'manage') return { type: 'list', mode: 'edit' };
  return { type: 'list' };
}

/** The frosted panel an object opens over the desk. Escape, the × or a click outside closes it. */
function Panel({ target, onClose }: { target: Target; onClose: () => void }) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => setClosing(true), []);
  const [initial] = useState(() => viewFor(target));

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(onClose, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
    return () => window.clearTimeout(t);
  }, [closing, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Focus moves into the panel: to the heading, or to the field you came to type in (a new task's title, the search box).
  useEffect(() => {
    if (initial.type !== 'form' && initial.type !== 'search') document.getElementById(titleId)?.focus({ preventScroll: true });
  }, [initial.type, titleId]);

  return (
    <div className={`panel${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel-card glass" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button type="button" className="panel-close" onClick={close} aria-label="Close and go back to the desk">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" />
          </svg>
        </button>
        {target.key === 'timer' ? <PomodoroView titleId={titleId} onExit={close} /> : <TaskViews titleId={titleId} initial={initial} onExit={close} />}
      </div>
    </div>
  );
}

/** If the 3D desk crashes (a lost GPU context, a driver bug), fall back to the list rather than a blank screen. */
class DeskBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.error('The 3D desk failed; showing the task list instead.', err);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
