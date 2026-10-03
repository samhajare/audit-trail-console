import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { baseApi } from '../src/services/baseApi';
import type {
  AuditEventDetail,
  AuditEventSummary,
  AuditStatistics,
  AuditTimelineEvent,
  PaginatedAuditResponse,
} from '../src/types/audit';

vi.mock('../src/config/env', () => ({
  env: { apiBaseUrl: 'https://api.example.test/v1' },
}));

const event: AuditEventDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-event-1',
  schemaVersion: '1.0',
  eventType: 'USER_LOGIN',
  timestamp: '2026-10-04T00:00:00.000Z',
  createdAt: '2026-10-04T00:00:01.000Z',
  tenantId: 'test-tenant',
  correlationId: 'test-flow',
  actor: { id: 'test-actor', email: '[MASKED]' },
  resource: { type: 'session', id: 'test-session' },
  action: 'login',
  changes: {
    before: null,
    after: { active: true, nested: [null, { count: 1 }] },
  },
  context: { service: 'identity' },
  metadata: { severity: 'INFO' },
};
const summary: AuditEventSummary = event;
const timeline: AuditTimelineEvent = event;
const page: PaginatedAuditResponse = {
  items: [event],
  total: 1,
  page: 1,
  limit: 25,
  totalPages: 1,
};
const statistics: AuditStatistics = {
  total: 1,
  byEventType: {
    USER_LOGIN: 1,
    USER_ROLE_CHANGED: 0,
    DATA_EXPORTED: 0,
    CONFIG_CHANGED: 0,
    PAYMENT_REFUNDED: 0,
  },
};

const testApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    contractProbe: builder.query<PaginatedAuditResponse, void>({
      query: () => ({
        url: '/audit/events',
        params: { page: 1, limit: 25 },
        headers: { 'X-Test-Header': 'preserved' },
      }),
    }),
  }),
});

afterEach(() => vi.unstubAllGlobals());

function setup(fetch: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  const getToken = vi.fn().mockResolvedValue('access-token');
  session.setProvider(getToken);
  const store = createAppStore(session);
  return {
    store,
    getToken,
    query: () =>
      store.dispatch(
        testApi.endpoints.contractProbe.initiate(undefined, {
          subscribe: false,
        }),
      ),
    cleanup: () => store.dispatch(baseApi.util.resetApiState()),
  };
}

describe('typed REST base query', () => {
  it('uses the configured URL prefix, bearer token, query params, and endpoint headers without transforming successful data', async () => {
    const fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify(page), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const api = setup(fetch);
    try {
      await expect(api.query().unwrap()).resolves.toEqual(page);
      const request = fetch.mock.calls[0]?.[0] as Request;
      expect(request.url).toBe(
        'https://api.example.test/v1/audit/events?page=1&limit=25',
      );
      expect(request.headers.get('Authorization')).toBe('Bearer access-token');
      expect(request.headers.get('X-Test-Header')).toBe('preserved');
      expect(summary.eventId).toBe('producer-event-1');
      expect(timeline.changes.before).toBeNull();
      expect(statistics.byEventType.USER_LOGIN).toBe(1);
    } finally {
      api.cleanup();
    }
  });

  it.each([
    [401, 'unauthorized', false],
    [403, 'forbidden', false],
    [404, 'not-found', false],
    [409, 'conflict', false],
    [500, 'server', true],
    [503, 'server', true],
    [599, 'server', true],
    [400, 'http', false],
  ] as const)(
    'returns a normalized %s error through the query state and unwrap',
    async (status, kind, retryable) => {
      const data = { statusCode: status, message: 'backend detail' };
      const fetch = vi.fn().mockImplementation(
        async () =>
          new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      );
      const api = setup(fetch);
      try {
        const query = api.query();
        const expected = {
          status,
          httpStatus: status,
          kind,
          retryable,
          message: expect.any(String),
          data,
        };
        await expect(query.unwrap()).rejects.toMatchObject(expected);
        expect(
          testApi.endpoints.contractProbe.select()(api.store.getState()).error,
        ).toMatchObject(expected);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(api.getToken).toHaveBeenCalledTimes(1);
      } finally {
        api.cleanup();
      }
    },
  );

  it('returns a network error without reflecting fetch internals or retrying', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('private network detail'));
    const api = setup(fetch);
    try {
      await expect(api.query().unwrap()).rejects.toMatchObject({
        status: 'FETCH_ERROR',
        kind: 'network',
        retryable: true,
        message:
          'Unable to reach the service. Check your connection and try again.',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      api.cleanup();
    }
  });

  it.each([
    [200, 'parsing'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
    [502, 'server'],
  ] as const)(
    'preserves the meaning of HTTP %s when the response is not valid JSON',
    async (status, kind) => {
      const fetch = vi.fn().mockImplementation(
        async () =>
          new Response('<html>Proxy response</html>', {
            status,
            headers: { 'Content-Type': 'text/html' },
          }),
      );
      const api = setup(fetch);
      try {
        await expect(api.query().unwrap()).rejects.toMatchObject({
          status: 'PARSING_ERROR',
          httpStatus: status,
          kind,
          message: expect.any(String),
        });
      } finally {
        api.cleanup();
      }
    },
  );
});
