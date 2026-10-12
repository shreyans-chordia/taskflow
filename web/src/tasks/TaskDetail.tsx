import { useState, type CSSProperties, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { Ring } from '../components/Ring';
import { dueSentence, dueText, isOverdue, rankLevels } from './format';
import { PaperNote } from './PaperNote';
import { useTaskActions, useTaskData } from './useTaskActions';

const MAX_SUBTASKS = 50;

/**
 * One task, opened from its note: everything about it, the done tick, and its checklist
 * (TASK-3 view, TASK-4 complete, SUB-1..SUB-5 checklist).
 */
export function TaskDetail({ id, titleId, onEdit, onDeleted }: { id: string; titleId: string; onEdit: () => void; onDeleted: (title: string) => void }) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const [subTitle, setSubTitle] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  // The tick shows what was clicked until the save settles (the cache update lands a moment later).
  const [pendingDone, setPendingDone] = useState<boolean | null>(null);

  const task = tasks.data?.find((t) => t.id === id);
  if (tasks.isPending) return <p className="wb-note">Loading the task…</p>;
  if (!task) {
    return (
      <>
        <div className="eyebrow">Sticky note</div>
        <h1 id={titleId} className="title" tabIndex={-1}>Not on the board</h1>
        <p className="wb-note">This task was deleted, maybe from another tab.</p>
      </>
    );
  }

  const levels = rankLevels(priorities.data ?? []);
  const level = levels.find((l) => l.id === task.priorityId);
  const cats = (categories.data ?? []).filter((c) => task.categoryIds.includes(c.id));
  const late = isOverdue(task);
  const done = pendingDone ?? task.done;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const fail = (fallback: string) => (err: unknown) => setError(err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : fallback);

  const toggleDone = (value: boolean) => {
    setError('');
    setPendingDone(value);
    act.setDone
      .mutateAsync({ id, done: value })
      .catch(fail('Could not update the task. Try again.'))
      .finally(() => setPendingDone(null));
  };

  async function addSub(e: FormEvent) {
    e.preventDefault();
    const title = subTitle.trim();
    if (!title) return;
    setError('');
    try {
      await act.addSubtask.mutateAsync({ id, title });
      setSubTitle('');
    } catch (err) {
      fail('Could not add the item.')(err);
    }
  }

  async function del() {
    setError('');
    try {
      await act.remove.mutateAsync(id);
      onDeleted(task!.title);
    } catch (err) {
      fail('Could not delete the task.')(err);
    }
  }

  return (
    <div className="tv-split">
      <div className="tv-note">
        <PaperNote
          title={task.title}
          line={[cats.map((c) => c.name).join(' · ') || 'No category', dueSentence(task)].join(' · ')}
          level={level}
          levels={levels.length}
          overdue={late}
          done={done}
          subtasks={{ done: subDone, total: task.subtasks.length }}
        />
      </div>
      <div className="tv-main">
        <div className="eyebrow">Sticky note</div>
        <h1 id={titleId} className="title tv-title" tabIndex={-1}>
          {task.title}
        </h1>

        <div className="tv-facts">
          {level && (
            <span className="tv-pill" style={{ '--pc': level.color } as CSSProperties}>
              <Ring filled={level.filled} segments={levels.length} color={level.color} size={16} />
              {level.name} priority
            </span>
          )}
          {cats.map((c) => (
            <span key={c.id} className="tv-cat">
              <i style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
          <span className={late ? 'tv-late' : 'tv-due'}>{late ? `Overdue · was due ${dueText(task)}` : dueSentence(task)}</span>
        </div>

        {task.description && <p className="tv-desc">{task.description}</p>}

        <label className="tv-done">
          <input type="checkbox" checked={done} onChange={(e) => toggleDone(e.target.checked)} />
          {done ? 'Completed' : 'Mark as complete'}
        </label>

        <section className="tv-check" aria-labelledby={`${titleId}-cl`}>
          <div className="tv-check-head">
            {task.subtasks.length > 0 && <Ring filled={subDone} segments={task.subtasks.length} color="var(--g-ink)" size={22} />}
            <span id={`${titleId}-cl`} className="label">
              Checklist · {task.subtasks.length ? `${subDone} of ${task.subtasks.length} done` : 'no items yet'}
            </span>
          </div>
          {task.subtasks.length > 0 && (
            <ul className="tv-subs">
              {task.subtasks.map((s) => (
                <li key={s.id} className={s.done ? 'done' : undefined}>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={(e) => act.setSubtaskDone.mutateAsync({ id, sub: s.id, done: e.target.checked }).catch(fail('Could not update the item.'))}
                    />
                    <span>{s.title}</span>
                  </label>
                  <button type="button" className="tv-x" aria-label={`Remove ${s.title}`} onClick={() => act.removeSubtask.mutateAsync({ id, sub: s.id }).catch(fail('Could not remove the item.'))}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {task.subtasks.length < MAX_SUBTASKS ? (
            <form className="tv-subadd" onSubmit={addSub}>
              <div className="field">
                <label className="label" htmlFor={`${titleId}-sub`}>New checklist item</label>
                <div className="field-input">
                  <input id={`${titleId}-sub`} value={subTitle} maxLength={120} onChange={(e) => setSubTitle(e.target.value)} placeholder="Add a checklist item" autoComplete="off" />
                </div>
              </div>
              <button type="submit" className="btn" disabled={act.addSubtask.isPending}>
                Add
              </button>
            </form>
          ) : (
            <p className="wb-note">That is the most items one task can hold ({MAX_SUBTASKS}).</p>
          )}
        </section>

        {error && <p className="field-error" role="alert">{error}</p>}

        {confirming ? (
          <div className="tv-confirm" role="alert">
            <strong>
              Delete “{task.title}”{task.subtasks.length ? ` and its ${task.subtasks.length} checklist item${task.subtasks.length > 1 ? 's' : ''}` : ''}?
            </strong>
            <span className="wb-note">This can’t be undone.</span>
            <div className="tv-row">
              <button type="button" className="btn btn-danger" onClick={() => void del()} disabled={act.remove.isPending}>
                Delete task
              </button>
              <button type="button" className="btn" autoFocus onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="tv-row">
            <button type="button" className="btn btn-primary tv-grow" onClick={onEdit}>
              Edit task
            </button>
            <button type="button" className="btn tv-ink" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
