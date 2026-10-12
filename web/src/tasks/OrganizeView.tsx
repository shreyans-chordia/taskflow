import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { Category, Priority } from '../api/types';
import { Ring } from '../components/Ring';
import { PRIORITY_SWATCHES, rankLevels, SWATCHES } from './format';
import { QuickAdd } from './QuickAdd';
import { moved, useOrganizeActions } from './useOrganizeActions';
import { useTaskActions, useTaskData } from './useTaskActions';

/** The organizer's shelf holds six trays: the first six categories. */
export const SHELF = 6;
const MAX_CATEGORIES = 50;
const MAX_LEVELS = 10;

const tasksText = (n: number) => `${n} task${n === 1 ? '' : 's'}`;
const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : fallback);

type Kind = 'category' | 'priority';
type Confirm = { kind: Kind; id: string } | null;

/**
 * Categories & priorities: rename, recolour, reorder, add and delete both (CAT-1 create, CAT-4 delete keeps the
 * tasks, CAT-5 unique names; PR-1 levels, PR-2 the default for new tasks, PR-3 changing levels). The first six
 * categories are the trays on the desk's shelf; the top priority level is the most important.
 */
export function OrganizeView({ titleId, onOpenCategory }: { titleId: string; onOpenCategory: (c: Category) => void }) {
  const { tasks, priorities, categories } = useTaskData();
  const org = useOrganizeActions();
  const act = useTaskActions();
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [adding, setAdding] = useState<Kind | null>(null);
  const focusAfter = useRef<{ id: string; dir: 'up' | 'down' } | { heading: Kind } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const cats = categories.data ?? [];
  const levels = rankLevels(priorities.data ?? []);
  const all = tasks.data ?? [];
  const catCount = (id: string) => all.filter((t) => t.categoryIds.includes(id)).length;
  const levelCount = (id: string) => all.filter((t) => t.priorityId === id).length;

  // Moving a row re-renders the list: keep focus on the arrow that was pressed (or the other one at the ends),
  // and after a delete put it on the section's heading.
  useLayoutEffect(() => {
    const f = focusAfter.current;
    if (!f || !root.current) return;
    focusAfter.current = null;
    if ('heading' in f) return root.current.querySelector<HTMLElement>(`#${CSS.escape(`${titleId}-${f.heading}`)}`)?.focus();
    const at = (dir: string) => root.current!.querySelector<HTMLButtonElement>(`[data-move="${f.id}:${dir}"]`);
    const btn = at(f.dir);
    (btn && !btn.disabled ? btn : at(f.dir === 'up' ? 'down' : 'up'))?.focus();
  });

  const report = (id: string, err?: unknown, fallback = 'Could not save that. Try again.') =>
    setErrors((e) => {
      const next = { ...e };
      if (err === undefined) delete next[id];
      else next[id] = errorText(err, fallback);
      return next;
    });
  const done = (text: string) => {
    setMessage(text);
    setConfirm(null);
  };

  async function rename(kind: Kind, id: string, name: string) {
    report(id);
    try {
      if (kind === 'category') await org.updateCategory.mutateAsync({ id, patch: { name } });
      else await org.updatePriority.mutateAsync({ id, patch: { name } });
    } catch (err) {
      report(id, err);
      throw err;
    }
  }
  function recolour(kind: Kind, id: string, color: string) {
    report(id);
    const call = kind === 'category' ? org.updateCategory.mutateAsync({ id, patch: { color } }) : org.updatePriority.mutateAsync({ id, patch: { color } });
    call.catch((err) => report(id, err));
  }
  function move(kind: Kind, index: number, step: -1 | 1) {
    const list = kind === 'category' ? cats : levels;
    const id = list[index]!.id;
    focusAfter.current = { id, dir: step < 0 ? 'up' : 'down' };
    const ids = moved(list.map((x) => x.id), index, step);
    const call = kind === 'category' ? org.reorderCategories.mutateAsync(ids) : org.reorderPriorities.mutateAsync(ids);
    call.catch((err) => report(id, err, 'Could not move it. Try again.'));
  }
  async function remove(kind: Kind, id: string) {
    report(id);
    try {
      if (kind === 'category') {
        const name = cats.find((c) => c.id === id)?.name ?? '';
        const r = await org.removeCategory.mutateAsync(id);
        done(`Deleted “${name}”.${r.removedFromTasks ? ` ${r.removedFromTasks === 1 ? 'Its task keeps' : `Its ${r.removedFromTasks} tasks keep`} going without it.` : ''}`);
      } else {
        const name = levels.find((l) => l.id === id)?.name ?? '';
        const r = await org.removePriority.mutateAsync(id);
        done(`Deleted “${name}”.${r.movedTasks ? ` ${tasksText(r.movedTasks)} moved to ${r.movedTo.name}.` : ''}`);
      }
      focusAfter.current = { heading: kind };
    } catch (err) {
      report(id, err, 'Could not delete it. Try again.');
    }
  }
  function makeDefault(id: string) {
    report(id);
    org.updatePriority.mutateAsync({ id, patch: { isDefault: true } }).then(
      (p) => setMessage(`New tasks now start as ${p.name}.`),
      (err) => report(id, err),
    );
  }

  const confirmRow = (kind: Kind, item: { id: string; name: string }, text: string) =>
    confirm?.kind === kind && confirm.id === item.id ? (
      <li className="org-confirm" role="alert">
        <span>
          <strong>Delete “{item.name}”?</strong> {text}
        </span>
        <span className="tv-row">
          <button type="button" className="btn btn-danger" onClick={() => void remove(kind, item.id)}>
            Delete
          </button>
          <button type="button" className="btn" autoFocus onClick={() => setConfirm(null)}>
            Keep
          </button>
        </span>
      </li>
    ) : null;

  if (categories.isPending || priorities.isPending) return <p className="wb-note">Loading your categories…</p>;

  return (
    <div className="org" ref={root}>
      <div className="tv-head">
        <div>
          <div className="eyebrow">Organizer</div>
          <h1 id={titleId} className="title" tabIndex={-1}>
            Categories &amp; priorities
          </h1>
        </div>
      </div>
      {message && (
        <p className="tv-ok" role="status">
          {message}
        </p>
      )}

      <section className="org-sec" aria-labelledby={`${titleId}-category`}>
        <div className="org-head">
          <h2 id={`${titleId}-category`} className="eyebrow org-h" tabIndex={-1}>
            Categories
          </h2>
          <span className="wb-note">Use ↑ ↓ to set the order. The top six are the trays on your desk’s shelf.</span>
        </div>
        <ul className="org-list" aria-label="Categories">
          {cats.map((c, i) => {
            const n = catCount(c.id);
            return [
              i === SHELF && (
                <li key="shelf" className="org-div">
                  Not on the shelf · move a category above this line to show it as a tray
                </li>
              ),
              <Row
                key={c.id}
                kind="category"
                item={c}
                first={i === 0}
                last={i === cats.length - 1}
                swatches={SWATCHES}
                paletteOpen={palette === c.id}
                onPalette={() => setPalette((p) => (p === c.id ? null : c.id))}
                locked={c.locked}
                lockedNote="Others is the catch-all category, so it keeps its name and can’t be deleted."
                count={
                  <button type="button" className="link org-count" onClick={() => onOpenCategory(c)} aria-label={`Open the ${tasksText(n)} in ${c.name}`}>
                    {tasksText(n)}
                  </button>
                }
                tag={<span className={`org-tag${i < SHELF ? ' on' : ''}`}>{i < SHELF ? 'On shelf' : 'Hidden'}</span>}
                error={errors[c.id]}
                onRename={(name) => rename('category', c.id, name)}
                onColour={(color) => recolour('category', c.id, color)}
                onMove={(step) => move('category', i, step)}
                onDelete={() => setConfirm({ kind: 'category', id: c.id })}
              />,
              <ConfirmSlot key={`${c.id}-confirm`}>{confirmRow('category', c, n ? `It comes off its ${tasksText(n)}; the tasks themselves stay.` : 'No tasks use it.')}</ConfirmSlot>,
            ];
          })}
        </ul>
        {adding === 'category' ? (
          <QuickAdd
            kind="category"
            existing={cats}
            create={async (b) => (await act.createCategory.mutateAsync({ name: b.name, color: b.color })).id}
            onAdded={() => {
              setAdding(null);
              setMessage('Category added. It is at the end of the list; move it up to put it on the shelf.');
            }}
            onCancel={() => setAdding(null)}
          />
        ) : cats.length < MAX_CATEGORIES ? (
          <button type="button" className="btn org-add" onClick={() => setAdding('category')}>
            + Add category
          </button>
        ) : (
          <p className="wb-note">That is the most categories you can have ({MAX_CATEGORIES}).</p>
        )}
      </section>

      <section className="org-sec" aria-labelledby={`${titleId}-priority`}>
        <div className="org-head">
          <h2 id={`${titleId}-priority`} className="eyebrow org-h" tabIndex={-1}>
            Priority levels
          </h2>
          <span className="wb-note">Top is most important; the Ring fills one more segment per level. New tasks start at the default.</span>
        </div>
        <ul className="org-list" aria-label="Priority levels">
          {levels.map((l, i) => {
            const n = levelCount(l.id);
            const to = levels[i + 1] ?? levels[i - 1];
            return [
              <Row
                key={l.id}
                kind="priority"
                item={l}
                ring={<Ring filled={l.filled} segments={levels.length} color={l.color} size={22} />}
                first={i === 0}
                last={i === levels.length - 1}
                swatches={PRIORITY_SWATCHES_WITH_BRAND}
                paletteOpen={palette === l.id}
                onPalette={() => setPalette((p) => (p === l.id ? null : l.id))}
                undeletable={levels.length < 2 ? 'Keep at least one priority level.' : undefined}
                count={<span className="org-count">{tasksText(n)}</span>}
                tag={
                  l.isDefault ? (
                    <span className="org-tag on" title="New tasks start at this level">
                      Default
                    </span>
                  ) : (
                    <button type="button" className="org-tag org-make" onClick={() => makeDefault(l.id)} aria-label={`Make ${l.name} the default`}>
                      Make default
                    </button>
                  )
                }
                error={errors[l.id]}
                onRename={(name) => rename('priority', l.id, name)}
                onColour={(color) => recolour('priority', l.id, color)}
                onMove={(step) => move('priority', i, step)}
                onDelete={() => setConfirm({ kind: 'priority', id: l.id })}
              />,
              <ConfirmSlot key={`${l.id}-confirm`}>
                {to &&
                  confirmRow(
                    'priority',
                    l,
                    [n ? `Its ${tasksText(n)} move to ${to.name}.` : 'No tasks use it.', l.isDefault ? `${to.name} becomes the default.` : ''].filter(Boolean).join(' '),
                  )}
              </ConfirmSlot>,
            ];
          })}
        </ul>
        {adding === 'priority' ? (
          <QuickAdd
            kind="priority"
            existing={levels}
            create={async (b) => (await act.createPriority.mutateAsync(b)).id}
            onAdded={() => {
              setAdding(null);
              setMessage('Priority level added.');
            }}
            onCancel={() => setAdding(null)}
          />
        ) : levels.length < MAX_LEVELS ? (
          <button type="button" className="btn org-add" onClick={() => setAdding('priority')}>
            + Add priority level
          </button>
        ) : (
          <p className="wb-note">That is the most priority levels you can have ({MAX_LEVELS}).</p>
        )}
      </section>
    </div>
  );
}

