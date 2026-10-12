import { useEffect, useRef, useState } from 'react';
import { monthOf } from './calendar';
import { CalendarView } from './CalendarView';
import { CategoriesView } from './CategoriesView';
import { today } from './format';
import { OrganizeView } from './OrganizeView';
import { DEFAULT_FILTERS, SearchView, type SearchFilters } from './SearchView';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { TaskList } from './TaskList';
import { useTaskData } from './useTaskActions';
import './tasks.css';

export type TaskView =
  | { type: 'list'; categoryId?: string; eyebrow?: string; heading?: string; focusAdd?: boolean; message?: string }
  | { type: 'detail'; id: string }
  | { type: 'form'; id?: string; categoryId?: string; date?: string }
  /** The month ("YYYY-MM") and the selected day; both default to today. */
  | { type: 'calendar'; month?: string; day?: string }
  | { type: 'search'; filters?: SearchFilters }
  | { type: 'organize' }
  /** The category board; no categoryId is "All". */
  | { type: 'categories'; categoryId?: string };

/** The section a stack starts on, for the 2D page's tabs. */
export type TaskSection = 'list' | 'calendar' | 'search' | 'categories';

/**
 * The task screens and the way between them: list, calendar or search → task → edit, with Back retracing the steps.
 * Backing out of the first screen calls `onExit` (the desk closes its panel); without one, Back is hidden there.
 */
export function TaskViews({ titleId, initial, onExit }: { titleId: string; initial: TaskView; onExit?: () => void }) {
  const [stack, setStack] = useState<TaskView[]>([initial]);
  const view = stack[stack.length - 1]!;
  const { tasks } = useTaskData();

  const push = (v: TaskView) => setStack((s) => [...s, v]);
  const replace = (v: TaskView) => setStack((s) => [...s.slice(0, -1), v]);
  const back = () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onExit?.());
  /**
   * After a delete there is nothing to go back to: return to the nearest screen the task was found on (a list, the
   * calendar, search or the organizer), keeping the way back from there.
   */
  const toStart = (message?: string) => {
    const at = stack.findLastIndex((v) => v.type === 'list' || v.type === 'calendar' || v.type === 'search' || v.type === 'categories' || v.type === 'organize');
    if (at < 0) return setStack([{ type: 'list', message }]);
    const home = stack[at]!;
    setStack([...stack.slice(0, at), home.type === 'list' ? { ...home, message } : home]);
  };

  // Each screen change moves focus to its heading, so keyboard and screen-reader users land at the top.
  // A screen updating its own state (a month, a filter) is not a screen change and leaves focus alone.
  const screen = `${stack.length}:${view.type}:${view.type === 'detail' || view.type === 'form' ? (view.id ?? '') : ''}`;
  const shown = useRef(screen);
  // (Compared with the last screen rather than a "first run" flag, which StrictMode's double effects would use up.)
  useEffect(() => {
    if (shown.current === screen) return;
    shown.current = screen;
    const kind = screen.split(':')[1];
    if (kind === 'form' && !screen.split(':')[2]) return; // the title field takes focus instead
    document.getElementById(titleId)?.focus({ preventScroll: true });
    document.getElementById(titleId)?.closest('.panel-card, .wb-card')?.scrollTo?.({ top: 0 });
  }, [screen, titleId]);

  const canGoBack = stack.length > 1 || !!onExit;

  return (
    <div className="tv" data-view={view.type}>
      {canGoBack && view.type !== 'list' && (
        <button type="button" className="link tv-back" onClick={back}>
          ← {stack.length > 1 ? 'Back' : 'Back to the desk'}
        </button>
      )}
      {view.type === 'list' && (
        <TaskList
          key={`${view.categoryId ?? 'all'}`}
          titleId={titleId}
          eyebrow={view.eyebrow}
          heading={view.heading}
          categoryId={view.categoryId}
          focusAdd={view.focusAdd}
          message={view.message}
          onOpen={(id) => push({ type: 'detail', id })}
          onAddFull={() => push({ type: 'form', categoryId: view.categoryId })}
        />
      )}
      {view.type === 'calendar' && (
        <CalendarView
          titleId={titleId}
          month={view.month ?? monthOf(view.day ?? today())}
          day={view.day ?? today()}
          onChange={(v) => replace({ type: 'calendar', ...v })}
          onOpen={(id) => push({ type: 'detail', id })}
          onAdd={(date) => push({ type: 'form', date })}
        />
      )}
      {view.type === 'search' && (
        <SearchView
          titleId={titleId}
          filters={view.filters ?? DEFAULT_FILTERS}
          onChange={(filters) => replace({ type: 'search', filters })}
          onOpen={(id) => push({ type: 'detail', id })}
          autoFocus={stack.length === 1 && !!onExit}
        />
      )}
      {view.type === 'categories' && (
        <CategoriesView
          titleId={titleId}
          categoryId={view.categoryId}
          onPick={(categoryId) => replace({ type: 'categories', categoryId })}
          onOpen={(id) => push({ type: 'detail', id })}
          onManage={() => push({ type: 'organize' })}
        />
      )}
      {view.type === 'organize' && (
        <OrganizeView titleId={titleId} onOpenCategory={(c) => push({ type: 'list', categoryId: c.id, eyebrow: 'Category', heading: c.name })} />
      )}
      {view.type === 'detail' && (
        <TaskDetail key={view.id} id={view.id} titleId={titleId} onEdit={() => push({ type: 'form', id: view.id })} onDeleted={(title) => toStart(`Deleted “${title}”.`)} />
      )}
      {view.type === 'form' &&
        (view.id && tasks.isPending ? (
          <p className="wb-note">Loading the task…</p>
        ) : (
          <TaskForm
            key={view.id ?? 'new'}
            id={view.id}
            titleId={titleId}
            categoryId={view.categoryId}
            date={view.date}
            // Saving an edit returns to the task; a new task keeps the form open for the next one.
            onSaved={(id, created) => (created ? undefined : stack.length > 1 && stack[stack.length - 2]?.type === 'detail' ? back() : replace({ type: 'detail', id }))}
            onCancel={back}
          />
        ))}
    </div>
  );
}
