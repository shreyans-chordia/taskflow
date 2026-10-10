export interface Rule {
  label: string;
  ok: boolean;
}

/** The four rules behind the strength Ring. Only the length rule is enforced; the rest are advice. */
export function passwordRules(pw: string): Rule[] {
  return [
    { label: '8+ characters', ok: pw.length >= 8 },
    { label: 'a number', ok: /\d/.test(pw) },
    { label: 'a symbol', ok: /[^A-Za-z0-9]/.test(pw) },
    { label: 'upper and lower case', ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  ];
}

export const STRENGTH_LABELS = ['Use 8 or more characters', 'Weak password', 'Okay password', 'Good password', 'Strong password'] as const;

export function passwordScore(pw: string): number {
  return pw ? passwordRules(pw).filter((r) => r.ok).length : 0;
}

export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
