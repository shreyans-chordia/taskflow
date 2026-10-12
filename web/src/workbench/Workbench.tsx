import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Ring';
import { TaskViews, type TaskSection } from '../tasks/TaskViews';
import './workbench.css';

/**
 * The 2D home page: the fallback when a browser cannot draw the 3D desk. It holds the same task screens
 * (list, calendar, search, task, edit) that the desk's panels show, with tabs in place of the desk's objects.
 */
const SECTIONS: Array<[TaskSection, string]> = [
  ['list', 'Tasks'],
  ['calendar', 'Calendar'],
  ['search', 'Search'],
];

export function Workbench({ onToggleTheme }: { onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
  const [section, setSection] = useState<{ name: TaskSection; n: number }>({ name: 'list', n: 0 });
  // A tab always starts its section afresh, even the current one (from a task deep inside it).
  const go = (name: TaskSection) => setSection((s) => ({ name, n: s.n + 1 }));
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
      <nav className="wb-tabs glass" aria-label="Sections">
        {SECTIONS.map(([name, label]) => (
          <button key={name} type="button" className="wb-tab" aria-current={section.name === name ? 'page' : undefined} onClick={() => go(name)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="wb-card glass" aria-labelledby="wb-title">
        <TaskViews key={section.n} titleId="wb-title" initial={section.name === 'calendar' ? { type: 'calendar' } : section.name === 'search' ? { type: 'search' } : { type: 'list' }} />
      </main>
    </div>
  );
}
