import { useId, useState, type KeyboardEvent } from 'react';
import { ApiError } from '../api/client';
import { ColorButton } from '../components/ColorPicker';
import type { Category, Priority } from '../api/types';
import { nextSwatch, PRIORITY_SWATCHES, SWATCHES } from './format';

/** Makes a new category or priority level without leaving the form; Enter adds it, Escape is left to the panel. */
export function QuickAdd({ kind, existing, create, onAdded, onCancel }: {
  kind: 'category' | 'priority';
  existing: Array<Category | (Priority & { filled: number })>;
  create: (b: { name: string; color: string; position?: number }) => Promise<string>;
  onAdded: (id: string) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const swatches = kind === 'category' ? SWATCHES : PRIORITY_SWATCHES;
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextSwatch(existing, swatches));
  const [position, setPosition] = useState(existing.length);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n) return setError('Give it a name.');
    if (existing.some((x) => x.name.toLowerCase() === n.toLowerCase())) return setError(`“${n}” already exists.`);
    setBusy(true);
    setError('');
    try {
      onAdded(await create({ name: n, color, ...(kind === 'priority' ? { position } : {}) }));
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fields)[0] ?? err.message : 'Could not save it. Try again.');
    } finally {
      setBusy(false);
    }
  }
  // This sits inside the task form, so Enter must add the item rather than submit the whole task.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void save();
    }
  };

  return (
    <div className="tv-quick" role="group" aria-label={kind === 'category' ? 'New category' : 'New priority level'}>
      <ColorButton value={color} label="Colour" onChange={setColor} />
      <div className="field-input tv-quick-name">
        <input aria-label={kind === 'category' ? 'Category name' : 'Level name'} value={name} maxLength={24} autoFocus onKeyDown={onKey} onChange={(e) => { setName(e.target.value); setError(''); }}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-e` : undefined}
          placeholder={kind === 'category' ? 'Category name, e.g. Finance' : 'Level name, e.g. Urgent'} />
      </div>
      {kind === 'priority' && (
        <select className="wb-select tv-quick-pos" aria-label="Where it sits" value={position} onChange={(e) => setPosition(+e.target.value)}>
          <option value={0}>At the top (most important)</option>
          {existing.map((x, i) => (
            <option key={x.id} value={i + 1}>Below {x.name}</option>
          ))}
        </select>
      )}
      <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
        Add
      </button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      {error && <span className="field-error tv-quick-err" role="alert" id={`${uid}-e`}>{error}</span>}
    </div>
  );
}
