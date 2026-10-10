import { useEffect, useState } from 'react';
import { AuthScreen } from './auth/AuthScreen';
import { useAuth } from './auth/AuthProvider';
import { Logo } from './components/Ring';
import { Workbench } from './workbench/Workbench';

type Theme = 'light' | 'dark';
const THEME_KEY = 'taskflow-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage can be blocked; fall back to the system setting */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const { status } = useAuth();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not essential */
    }
  }, [theme]);

  return (
    <>
      {/* Stand-in for the 3D room until it is ported (phase 2): a still of the desk, blurred behind the glass. */}
      <div className="backdrop" data-theme-img={theme} aria-hidden="true" />
      {status === 'loading' ? (
        <div className="boot" role="status">
          <Logo size={84} micro />
          <span>Setting up your desk…</span>
        </div>
      ) : status === 'signedOut' ? (
        <AuthScreen />
      ) : (
        <Workbench onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      )}
    </>
  );
}
