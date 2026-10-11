import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import type { CodeChallenge, User } from '../api/types';
import { Logo, Ring, Spinner } from '../components/Ring';
import { useAuth } from './AuthProvider';
import { isEmail, passwordRules, passwordScore, STRENGTH_LABELS } from './password';
import './auth.css';

/**
 * signup / signin: the two entry points.
 * otp: sign-in step two, the code emailed after a correct password (AUTH-6).
 * forgot → reset: "Forgot password?" emails a code, then the code plus a new password sign you in (AUTH-8, AUTH-9).
 */
type Mode = 'signup' | 'signin' | 'otp' | 'forgot' | 'reset';
type FieldKey = 'name' | 'email' | 'password' | 'code';
type Errors = Partial<Record<FieldKey, ReactNode>>;
const COUNT = ['', 'One thing needs', 'Two things need', 'Three things need'];
const isCode = (c: string) => /^\d{6}$/.test(c);

const COPY: Record<Mode, { eyebrow: string; title: string; button: string; busy: string; before: string }> = {
  signup: { eyebrow: 'Create your account', title: 'Set up your desk', button: 'Create my desk', busy: 'Setting up your desk…', before: 'we can set this up' },
  signin: { eyebrow: 'Sign in', title: 'Welcome back', button: 'Open my desk', busy: 'Checking your password…', before: 'we can open your desk' },
  otp: { eyebrow: 'Two-step sign-in', title: 'Check your email', button: 'Verify and open my desk', busy: 'Checking your code…', before: 'we can open your desk' },
  forgot: { eyebrow: 'Reset password', title: 'Forgot your password?', button: 'Email me a code', busy: 'Sending your code…', before: 'we can send a code' },
  reset: { eyebrow: 'Reset password', title: 'Choose a new password', button: 'Save and open my desk', busy: 'Saving your new password…', before: 'we can save it' },
};

