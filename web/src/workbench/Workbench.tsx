import { useState } from 'react';
import { AccountMenu } from '../components/AccountMenu';
import { TaskViews, type TaskSection, type TaskView } from '../tasks/TaskViews';
import './workbench.css';

/**
 * The 2D home page: the fallback when a browser cannot draw the 3D desk. It holds the same task screens
 * (list, calendar, search, task, edit) that the desk's panels show, with tabs in place of the desk's objects.
 */
const SECTIONS: Array<[TaskSection, string]> = [
  ['list', 'Tasks'],
  ['calendar', 'Calendar'],
  ['search', 'Search'],
  ['organize', 'Categories'],
];

const INITIAL: Record<TaskSection, TaskView> = { list: { type: 'list' }, calendar: { type: 'calendar' }, search: { type: 'search' }, organize: { type: 'organize' } };

export function Workbench({ onToggleTheme }: { onToggleTheme: () => void }) {
  const [section, setSection] = useState<{ name: TaskSection; n: number }>({ name: 'list', n: 0 });
  // A tab always starts its section afresh, even the current one (from a task deep inside it).
  const go = (name: TaskSection) => setSection((s) => ({ name, n: s.n + 1 }));
  return (
    <div className="wb">
      <header className="wb-bar">
        {/* No desk lamp to click here, so the light / dark switch lives in the account menu. */}
        <AccountMenu>
          <button type="button" className="btn btn-ghost" onClick={onToggleTheme}>
            Lamp: light / dark
          </button>
        </AccountMenu>
      </header>
      <nav className="wb-tabs glass" aria-label="Sections">
        {SECTIONS.map(([name, label]) => (
          <button key={name} type="button" className="wb-tab" aria-current={section.name === name ? 'page' : undefined} onClick={() => go(name)}>
            {label}
          </button>
        ))}
      </nav>
      <main className="wb-card glass" aria-labelledby="wb-title">
        <TaskViews key={section.n} titleId="wb-title" initial={INITIAL[section.name]} />
      </main>
    </div>
  );
}
