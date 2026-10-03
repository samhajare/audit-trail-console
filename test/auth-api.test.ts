import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { baseApi } from '../src/services/baseApi';
import { safeReturnTo } from '../src/auth/returnTo';

// Test-only endpoint exercises the real RTK Query middleware and base query.
const testApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    authProbe: builder.query<{ ok: boolean }, void>({ query: () => '/health' }),
  }),
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated API requests', () => {
  it('does not revive the previous session when logout fails after a session change', async () => {
    const session = createTokenSession();
    session.setProvider(async () => 'previous-user-token');
    const resume = session.suspend();
    await expect(session.getToken()).rejects.toThrow('Sign in');
    session.setProvider(async () => 'new-user-token');
    resume();
    await expect(session.getToken()).resolves.toBe('new-user-token');
  });

  it('does not send a request when the SDK returns no token', async () => {
    const session = createTokenSession();
    session.setProvider(async () => undefined);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const store = createAppStore(session);
    try {
      const result = await store.dispatch(
        testApi.endpoints.authProbe.initiate(undefined, { subscribe: false }),
      );
      expect(result.error).toMatchObject({ status: 'CUSTOM_ERROR' });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      store.dispatch(baseApi.util.resetApiState());
    }
  });
  it('retrieves a token for each request and sends a bearer header', async () => {
    const session = createTokenSession();
    const getToken = vi
      .fn()
      .mockResolvedValueOnce('first-token')
      .mockResolvedValueOnce('renewed-token');
    session.setProvider(getToken);
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const store = createAppStore(session);
    try {
      await expect(
        store
          .dispatch(
            testApi.endpoints.authProbe.initiate(undefined, {
              subscribe: false,
            }),
          )
          .unwrap(),
      ).resolves.toEqual({ ok: true });
      await store
        .dispatch(
          testApi.endpoints.authProbe.initiate(undefined, {
            subscribe: false,
            forceRefetch: true,
          }),
        )
        .unwrap();
      const first = fetch.mock.calls[0]?.[0] as Request;
      const second = fetch.mock.calls[1]?.[0] as Request;
      expect(first.headers.get('Authorization')).toBe('Bearer first-token');
      expect(second.headers.get('Authorization')).toBe('Bearer renewed-token');
      expect(getToken).toHaveBeenCalledTimes(2);
    } finally {
      store.dispatch(baseApi.util.resetApiState());
    }
  });

  it.each(['signed-out', 'token-failure', 'session-change'])(
    'returns a visible query error without sending a request for %s',
    async (scenario) => {
      const session = createTokenSession();
      if (scenario === 'token-failure')
        session.setProvider(async () => {
          throw new Error('Token unavailable');
        });
      if (scenario === 'session-change')
        session.setProvider(async () => {
          session.setProvider(undefined);
          return 'stale-token';
        });
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const store = createAppStore(session);
      try {
        const result = await store.dispatch(
          testApi.endpoints.authProbe.initiate(undefined, { subscribe: false }),
        );
        expect(result.error).toMatchObject({
          status: 'CUSTOM_ERROR',
          kind: 'authentication',
          message: expect.any(String),
        });
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        store.dispatch(baseApi.util.resetApiState());
      }
    },
  );
});

describe('login return path', () => {
  it.each([
    'https://external.example.com',
    '//external.example.com',
    '/\\external.example.com',
    '/login',
    null,
  ])('rejects unsafe or looping return paths: %s', (path) => {
    expect(safeReturnTo(path)).toBe('/');
  });
  it('preserves local path, query, and fragment', () => {
    expect(safeReturnTo('/missing?view=all#details')).toBe(
      '/missing?view=all#details',
    );
  });
});
