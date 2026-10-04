import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { RequireAuditRead } from '../src/auth/PermissionGate';
import { ProtectedRoute } from '../src/auth/ProtectedRoute';
import { AppShell } from '../src/layouts/AppShell';
import { DlqListPage } from '../src/features/dlq/DlqListPage';
import { DlqDetailPage } from '../src/features/dlq/DlqDetailPage';
import { baseApi } from '../src/services/baseApi';
import type { DlqRecord } from '../src/types/dlq';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined,
  user: {
    sub: 'auth0|reader',
    'https://audit-trail.example.com/permissions': ['audit:read'],
  },
  logout: vi.fn(),
}));
vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));
beforeEach(() => {
  auth.isAuthenticated = true;
  auth.user['https://audit-trail.example.com/permissions'] = ['audit:read'];
});
const record: DlqRecord = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'failed + event',
  tenantId: 'tenant-one',
  createdAt: '2026-10-04T12:00:01Z',
  replayStatus: 'pending',
  envelope: {
    originalEvent: {
      eventId: 'failed + event',
      eventType: 'USER_LOGIN',
      actor: { email: '[MASKED]' },
      note: '<script>unsafe</script>',
    },
    failureReason: 'transient_persistence',
    retryCount: 3,
    failedAt: '2026-10-04T12:00:00Z',
    sourceTopic: 'audit.events',
    correlationId: 'flow-one',
  },
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(items = [record], number = 1, total = items.length, limit = 25) {
  return {
    items,
    page: number,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
const stores: ReturnType<typeof createAppStore>[] = [];
afterEach(() => {
  stores.forEach((store) => {
    store
      .dispatch(baseApi.util.getRunningQueriesThunk())
      .forEach((query) => query.abort());
    store.dispatch(baseApi.util.resetApiState());
  });
  stores.length = 0;
  vi.unstubAllGlobals();
});
function mount(
  handler: (url: URL) => Response | Promise<Response> = (url) =>
    json(url.pathname === '/audit/dlq' ? page() : record),
  path = '/audit/dlq',
) {
  const fetch = vi.fn(async (request: Request) =>
    handler(new URL(request.url)),
  );
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'dlq-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>Login destination</p> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                element: <RequireAuditRead />,
                children: [
                  { path: '/audit/dlq', element: <DlqListPage /> },
                  { path: '/audit/dlq/:eventId', element: <DlqDetailPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { fetch, router };
}
describe('DLQ list and details', () => {
  it('loads the authenticated list, shows all required columns, and links producer IDs to real details', async () => {
    const { fetch, router } = mount();
    const table = await screen.findByRole('table');
    for (const label of [
      'Event ID',
      'Event type',
      'Failure reason',
      'Retry count',
      'Failed at',
      'Correlation ID',
    ])
      expect(
        within(table).getByRole('columnheader', { name: label }),
      ).toBeInTheDocument();
    for (const value of [
      'failed + event',
      'USER_LOGIN',
      'transient_persistence',
      '3',
      record.envelope.failedAt,
      'flow-one',
    ])
      expect(within(table).getByText(value)).toBeInTheDocument();
    expect(table.parentElement).toHaveAttribute('tabindex', '0');
    const request = fetch.mock.calls[0]![0];
    expect(request.headers.get('Authorization')).toBe('Bearer dlq-token');
    expect([...new URL(request.url).searchParams]).toEqual([
      ['page', '1'],
      ['limit', '25'],
    ]);
    await userEvent
      .setup()
      .click(within(table).getByRole('link', { name: record.eventId! }));
    const summary = await screen.findByRole('region', {
      name: 'Failure summary',
    });
    expect(summary).toHaveTextContent(record.id);
    expect(summary).toHaveTextContent('pending');
    expect(router.state.location.pathname).toBe(
      `/audit/dlq/${encodeURIComponent(record.eventId!)}`,
    );
    const detail = new URL(fetch.mock.calls[1]![0].url);
    expect(detail.pathname).toBe(
      `/audit/dlq/${encodeURIComponent(record.eventId!)}`,
    );
    expect(detail.search).toBe('');
    expect(
      JSON.parse(screen.getByLabelText('Original event JSON').textContent!),
    ).toEqual(record.envelope.originalEvent);
    expect(document.querySelector('script')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /replay/i }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to dead-letter queue' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
  it('retains page size, supports pagination and restores history', async () => {
    const { router, fetch } = mount(
      (url) => json(page([record], Number(url.searchParams.get('page')), 3, 1)),
      '/audit/dlq?page=1&limit=1',
    );
    await screen.findByText('Page 1 of 3');
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('Page 2 of 3');
    expect(router.state.location.search).toBe('?page=2&limit=1');
    expect(new URL(fetch.mock.calls[1]![0].url).searchParams.get('limit')).toBe(
      '1',
    );
    await act(async () => {
      await router.navigate(-1);
    });
    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
  });
  it('shows empty lists and recovers from out-of-range pages', async () => {
    mount(
      (url) =>
        json(
          page(
            [],
            Number(url.searchParams.get('page')),
            url.searchParams.get('page') === '9' ? 1 : 0,
          ),
        ),
      '/audit/dlq?page=9',
    );
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'First page' }));
    expect(
      await screen.findByText('No failed events in the dead-letter queue.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
  it.each([
    '?page=0',
    '?page=1&page=2',
    '?limit=101',
    '?limit=x',
    '?page=9007199254740991&limit=100',
  ])('blocks invalid pagination %s', (search) => {
    const { fetch } = mount(undefined, `/audit/dlq${search}`);
    expect(screen.getByRole('alert')).toHaveTextContent('positive page');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('hides prior rows when another page is loading', async () => {
    const { router } = mount((url) =>
      url.searchParams.get('page') === '2'
        ? new Promise<Response>(() => {})
        : json(page([record], 1, 26)),
    );
    await screen.findByRole('table');
    await act(async () => {
      await router.navigate('/audit/dlq?page=2');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading dead-letter queue',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('hides previous details when another event loads', async () => {
    const { router } = mount(
      (url) =>
        url.pathname.endsWith('/pending')
          ? new Promise<Response>(() => {})
          : json(record),
      '/audit/dlq/first',
    );
    await screen.findByRole('region', { name: 'Failure summary' });
    await act(async () => {
      await router.navigate('/audit/dlq/pending');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading failed event',
    );
    expect(
      screen.queryByRole('region', { name: 'Failure summary' }),
    ).not.toBeInTheDocument();
  });
  it.each([401, 403, 503])(
    'handles list HTTP %s and retries',
    async (status) => {
      let failed = true;
      mount(() =>
        failed ? json({ message: 'internal' }, status) : json(page()),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 401
          ? 'Please sign in again'
          : status === 403
            ? 'do not have permission'
            : 'service is unavailable',
      );
      expect(screen.queryByText('internal')).not.toBeInTheDocument();
      failed = false;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry dead-letter queue' }));
      expect(await screen.findByRole('table')).toBeInTheDocument();
    },
  );
  it.each([401, 403, 404, 503])(
    'handles detail HTTP %s and retries',
    async (status) => {
      let failed = true;
      mount(
        () => (failed ? json({}, status) : json(record)),
        '/audit/dlq/missing',
      );
      await screen.findByRole('alert');
      if (status === 404)
        expect(
          screen.getByRole('heading', { name: 'Failed event not found' }),
        ).toBeInTheDocument();
      failed = false;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry failed event' }));
      expect(
        await screen.findByRole('region', { name: 'Failure summary' }),
      ).toBeInTheDocument();
    },
  );
  it.each(['/audit/dlq', '/audit/dlq/event'])(
    'handles network failures at %s',
    async (path) => {
      mount(() => {
        throw new TypeError('offline');
      }, path);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Unable to reach the service',
      );
    },
  );
  it.each(['/audit/dlq', '/audit/dlq/event'])(
    'handles null successful data at %s',
    async (path) => {
      mount(() => json(null), path);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'returned by the service',
      );
    },
  );
  it('supports invalid or omitted payloads without assuming a canonical audit event', async () => {
    mount(
      () =>
        json({
          ...record,
          envelope: {
            ...record.envelope,
            originalEvent: null,
            originalPayloadOmitted: true,
            correlationId: null,
          },
        }),
      '/audit/dlq/event',
    );
    const summary = await screen.findByRole('region', {
      name: 'Failure summary',
    });
    expect(within(summary).getAllByText('Not provided')).toHaveLength(2);
    expect(
      screen.getByText(
        'The service omitted the original payload for credential protection.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Original event JSON')).toHaveTextContent(
      'null',
    );
  });
  it('shows fallbacks for non-object failure payloads and unassigned IDs', async () => {
    mount(() =>
      json(
        page([
          {
            ...record,
            eventId: null,
            envelope: {
              ...record.envelope,
              originalEvent: ['invalid'],
              correlationId: null,
            },
          },
        ]),
      ),
    );
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Not provided')).toHaveLength(3);
    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
  });
  it('rejects blank event IDs without a request', () => {
    const { fetch } = mount(undefined, '/audit/dlq/%20');
    expect(screen.getByRole('alert')).toHaveTextContent('nonblank');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['/audit/dlq', '/audit/dlq/event'])(
    'hides DLQ navigation and prevents requests without read permission at %s',
    (path) => {
      auth.user['https://audit-trail.example.com/permissions'] = [
        'audit:manage',
        'audit:replay',
      ];
      const { fetch } = mount(undefined, path);
      expect(
        screen.getByRole('heading', { name: 'Audit access restricted' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: 'Dead-letter queue' }),
      ).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('allows read-only users to see DLQ navigation without replay permission', async () => {
    mount();
    await screen.findByRole('table');
    expect(
      screen.getByRole('link', { name: 'Dead-letter queue' }),
    ).toBeInTheDocument();
  });
  it('redirects signed-out DLQ bookmarks to login', async () => {
    auth.isAuthenticated = false;
    const { fetch, router } = mount(undefined, '/audit/dlq/event');
    expect(await screen.findByText('Login destination')).toBeInTheDocument();
    expect(router.state.location.state).toEqual({
      returnTo: '/audit/dlq/event',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
