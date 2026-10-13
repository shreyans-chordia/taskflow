import { useEffect, useState } from 'react';
import { pomodoro as defaultStore, type Pomodoro, type TimerNotice } from './pomodoro';
import './timer.css';

/** At most this many notices at once; the oldest goes first. */
const MAX = 3;

/**
 * The timer's notices (POM-2), shown wherever you are when a focus session or a break ends: over the desk, inside
 * a panel, or on the 2D page. The end of a break offers to start the next focus session.
 */
export function TimerNotices({ store = defaultStore }: { store?: Pomodoro }) {
  const [list, setList] = useState<Array<TimerNotice & { out?: boolean }>>([]);

  useEffect(
    () =>
      store.onNotice((n) => {
        setList((l) => [...l, n].slice(-MAX));
      }),
    [store],
  );

  const dismiss = (id: number) => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setList((l) => l.map((n) => (n.id === id ? { ...n, out: true } : n)));
    window.setTimeout(() => setList((l) => l.filter((n) => n.id !== id)), reduced ? 0 : 200);
  };

  return (
    <div className="toasts" aria-live="polite">
      {list.map((n) => (
        <Notice key={n.id} n={n} onDismiss={() => dismiss(n.id)} onStart={store.start} />
      ))}
    </div>
  );
}

function Notice({ n, onDismiss, onStart }: { n: TimerNotice & { out?: boolean }; onDismiss: () => void; onStart: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, n.ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per notice
  }, [n.id, n.ms]);
  return (
    <div className={`toast glass${n.out ? ' out' : ''}`}>
      <span className="toast-text">{n.text}</span>
      {n.action === 'start' && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            onDismiss();
            onStart();
          }}
        >
          Start focus
        </button>
      )}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={onDismiss}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6L18 18M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