/** The brand's three priority colours first, then the extra swatches. */
const PRIORITY_SWATCHES_WITH_BRAND = ['#E04A2F', '#F0A81C', '#4E9E78', ...PRIORITY_SWATCHES];

const ConfirmSlot = ({ children }: { children: ReactNode }) => <>{children}</>;

function Row({ kind, item, ring, first, last, swatches, paletteOpen, onPalette, locked, lockedNote, undeletable, count, tag, error, onRename, onColour, onMove, onDelete }: {
  kind: Kind;
  item: Category | Priority;
  ring?: ReactNode;
  first: boolean;
  last: boolean;
  swatches: string[];
  paletteOpen: boolean;
  onPalette: () => void;
  /** The fallback category: no renaming, no deleting. */
  locked?: boolean;
  lockedNote?: string;
  /** Why Delete is off, if it is (the last priority level). */
  undeletable?: string;
  count: ReactNode;
  tag: ReactNode;
  error?: string;
  onRename: (name: string) => Promise<void>;
  onColour: (color: string) => void;
  onMove: (step: -1 | 1) => void;
  onDelete: () => void;
}) {
  // The name is edited in place: Enter or leaving the field saves, Escape puts it back.
  const [draft, setDraft] = useState(item.name);
  const [saved, setSaved] = useState(item.name);
  const [local, setLocal] = useState('');
  if (saved !== item.name) {
    setSaved(item.name);
    setDraft(item.name);
  }
  const custom = useRef(0);
  const noun = kind === 'category' ? 'category' : 'priority level';

  async function commit() {
    const name = draft.trim();
    setLocal('');
    if (name === item.name) return setDraft(item.name);
    if (!name) {
      setDraft(item.name);
      return setLocal('A name can’t be empty.');
    }
    try {
      await onRename(name);
    } catch {
      setDraft(item.name);
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape' && draft !== item.name) {
      e.stopPropagation(); // revert the edit; a second Escape closes the panel
      setDraft(item.name);
      setLocal('');
    }
  };
  const why = locked ? lockedNote : undeletable;
  const shown = local || error;

  return (
    <>
      <li className="org-row" style={{ '--pc': item.color } as CSSProperties}>
        {ring}
        <button type="button" className="org-swatch" style={{ background: item.color }} aria-label={`Colour of ${item.name}`} aria-expanded={paletteOpen} onClick={onPalette} />
        <div className="field-input org-name">
          <input
            value={draft}
            maxLength={24}
            readOnly={locked}
            title={locked ? lockedNote : undefined}
            aria-label={`Name of the ${noun} ${item.name}`}
            aria-invalid={shown ? true : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={onKey}
          />
        </div>
        {count}
        {tag}
        <span className="org-moves">
          <button type="button" className="btn btn-ghost org-mv" data-move={`${item.id}:up`} disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${item.name} up`}>
            ↑
          </button>
          <button type="button" className="btn btn-ghost org-mv" data-move={`${item.id}:down`} disabled={last} onClick={() => onMove(1)} aria-label={`Move ${item.name} down`}>
            ↓
          </button>
        </span>
        <button type="button" className="btn btn-ghost org-del" disabled={!!why} title={why} onClick={onDelete} aria-label={`Delete ${item.name}`}>
          Delete
        </button>
      </li>
      {paletteOpen && (
        <li className="org-palette">
          <span className="tv-swatches" role="radiogroup" aria-label={`Colour of ${item.name}`}>
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={item.color.toLowerCase() === c.toLowerCase()}
                aria-label={c}
                className="tv-swatch"
                style={{ background: c }}
                onClick={() => {
                  onColour(c);
                  onPalette();
                }}
              />
            ))}
          </span>
          <label className="org-custom">
            Any colour
            <input
              type="color"
              defaultValue={item.color}
              onChange={(e) => {
                // The picker reports every step of a drag; save once it rests.
                const v = e.target.value;
                window.clearTimeout(custom.current);
                custom.current = window.setTimeout(() => onColour(v), 350);
              }}
            />
          </label>
        </li>
      )}
      {shown && (
        <li className="org-err field-error" role="alert">
          {shown}
        </li>
      )}
    </>
  );
}
