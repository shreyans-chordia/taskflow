/**
 * The one place the app talks to the API.
 * - Cookies carry the session (`credentials: 'include'`); no token is ever readable by our JavaScript.
 * - The CSRF token lives only in memory and goes out as `X-CSRF-Token` on every state-changing request.
 * - A 401 triggers one silent refresh (the refresh cookie is rotated by the server), then a single retry.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const BASE = '/api';

let csrfToken = '';
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export const setCsrfToken = (t: string | undefined) => {
  if (t) csrfToken = t;
};
export const clearCsrfToken = () => {
  csrfToken = '';
};
/** Called when the session cannot be renewed, so the app can show the sign-in screen. */
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

async function ensureCsrf(): Promise<void> {
  if (csrfToken) return;
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
  const body = (await res.json().catch(() => ({}))) as { csrfToken?: string };
  setCsrfToken(body.csrfToken);
}

async function raw(method: Method, path: string, body?: unknown): Promise<Response> {
  if (method !== 'GET') await ensureCsrf();
  return fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Only one refresh runs at a time; concurrent 401s wait for it. */
function refreshSession(): Promise<boolean> {
  refreshing ??= raw('POST', '/auth/refresh')
    .then(async (res) => {
      if (!res.ok) return false;
      const data = (await res.json()) as { csrfToken?: string };
      setCsrfToken(data.csrfToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_RETRY = new Set(['/auth/login', '/auth/signup', '/auth/refresh', '/auth/csrf', '/auth/logout']);

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res = await raw(method, path, body);

  // A stale CSRF token (e.g. after the server rotated it) gets one fresh attempt.
  if (res.status === 403 && method !== 'GET') {
    const code = ((await res.clone().json().catch(() => ({}))) as { error?: { code?: string } }).error?.code;
    if (code === 'CSRF') {
      clearCsrfToken();
      res = await raw(method, path, body);
    }
  }
  if (res.status === 401 && !NO_RETRY.has(path)) {
    if (await refreshSession()) res = await raw(method, path, body);
    else onSessionLost();
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; fields?: Record<string, string> }; csrfToken?: string };
  if (!res.ok) {
    const e = data.error ?? { code: 'NETWORK', message: `Request failed (${res.status}).` };
    throw new ApiError(res.status, e.code, e.message, e.fields);
  }
  setCsrfToken(data.csrfToken);
  return data as T;
}
