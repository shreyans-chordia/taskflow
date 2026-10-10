import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { categoriesApi, prioritiesApi, tasksApi } from '../api/endpoints';
import type { Priority, Task } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { Logo, Ring } from '../components/Ring';
import './workbench.css';

/**
 * A plain task list on the real API. It proves the whole path (React → API → MongoDB) works end to end
 * and is what the 3D desk's corkboard will sit on top of in phase 2.
 */
export function Workbench({ onToggleTheme }: { onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });
  const priorities = useQuery({ queryKey: ['priorities'], queryFn: prioritiesApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const [title, setTitle] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [error, setError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const create = useMutation({ mutationFn: tasksApi.create, onSuccess: invalidate });
  const update = useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => tasksApi.update(id, { done }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: tasksApi.remove, onSuccess: invalidate });

  const levels = priorities.data ?? [];
  const byId = new Map(levels.map((p) => [p.id, p]));
  const catName = new Map((categories.data ?? []).map((c) => [c.id, c.name]));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Give the task a title.');
      return;
    }
    setError('');
    try {
      await create.mutateAsync({ title: title.trim(), ...(priorityId ? { priorityId } : {}) });
      setTitle('');
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : 'Could not save the task.');
    }
  }

  return (
    <div className="wb">
      <header className="wb-bar">
        <div className="wb-badge glass">
          <Logo size={32} />
          <b>TaskFlow</b>
        </div>
        <div className="wb-account glass">
          <span>
            Signed in as <strong>{user?.name}</strong>
          </span>
          <button type="button" className="btn btn-ghost" onClick={onToggleTheme}>
            Lamp
          </button>
          <button type="button" className="btn" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="wb-card glass" aria-labelledby="wb-title">
        <div className="eyebrow">Corkboard</div>
        <h1 id="wb-title" className="title">Your tasks</h1>
        <form className="wb-add" onSubmit={add} noValidate>
          <div className="field" style={{ flex: 1 }}>
            <label className="label" htmlFor="wb-new">New task</label>
            <div className="field-input">
              <input id="wb-new" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Submit Lab 7 record" aria-invalid={error ? true : undefined} aria-describedby={error ? 'wb-err' : undefined} />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="wb-pr">Priority</label>
            <select id="wb-pr" className="wb-select" value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
              <option value="">Default</option>
              {levels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Pin it
          </button>
        </form>
        {error && <p className="field-error" id="wb-err" role="alert">{error}</p>}

        {tasks.isPending ? (
          <p className="wb-note">Loading your tasks…</p>
        ) : tasks.isError ? (
          <p className="wb-note" role="alert">Could not load your tasks. {tasks.error instanceof ApiError ? tasks.error.message : ''}</p>
        ) : tasks.data.length === 0 ? (
          <p className="wb-empty">Nothing pinned yet. Add your first task above.</p>
        ) : (
          <ul className="wb-list" aria-label="Tasks">
            {tasks.data.map((t) => (
              <TaskRow key={t.id} task={t} level={byId.get(t.priorityId)} levels={levels.length} categories={t.categoryIds.map((c) => catName.get(c) ?? '').filter(Boolean)}
                onToggle={(done) => update.mutate({ id: t.id, done })} onDelete={() => remove.mutate(t.id)} />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TaskRow({ task, level, levels, categories, onToggle, onDelete }: { task: Task; level?: Priority; levels: number; categories: string[]; onToggle: (done: boolean) => void; onDelete: () => void }) {
  return (
    <li className={`wb-row${task.done ? ' done' : ''}`}>
      <input type="checkbox" checked={task.done} onChange={(e) => onToggle(e.target.checked)} aria-label={`Mark ${task.title} ${task.done ? 'not done' : 'done'}`} />
      {level && (
        <span className="wb-pill" style={{ ['--pc' as string]: level.color }}>
          <Ring filled={levels - level.order} segments={levels} color={level.color} size={16} />
          {level.name}
        </span>
      )}
      <span className="wb-text">
        <span className="wb-title">{task.title}</span>
        {categories.length > 0 && <span className="wb-meta">{categories.join(' · ')}</span>}
      </span>
      <button type="button" className="btn btn-ghost wb-del" onClick={onDelete} aria-label={`Delete ${task.title}`}>
        Delete
      </button>
    </li>
  );
}
