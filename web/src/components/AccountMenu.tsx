import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from './Ring';
import './account.css';

/**
 * The TaskFlow badge, which is also the account menu: click it to see who is signed in and to sign out.
 * Escape or a click anywhere else closes it. `children` adds items above Sign out (the 2D page's theme switch).
 */
export function AccountMenu({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    // Focus leaving the menu (Tab past Sign out) closes it too.
    const blur = (e: FocusEvent) => e.relatedTarget instanceof Node && !root.current?.contains(e.relatedTarget) && setOpen(false);
    const el = root.current;
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    el?.addEventListener('focusout', blur);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
      el?.removeEventListener('focusout', blur);
    };
  }, [open]);

  return (
    <div className="acct" ref={root}>
      <button
        ref={button}
        type="button"
        className="acct-badge glass"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`TaskFlow account menu, signed in as ${user?.name ?? ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Logo size={32} />
        <b>TaskFlow</b>
        <svg className="acct-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9L12 15L18 9" />
        </svg>
      </button>
      {open && (
        <div id={id} className="acct-pop glass" role="group" aria-label="Account">
          <div className="acct-who">
            <span className="eyebrow">Signed in as</span>
            <strong>{user?.name}</strong>
            <span className="acct-mail">{user?.email}</span>
          </div>
          {children}
          <button type="button" className="btn acct-out" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
