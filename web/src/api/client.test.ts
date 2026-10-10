import { beforeEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function freshClient() {
  vi.resetModules();
  return import('./client');
}

describe('api client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches a CSRF token first and sends it on state-changing requests, with cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { csrfToken: 'tok-1' })).mockResolvedValueOnce(json(201, { task: { id: '1' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await freshClient();
    await api('POST', '/tasks', { title: 'x' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/csrf');
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/tasks');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-CSRF-Token']).toBe('tok-1');
  });

  it('refreshes the session once on a 401 and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 'tok' })) // CSRF for the refresh POST
      .mockResolvedValueOnce(json(200, { user: {}, csrfToken: 'tok-2' })) // refresh
      .mockResolvedValueOnce(json(200, { tasks: [] })); // retry
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await freshClient();
    await expect(api('GET', '/tasks')).resolves.toEqual({ tasks: [] });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/tasks', '/api/auth/csrf', '/api/auth/refresh', '/api/tasks']);
  });

  it('reports a lost session when the refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 'tok' }))
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHORIZED', message: 'Your session has ended.' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { api, setSessionLostHandler, ApiError } = await freshClient();
    const lost = vi.fn();
    setSessionLostHandler(lost);
    await expect(api('GET', '/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledOnce();
  });

  it('turns API errors into ApiError with field messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(json(200, { csrfToken: 't' })).mockResolvedValueOnce(json(400, { error: { code: 'BAD_REQUEST', message: 'Some fields need a look.', fields: { title: 'Give the task a title.' } } })),
    );
    const { api, ApiError } = await freshClient();
    const err = await api('POST', '/tasks', { title: '' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).fields.title).toBe('Give the task a title.');
  });

  it('retries once with a fresh token when the server rejects the CSRF token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { csrfToken: 'old' }))
      .mockResolvedValueOnce(json(403, { error: { code: 'CSRF', message: 'blocked' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 'new' }))
      .mockResolvedValueOnce(json(204, null));
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await freshClient();
    await api('DELETE', '/tasks/abc');
    expect(fetchMock.mock.calls[3]![1].headers['X-CSRF-Token']).toBe('new');
  });
});
