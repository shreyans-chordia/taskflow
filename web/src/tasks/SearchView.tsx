import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { tasksApi } from '../api/endpoints';
import type { Task, TaskQuery } from '../api/types';
import { Ring } from '../components/Ring';
import { deadlineParts, rankLevels } from './format';
import { TaskRow } from './TaskList';
import { useTaskActions, useTaskData } from './useTaskActions';

export type SearchStatus = 'all' | 'open' | 'done';
export interface SearchFilters {
  q: string;
  category?: string;
  priority?: string;
  status: SearchStatus;
}
export const DEFAULT_FILTERS: SearchFilters = { q: '', status: 'open' };

const STATUSES: Array<[SearchStatus, string]> = [
  ['all', 'Any'],
  ['open', 'Incomplete'],
  ['done', 'Complete'],
];
/** Typing waits this long before asking the server, so a word is one request, not one per letter. */
const DEBOUNCE_MS = 250;

/** Open tasks first, then by deadline (none last), then by title. */
const order = (a: Task, b: Task) =>
  Number(a.done) - Number(b.done) || (deadlineParts(a).date || '9999').localeCompare(deadlineParts(b).date || '9999') || a.title.localeCompare(b.title);

/**
 * The search key, opened: a keyword and filters, combined with AND, run on the server (GET /api/tasks).
 * SF-1 keyword in title or description, SF-2 category, SF-3 priority, SF-4 status, SF-5 all at once,
 * SF-6 "no matching tasks".
 */
export function SearchView({ titleId, filters, onChange, onOpen, autoFocus }: {
  titleId: string;
  filters: SearchFilters;
  onChange: (f: SearchFilters) => void;
  onOpen: (id: string) => void;
  /** Put the cursor in the search box (when the panel opens on this screen). */
  autoFocus?: boolean;
}) {
  const { priorities, categories } = useTaskData();
  const act = useTaskActions();
  const [text, setText] = useState(filters.q);
  const [error, setError] = useState('');
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) box.current?.focus();
  }, [autoFocus]);

  // The keyword reaches the filters (and the server) once typing pauses.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });
  useEffect(() => {
    if (text === latest.current.filters.q) return;
    const t = window.setTimeout(() => latest.current.onChange({ ...latest.current.filters, q: text }), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [text]);

  const levels = rankLevels(priorities.data ?? []);
  const level = new Map(levels.map((l) => [l.id, l]));
  const cats = categories.data ?? [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  // A filter on a category or level that has since been deleted no longer applies.
  const category = filters.category && (!categories.data || catName.has(filters.category)) ? filters.category : undefined;
  const priority = filters.priority && (!priorities.data || level.has(filters.priority)) ? filters.priority : undefined;

  const query: TaskQuery = { status: filters.status, ...(filters.q.trim() ? { q: filters.q.trim() } : {}), ...(category ? { category } : {}), ...(priority ? { priority } : {}) };
  // Under ['tasks', …] so every task change (tick, edit, delete anywhere) refreshes the results too.
  const results = useQuery({ queryKey: ['tasks', 'search', query], queryFn: () => tasksApi.list(query), placeholderData: keepPreviousData });
  const found = results.data ? [...results.data].sort(order) : [];
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, q: text, ...patch });
  const narrowed = !!(filters.q.trim() || category || priority || filters.status !== 'all');

  return (
    <>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Search key</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            Search &amp; filter
          </h1>
        </div>
      </div>

      <form className="sf" role="search" aria-label="Search tasks" onSubmit={(e) => (e.preventDefault(), set({ q: text }))}>
        <div className="field">
          <label className="label" htmlFor={`${titleId}-q`}>
            Search
          </label>
          <div className="field-input">
            <input ref={box} id={`${titleId}-q`} type="search" value={text} maxLength={100} onChange={(e) => setText(e.target.value)} placeholder="Keyword in title or description" autoComplete="off" />
          </div>
        </div>

        <div className="sf-group" role="group" aria-labelledby={`${titleId}-cat`}>
          <span id={`${titleId}-cat`} className="label">
            Category
          </span>
          <div className="tv-chips">
            <button type="button" className="tv-chip" aria-pressed={!category} onClick={() => set({ category: undefined })}>
              Any
            </button>
            {cats.map((c) => (
              <button key={c.id} type="button" className="tv-chip" aria-pressed={category === c.id} onClick={() => set({ category: c.id })}>
                <i style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="sf-pair">
          <div className="sf-group" role="group" aria-labelledby={`${titleId}-pr`}>
            <span id={`${titleId}-pr`} className="label">
              Priority
            </span>
            <div className="tv-chips">
              <button type="button" className="tv-chip" aria-pressed={!priority} onClick={() => set({ priority: undefined })}>
                Any
              </button>
              {levels.map((l) => (
                <button key={l.id} type="button" className="tv-chip" aria-pressed={priority === l.id} onClick={() => set({ priority: l.id })}>
                  <Ring filled={l.filled} segments={levels.length} color={l.color} size={16} />
                  {l.name}
                </button>
              ))}
            </div>
          </div>
          <div className="sf-group" role="group" aria-labelledby={`${titleId}-st`}>
            <span id={`${titleId}-st`} className="label">
              Status
            </span>
            <div className="tv-chips">
              {STATUSES.map(([s, name]) => (
                <button key={s} type="button" className="tv-chip" aria-pressed={filters.status === s} onClick={() => set({ status: s })}>
                  {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </form>

      <section className="sf-results" aria-labelledby={`${titleId}-res`} aria-busy={results.isFetching}>
        <div className="sf-count">
          <span id={`${titleId}-res`} className="label" role="status">
            {results.isPending ? 'Searching…' : results.isError ? 'Search failed' : `${found.length} match${found.length === 1 ? '' : 'es'}`}
          </span>
          {narrowed && (
            <button type="button" className="link" onClick={() => (setText(''), onChange({ q: '', status: 'all' }))}>
              Clear filters
            </button>
          )}
        </div>
        {results.isError ? (
          <p className="wb-note" role="alert">
            Could not search your tasks. {results.error instanceof ApiError ? results.error.message : 'Try again.'}
          </p>
        ) : results.isPending ? null : found.length === 0 ? (
          <p className="sf-none">No matching tasks. Try another keyword or loosen a filter.</p>
        ) : (
          <ul className="wb-list" aria-label="Matching tasks">
            {found.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                level={level.get(t.priorityId)}
                levels={levels.length}
                categories={t.categoryIds.map((c) => catName.get(c) ?? '').filter(Boolean)}
                onOpen={onOpen}
                onToggle={(done) => act.setDone.mutateAsync({ id: t.id, done }).catch(() => setError('Could not update the task. Try again.'))}
              />
            ))}
          </ul>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
