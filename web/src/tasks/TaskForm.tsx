import { useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { Ring } from '../components/Ring';
import { deadlineParts, deadlinePayload, dueSentence, isOverdue, rankLevels } from './format';
import { DateButton, TimeButton } from './DeadlinePickers';
import { PaperNote } from './PaperNote';
import { QuickAdd } from './QuickAdd';
import { useTaskActions, useTaskData } from './useTaskActions';

type Field = 'title' | 'description' | 'categoryIds' | 'priorityId' | 'deadline';
const MAX_CATEGORIES = 10;

/**
 * Add a task, or edit one (TASK-1 create, TASK-6 edit; DL-1 deadline with an optional time; CAT-2 several
 * categories, CAT-3 none; PR-1 one priority level). New categories and levels can be made right here (CAT-1, PR-3).
 */
export function TaskForm({ id, titleId, categoryId, date, onSaved, onCancel }: {
  id?: string;
  titleId: string;
  /** Pre-selected category for a new task (opened from a tray). */
  categoryId?: string;
  /** Pre-filled deadline day for a new task (opened from a calendar day). */
  date?: string;
  /** After saving: the task's id, and whether it was new. */
  onSaved: (taskId: string, created: boolean, title: string) => void;
  onCancel: () => void;
}) {
  const { tasks, priorities, categories } = useTaskData();
  const act = useTaskActions();
  const existing = id ? tasks.data?.find((t) => t.id === id) : undefined;
  const levels = rankLevels(priorities.data ?? []);
  const cats = [...(categories.data ?? [])].sort((a, b) => a.order - b.order);

  const [draft, setDraft] = useState(() => {
    const dl = existing ? deadlineParts(existing) : { date: date ?? '', time: '' };
    return {
      title: existing?.title ?? '',
      description: existing?.description ?? '',
      categoryIds: existing?.categoryIds ?? (categoryId ? [categoryId] : []),
      priorityId: existing?.priorityId ?? '',
      date: dl.date,
      time: dl.time,
    };
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');
  const [adding, setAdding] = useState<'category' | 'priority' | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  // An empty choice means the account's default level (the one marked as default, or the middle one).
  const defaultLevel = levels.find((l) => l.isDefault) ?? levels[Math.floor((levels.length - 1) / 2)];
  const priorityId = draft.priorityId || defaultLevel?.id || '';
  const level = levels.find((l) => l.id === priorityId);
  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved('');
    const field: Field = k === 'date' || k === 'time' ? 'deadline' : (k as Field);
    if (errors[field]) setErrors(({ [field]: _drop, ...rest }) => rest);
  };
  const toggleCat = (cid: string) =>
    set('categoryIds', draft.categoryIds.includes(cid) ? draft.categoryIds.filter((c) => c !== cid) : [...draft.categoryIds, cid].slice(0, MAX_CATEGORIES));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setErrors({ title: 'Give the task a title.' });
      titleRef.current?.focus();
      return;
    }
    setErrors({});
    setFormError('');
    const body = {
      title,
      description: draft.description.trim(),
      categoryIds: draft.categoryIds,
      ...(priorityId ? { priorityId } : {}),
      ...deadlinePayload(draft.date, draft.time),
    };
    try {
      if (existing) {
        const t = await act.update.mutateAsync({ id: existing.id, patch: body });
        onSaved(t.id, false, t.title);
      } else {
        const t = await act.create.mutateAsync(body);
        // Stay on a fresh form so the next task can go straight in, as on the prototype.
        setDraft({ title: '', description: '', categoryIds: draft.categoryIds, priorityId: draft.priorityId, date: date ?? '', time: '' }); // from the calendar: stay on that day
        setSaved(`Pinned “${t.title}” to your corkboard. Add another, or go back to the desk.`);
        titleRef.current?.focus();
        onSaved(t.id, true, t.title);
      }
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields as Partial<Record<Field, string>>);
      else setFormError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    }
  }

  const preview = {
    title: draft.title.trim() || 'Untitled task',
    line: [cats.filter((c) => draft.categoryIds.includes(c.id)).map((c) => c.name).join(' · ') || 'No category', dueSentence({ ...deadlinePayload(draft.date, draft.time), done: false })].join(' · '),
  };
  const busy = act.create.isPending || act.update.isPending;
  const n = Object.keys(errors).length;

  return (
    <div className="tv-split">
      <div className="tv-note">
        <PaperNote
          title={preview.title}
          line={preview.line}
          level={level}
          levels={levels.length}
          overdue={isOverdue({ ...deadlinePayload(draft.date, draft.time), done: existing?.done ?? false })}
          done={existing?.done}
          subtasks={existing && { done: existing.subtasks.filter((s) => s.done).length, total: existing.subtasks.length }}
        />
        <div className="tv-livepill" aria-hidden="true">Live preview</div>
      </div>
      <div className="tv-main">
        <div className="eyebrow">{existing ? 'Edit task' : 'Add task'}</div>
        <h1 id={titleId} className="title tv-title" tabIndex={-1}>
          {existing ? existing.title : 'New task'}
        </h1>
        {saved && <p className="tv-ok" role="status">{saved}</p>}
        {(n > 0 || formError) && <div className="auth-summary" role="alert">{formError || (n === 1 ? 'One thing needs a look.' : 'Some things need a look.')}</div>}

        <form className="tv-form" onSubmit={submit} noValidate aria-busy={busy}>
          <div className={`field${errors.title ? ' bad' : ''}`}>
            <label className="label" htmlFor={`${uid}-t`}>Title</label>
            <div className="field-input">
              <input ref={titleRef} id={`${uid}-t`} value={draft.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Renew passport" autoComplete="off"
                autoFocus={!existing} aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? `${uid}-te` : undefined} />
            </div>
            {errors.title && <span className="field-error" id={`${uid}-te`}>{errors.title}</span>}
          </div>

          <div className={`field${errors.description ? ' bad' : ''}`}>
            <label className="label" htmlFor={`${uid}-d`}>Description · optional</label>
            <textarea id={`${uid}-d`} className="tv-textarea" rows={3} maxLength={2000} value={draft.description} onChange={(e) => set('description', e.target.value)}
              aria-invalid={errors.description ? true : undefined} />
            {errors.description && <span className="field-error">{errors.description}</span>}
          </div>

          <div className="field">
            <span className="label" id={`${uid}-cl`}>Categories · pick any</span>
            <div className="tv-chips" role="group" aria-labelledby={`${uid}-cl`}>
              {cats.map((c) => (
                <button key={c.id} type="button" className="tv-chip" aria-pressed={draft.categoryIds.includes(c.id)} onClick={() => toggleCat(c.id)}>
                  <i style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
              <button type="button" className="tv-chip tv-new" aria-expanded={adding === 'category'} onClick={() => setAdding(adding === 'category' ? null : 'category')}>
                + New category
              </button>
            </div>
            {adding === 'category' && (
              <QuickAdd kind="category" existing={cats} onCancel={() => setAdding(null)}
                onAdded={(newId) => { setAdding(null); toggleCat(newId); }}
                create={(b) => act.createCategory.mutateAsync(b).then((c) => c.id)} />
            )}
            {errors.categoryIds && <span className="field-error">{errors.categoryIds}</span>}
          </div>

          <div className="field">
            <span className="label" id={`${uid}-pl`}>Priority</span>
            <div className="tv-levels" role="radiogroup" aria-labelledby={`${uid}-pl`}>
              {levels.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={priorityId === l.id} className="tv-level" style={{ '--pc': l.color } as CSSProperties} onClick={() => set('priorityId', l.id)}>
                  <Ring filled={l.filled} segments={levels.length} color={l.color} size={18} />
                  {l.name}
                </button>
              ))}
              <button type="button" className="tv-level tv-new" aria-expanded={adding === 'priority'} onClick={() => setAdding(adding === 'priority' ? null : 'priority')}>
                + New level
              </button>
            </div>
            {adding === 'priority' && (
              <QuickAdd kind="priority" existing={levels} onCancel={() => setAdding(null)}
                onAdded={(newId) => { setAdding(null); set('priorityId', newId); }}
                create={(b) => act.createPriority.mutateAsync(b).then((p) => p.id)} />
            )}
            {errors.priorityId && <span className="field-error">{errors.priorityId}</span>}
          </div>

          <div className="tv-two">
            <div className={`field${errors.deadline ? ' bad' : ''}`}>
              <label className="label" id={`${uid}-dll`} htmlFor={`${uid}-dl`}>Deadline · optional</label>
              <DateButton id={`${uid}-dl`} labelId={`${uid}-dll`} value={draft.date} onChange={(d) => { set('date', d); if (!d) set('time', ''); }} />
            </div>
            <div className="field">
              <label className="label" id={`${uid}-tml`} htmlFor={`${uid}-tm`}>Time · optional</label>
              <TimeButton id={`${uid}-tm`} labelId={`${uid}-tml`} value={draft.time} disabled={!draft.date} onChange={(t) => set('time', t)} />
            </div>
          </div>
          {errors.deadline && <span className="field-error">{errors.deadline}</span>}
          {draft.date && (
            <button type="button" className="link tv-clear" onClick={() => { set('date', ''); set('time', ''); }}>
              Remove the deadline
            </button>
          )}

          <div className="tv-foot">
            <button type="submit" className="btn btn-primary tv-grow" disabled={busy}>
              {existing ? 'Save changes' : 'Pin to corkboard'}
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              {saved ? 'Done' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
