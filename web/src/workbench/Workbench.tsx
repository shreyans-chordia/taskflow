import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Ring';
import { TaskViews } from '../tasks/TaskViews';
import './workbench.css';

/**
 * The 2D home page: the fallback when a browser cannot draw the 3D desk. It holds the same task screens
 * (list, task, edit) that the desk's panel shows.
 */
export function Workbench({ onToggleTheme }: { onToggleTheme: () => void }) {
  const { user, logout } = useAuth();
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
        <TaskViews titleId="wb-title" initial={{ type: 'list' }} />
      </main>
    </div>
  );
}
