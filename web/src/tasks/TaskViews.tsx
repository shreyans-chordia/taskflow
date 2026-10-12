import { useEffect, useRef, useState } from 'react';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { TaskList } from './TaskList';
import { useTaskData } from './useTaskActions';
import './tasks.css';

export type TaskView =
  | { type: 'list'; categoryId?: string; eyebrow?: string; heading?: string; focusAdd?: boolean; message?: string }
  | { type: 'detail'; id: string }
  | { type: 'form'; id?: string; categoryId?: string; date?: string };

/**
 * The task screens and the way between them: list → task → edit, with Back retracing the steps.
 * Backing out of the first screen calls `onExit` (the desk closes its panel); without one, Back is hidden there.
 */
export function TaskViews({ titleId, initial, onExit }: { titleId: string; initial: TaskView; onExit?: () => void }) {
  const [stack, setStack] = useState<TaskView[]>([initial]);
  const view = stack[stack.length - 1]!;
  const { tasks } = useTaskData();
  const first = useRef(true);

  const push = (v: TaskView) => setStack((s) => [...s, v]);
  const replace = (v: TaskView) => setStack((s) => [...s.slice(0, -1), v]);
  const back = () => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onExit?.());
  /** Back to the list, whatever came before (after a delete there is nothing to go back to). */
  const toList = (message?: string) => {
    const list = stack.find((v) => v.type === 'list');
    setStack([list ? { ...list, message } : { type: 'list', message }]);
  };

  // Each screen change moves focus to its heading, so keyboard and screen-reader users land at the top.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (view.type === 'form' && !view.id) return; // the title field takes focus instead
    document.getElementById(titleId)?.focus({ preventScroll: true });
    document.getElementById(titleId)?.closest('.panel-card, .wb-card')?.scrollTo?.({ top: 0 });
  }, [view, titleId]);

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
      {view.type === 'detail' && (
        <TaskDetail key={view.id} id={view.id} titleId={titleId} onEdit={() => push({ type: 'form', id: view.id })} onDeleted={(title) => toList(`Deleted “${title}”.`)} />
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
