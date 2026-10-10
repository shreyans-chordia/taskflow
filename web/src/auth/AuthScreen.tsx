import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { Logo, Ring, Spinner } from '../components/Ring';
import { useAuth } from './AuthProvider';
import { isEmail, passwordRules, passwordScore, STRENGTH_LABELS } from './password';
import './auth.css';

type Mode = 'signup' | 'signin';
type Errors = Partial<Record<'name' | 'email' | 'password', ReactNode>>;
const COUNT = ['', 'One thing needs', 'Two things need', 'Three things need'];

/** Design A ("Through the glass"): a frosted card over the room. Sign-up, sign-in and the "desk is ready" moment. */
export function AuthScreen({ initialMode = 'signup' }: { initialMode?: Mode }) {
  const { signup, login, enter } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [vals, setVals] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState<User | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Move focus to the first field with a problem, or the first field when the mode changes.
  useEffect(() => {
    const el = cardRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? cardRef.current?.querySelector<HTMLElement>(ready ? '[data-autofocus]' : 'input');
    el?.focus();
  }, [mode, errors, ready]);

  const set = (k: keyof typeof vals) => (v: string) => {
    setVals((s) => ({ ...s, [k]: v }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const switchTo = (m: Mode) => {
    setMode(m);
    setErrors({});
    setFormError('');
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    if (mode === 'signup' && !vals.name.trim()) errs.name = 'Tell us what to call you.';
    if (!isEmail(vals.email)) errs.email = 'That does not look like an email address.';
    if (mode === 'signup' && vals.password.length < 8) errs.password = vals.password ? `${vals.password.length} characters. Use at least 8.` : 'Choose a password with at least 8 characters.';
    if (mode === 'signin' && !vals.password) errs.password = 'Enter your password.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      if (mode === 'signup') {
        setReady(await signup({ name: vals.name.trim(), email: vals.email.trim(), password: vals.password }));
      } else {
        await login({ email: vals.email.trim(), password: vals.password });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: <>This email already has a desk. <button type="button" className="link" onClick={() => switchTo('signin')}>Sign in instead</button></> });
      } else if (err instanceof ApiError && Object.keys(err.fields).length) {
        setErrors(err.fields as Errors);
      } else {
        setFormError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const n = Object.keys(errors).length;
  return (
    <div className="auth">
      <div className="auth-badge glass" aria-hidden="true">
        <Logo size={34} />
        <b>TaskFlow</b>
      </div>
      <div className="auth-card glass" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="auth-title">
        {ready ? (
          <div className="auth-ready">
            <Logo size={120} micro={false} />
            <h1 id="auth-title" className="title">
              Your desk is ready,
              <br />
              {ready.name}
            </h1>
            <p className="auth-sub">Your categories and priority levels are set up. Pin your first task whenever you like.</p>
            <button type="button" className="btn btn-primary btn-block" data-autofocus onClick={() => enter(ready)}>
              Go to my desk
            </button>
          </div>
        ) : (
          <>
            <div className="eyebrow">{mode === 'signup' ? 'Create your account' : 'Sign in'}</div>
            <h1 id="auth-title" className="title">{mode === 'signup' ? 'Set up your desk' : 'Welcome back'}</h1>
            <p className="auth-sub">{mode === 'signup' ? 'One desk, just for you. Everything you pin here stays private to your account.' : 'Your desk is just as you left it.'}</p>
            {(n > 0 || formError) && (
              <div className="auth-summary" role="alert">
                {formError || `${COUNT[n] ?? 'Some things need'} a look before ${mode === 'signup' ? 'we can set this up' : 'we can open your desk'}.`}
              </div>
            )}
            <form onSubmit={submit} noValidate aria-busy={busy}>
              <fieldset disabled={busy} className={busy ? 'dim' : ''}>
                {mode === 'signup' && <Field label="Your name" autoComplete="name" placeholder="e.g. Shreyans" value={vals.name} onChange={set('name')} error={errors.name} />}
                <Field label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={vals.email} onChange={set('email')} error={errors.email} />
                <Field
                  label="Password"
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  value={vals.password}
                  onChange={set('password')}
                  error={errors.password}
                  addon={
                    <button type="button" className="addon" aria-pressed={show} onClick={() => setShow((s) => !s)}>
                      {show ? 'Hide' : 'Show'}
                    </button>
                  }
                  after={mode === 'signup' ? <StrengthMeter password={vals.password} /> : null}
                />
              </fieldset>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> {mode === 'signup' ? 'Setting up your desk…' : 'Opening your desk…'}
                  </>
                ) : mode === 'signup' ? (
                  'Create my desk'
                ) : (
                  'Open my desk'
                )}
              </button>
            </form>
            <p className="auth-switch">
              {mode === 'signup' ? 'Already have a desk? ' : 'New here? '}
              <button type="button" className="link" disabled={busy} onClick={() => switchTo(mode === 'signup' ? 'signin' : 'signup')}>
                {mode === 'signup' ? 'Sign in' : 'Set up your desk'}
              </button>
            </p>
            <p className="auth-foot">Passwords are stored hashed, never in plain text.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: ReactNode;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  addon?: ReactNode;
  after?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`field${props.error ? ' bad' : ''}`}>
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <div className="field-input">
        <input
          id={id}
          type={props.type ?? 'text'}
          value={props.value}
          autoComplete={props.autoComplete}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${id}-err` : undefined}
          style={props.addon ? { paddingRight: 70 } : undefined}
        />
        {props.addon}
      </div>
      {props.error && (
        <span className="field-error" id={`${id}-err`}>
          {props.error}
        </span>
      )}
      {props.after}
    </div>
  );
}

const STRENGTH_COLORS = ['var(--ring-track)', 'var(--coral)', 'var(--amber)', 'var(--mint)', 'var(--mint)'];

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  const rules = passwordRules(password);
  const next = password ? rules.find((r) => !r.ok) : undefined;
  return (
    <div className="meter" aria-live="polite">
      <Ring filled={score} segments={4} color={STRENGTH_COLORS[score]!} size={28} />
      <div className="meter-text">
        <span className="meter-label">{STRENGTH_LABELS[score]}</span>
        <span className="meter-rules">
          {rules.map((r) => (
            <span key={r.label} className={r.ok ? 'ok' : r === next ? 'next' : ''}>
              {r.ok ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              ) : (
                <i />
              )}
              {r.label}
              <span className="sr-only">{r.ok ? ' (done)' : ''}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
