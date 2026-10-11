import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Emails "sent" with the memory transport, newest last. Only tests read this. */
export const outbox: Mail[] = [];

let smtp: Transporter | null = null;
function smtpTransport(): Transporter {
  smtp ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    // Port 587 must upgrade to TLS; never send a code over a plain connection.
    requireTLS: !env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return smtp;
}

/**
 * Sends one email through the configured transport. Throws when an SMTP server refuses it,
 * so callers can decide whether the user should hear about the failure.
 */
export async function sendMail(mail: Mail): Promise<void> {
  switch (env.mailTransport) {
    case 'memory':
      outbox.push(mail);
      return;
    case 'console':
      // Local development only (production refuses this transport at boot): the code shows up in the API log.
      logger.warn({ to: mail.to, subject: mail.subject }, `Email not sent (MAIL_TRANSPORT=console):\n${mail.text}`);
      return;
    case 'file': {
      await mkdir(env.MAIL_OUTBOX_DIR, { recursive: true });
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
      await writeFile(path.join(env.MAIL_OUTBOX_DIR, name), JSON.stringify(mail));
      return;
    }
    case 'smtp':
      await smtpTransport().sendMail({ from: env.MAIL_FROM, ...mail });
      return;
  }
}

/* ---------- templates ---------- */

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(heading: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F4F1EA;font-family:Inter,Arial,sans-serif;color:#22262B">
<table role="presentation" width="100%" style="max-width:460px;margin:0 auto;background:#FFFFFF;border-radius:14px;padding:28px">
<tr><td>
<p style="margin:0 0 6px;font:600 12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6B6F75">TaskFlow</p>
<h1 style="margin:0 0 14px;font-size:22px;color:#22262B">${heading}</h1>
${body}
</td></tr></table></body></html>`;
}

export function codeEmail(to: string, name: string, code: string, purpose: 'login' | 'reset'): Mail {
  const minutes = env.OTP_TTL_MIN;
  const what = purpose === 'login' ? 'finish signing in' : 'reset your password';
  const subject = purpose === 'login' ? `${code} is your TaskFlow sign-in code` : `${code} is your TaskFlow password reset code`;
  const ignore =
    purpose === 'login'
      ? 'If this was not you, someone knows your password: reset it from the sign-in screen.'
      : 'If you did not ask for this, ignore this email. Your password stays the same.';
  const text = `Hi ${name},\n\nUse this code to ${what}:\n\n    ${code}\n\nIt expires in ${minutes} minutes and works once. Never share it: TaskFlow will never ask you for it.\n\n${ignore}\n`;
  const html = layout(
    purpose === 'login' ? 'Your sign-in code' : 'Your password reset code',
    `<p style="margin:0 0 16px">Hi ${escapeHtml(name)}, use this code to ${what}:</p>
<p style="margin:0 0 16px;font:700 32px/1 'JetBrains Mono',Consolas,monospace;letter-spacing:.3em;color:#2F4E7A">${code}</p>
<p style="margin:0 0 12px;font-size:14px;color:#6B6F75">It expires in ${minutes} minutes and works once. Never share it: TaskFlow will never ask you for it.</p>
<p style="margin:0;font-size:14px;color:#6B6F75">${ignore}</p>`,
  );
  return { to, subject, text, html };
}

export function passwordChangedEmail(to: string, name: string): Mail {
  const text = `Hi ${name},\n\nThe password for your TaskFlow account was just changed and every other device was signed out.\n\nIf this was not you, reset your password right away from the sign-in screen ("Forgot password?").\n`;
  const html = layout(
    'Your password was changed',
    `<p style="margin:0 0 12px">Hi ${escapeHtml(name)}, the password for your TaskFlow account was just changed and every other device was signed out.</p>
<p style="margin:0;font-size:14px;color:#6B6F75">If this was not you, reset your password right away from the sign-in screen ("Forgot password?").</p>`,
  );
  return { to, subject: 'Your TaskFlow password was changed', text, html };
}