/** Design A ("Through the glass"): a frosted card over the room. Sign-up, two-step sign-in, password reset and the "desk is ready" moment. */
export function AuthScreen({ initialMode = 'signup' }: { initialMode?: 'signup' | 'signin' }) {
  const { signup, login, verifyLogin, resendCode, forgotPassword, resetPassword, enter } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [vals, setVals] = useState({ name: '', email: '', password: '', code: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState<User | null>(null);
  /** The pending code: where it went (masked) and when another may be requested. */
  const [challenge, setChallenge] = useState<{ email: string; minutes: number; resendAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cardRef = useRef<HTMLDivElement>(null);
  const copy = COPY[mode];
  const waitingForCode = mode === 'otp' || mode === 'reset';

  // Move focus to the first field with a problem, or the first field when the mode changes.
  useEffect(() => {
    const el = cardRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? cardRef.current?.querySelector<HTMLElement>(ready ? '[data-autofocus]' : 'input');
    el?.focus();
  }, [mode, errors, ready]);

  // Ticks the "resend in 0:42" countdown while a code is pending.
  useEffect(() => {
    if (!waitingForCode) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [waitingForCode]);

  const set = (k: FieldKey) => (v: string) => {
    setVals((s) => ({ ...s, [k]: k === 'code' ? v.replace(/\D/g, '').slice(0, 6) : v }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };
  const switchTo = (m: Mode, error = '') => {
    setMode(m);
    setErrors({});
    setFormError(error);
    setNotice('');
    setShow(false);
    // A password typed for one step never carries over into another.
    if (m !== 'signup' && m !== 'signin') setVals((s) => ({ ...s, password: '', code: '' }));
  };
  const startCode = (ch: CodeChallenge, next: Mode) => {
    setChallenge({ email: ch.email, minutes: Math.round(ch.expiresInSec / 60), resendAt: Date.now() + ch.resendInSec * 1000 });
    setNow(Date.now());
    switchTo(next);
  };

  function validate(): Errors {
    const errs: Errors = {};
    if (mode === 'signup' && !vals.name.trim()) errs.name = 'Tell us what to call you.';
    if ((mode === 'signup' || mode === 'signin' || mode === 'forgot') && !isEmail(vals.email)) errs.email = 'That does not look like an email address.';
    if (waitingForCode && !isCode(vals.code)) errs.code = vals.code ? 'The code has 6 digits.' : 'Enter the 6-digit code from the email.';
    if ((mode === 'signup' || mode === 'reset') && vals.password.length < 8)
      errs.password = vals.password ? `${vals.password.length} characters. Use at least 8.` : 'Choose a password with at least 8 characters.';
    if (mode === 'signin' && !vals.password) errs.password = 'Enter your password.';
    return errs;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    setFormError('');
    setNotice('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      if (mode === 'signup') setReady(await signup({ name: vals.name.trim(), email: vals.email.trim(), password: vals.password }));
      else if (mode === 'signin') startCode(await login({ email: vals.email.trim(), password: vals.password }), 'otp');
      else if (mode === 'otp') await verifyLogin(vals.code);
      else if (mode === 'forgot') startCode(await forgotPassword(vals.email.trim()), 'reset');
      else await resetPassword({ code: vals.code, password: vals.password });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_EXPIRED') {
        // The challenge is gone: back to the step that makes a new one.
        switchTo(mode === 'reset' ? 'forgot' : 'signin', err.message);
      } else if (err instanceof ApiError && err.status === 409) {
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

  async function resend() {
    setFormError('');
    setNotice('');
    setBusy(true);
    try {
      const r = await resendCode();
      setChallenge((c) => c && { ...c, resendAt: Date.now() + r.resendInSec * 1000 });
      setNow(Date.now());
      setVals((s) => ({ ...s, code: '' }));
      setErrors({});
      setNotice('A new code is on its way. The previous one no longer works.');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'OTP_EXPIRED' || err.code === 'OTP_LIMIT')) switchTo(mode === 'reset' ? 'forgot' : 'signin', err.message);
      else setFormError(err instanceof ApiError ? err.message : 'Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const n = Object.keys(errors).length;
  const resendIn = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;
  const sub =
    mode === 'signup'
      ? 'One desk, just for you. Everything you pin here stays private to your account.'
      : mode === 'signin'
        ? 'Your desk is just as you left it.'
        : mode === 'otp'
          ? `We sent a 6-digit code to ${challenge?.email ?? 'your email'}. It expires in ${challenge?.minutes ?? 10} minutes.`
          : mode === 'forgot'
            ? 'Enter the email you signed up with and we will send you a 6-digit code.'
            : `If ${challenge?.email ?? 'that email'} has a desk, a 6-digit code is on its way. Enter it with your new password.`;

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
            <div className="eyebrow">{copy.eyebrow}</div>
            <h1 id="auth-title" className="title">{copy.title}</h1>
            <p className="auth-sub">{sub}</p>
            {(n > 0 || formError) && (
              <div className="auth-summary" role="alert">
                {formError || `${COUNT[n] ?? 'Some things need'} a look before ${copy.before}.`}
              </div>
            )}
            {notice && (
              <div className="auth-notice" role="status">
                {notice}
              </div>
            )}
            <form onSubmit={submit} noValidate aria-busy={busy}>
              <fieldset disabled={busy} className={busy ? 'dim' : ''}>
                {mode === 'signup' && <Field label="Your name" autoComplete="name" placeholder="e.g. Shreyans" value={vals.name} onChange={set('name')} error={errors.name} />}
                {(mode === 'signup' || mode === 'signin' || mode === 'forgot') && (
                  <Field label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={vals.email} onChange={set('email')} error={errors.email} />
                )}
                {waitingForCode && (
                  <Field
                    label="6-digit code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    className="code-input"
                    value={vals.code}
                    onChange={set('code')}
                    error={errors.code}
                  />
                )}
                {(mode === 'signup' || mode === 'signin' || mode === 'reset') && (
                  <Field
                    label={mode === 'reset' ? 'New password' : 'Password'}
                    type={show ? 'text' : 'password'}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                    value={vals.password}
                    onChange={set('password')}
                    error={errors.password}
                    addon={
                      <button type="button" className="addon" aria-pressed={show} onClick={() => setShow((s) => !s)}>
                        {show ? 'Hide' : 'Show'}
                      </button>
                    }
                    after={
                      mode === 'signin' ? (
                        <button type="button" className="link auth-forgot" onClick={() => switchTo('forgot')}>
                          Forgot password?
                        </button>
                      ) : (
                        <StrengthMeter password={vals.password} />
                      )
                    }
                  />
                )}
              </fieldset>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner /> {copy.busy}
                  </>
                ) : (
                  copy.button
                )}
              </button>
            </form>
            {waitingForCode && (
              <p className="auth-switch">
                Didn&rsquo;t get it? Check spam, or{' '}
                {resendIn > 0 ? (
                  <span className="auth-wait">
                    resend in <span className="num">{`${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, '0')}`}</span>
                  </span>
                ) : (
                  <button type="button" className="link" disabled={busy} onClick={resend}>
                    send a new code
                  </button>
                )}
              </p>
            )}
            <p className="auth-switch">
              {mode === 'signup' ? (
                <>
                  Already have a desk?{' '}
                  <button type="button" className="link" disabled={busy} onClick={() => switchTo('signin')}>
                    Sign in
                  </button>
                </>
              ) : mode === 'signin' ? (
                <>
                  New here?{' '}
                  <button type="button" className="link" disabled={busy} onClick={() => switchTo('signup')}>
                    Set up your desk
                  </button>
                </>
              ) : mode === 'otp' ? (
                <>
                  Not you?{' '}
                  <button type="button" className="link" disabled={busy} onClick={() => switchTo('signin')}>
                    Use a different account
                  </button>
                </>
              ) : (
                <>
                  Remembered it?{' '}
                  <button type="button" className="link" disabled={busy} onClick={() => switchTo('signin')}>
                    Back to sign in
                  </button>
                </>
              )}
            </p>
            <p className="auth-foot">
              {waitingForCode ? 'Codes work once and expire quickly. TaskFlow will never ask you for one.' : 'Passwords are stored hashed, never in plain text.'}
            </p>
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
  inputMode?: 'numeric' | 'text' | 'email';
  maxLength?: number;
  className?: string;
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
          inputMode={props.inputMode}
          maxLength={props.maxLength}
          className={props.className}
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
