import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { DlqDetailPage } from '../src/features/dlq/DlqDetailPage';
import { baseApi } from '../src/services/baseApi';
import type { DlqRecord } from '../src/types/dlq';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined,
  user: {
    'https://audit-trail.example.com/permissions': [
      'audit:read',
      'audit:replay',
    ],
  },
}));
vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));
vi.mock('../src/features/flags/useAuditFlag', () => ({
  useAuditFlag: () => true,
}));
beforeEach(() => {
  auth.user['https://audit-trail.example.com/permissions'] = [
    'audit:read',
    'audit:replay',
  ];
});
const record: DlqRecord = {
  id: 'failure-record',
  eventId: 'event + one',
  tenantId: 'tenant',
  createdAt: '2026-10-04T12:00:01Z',
  replayStatus: 'pending',
  envelope: {
    originalEvent: { eventType: 'USER_LOGIN', note: '[MASKED]' },
    failureReason: 'transient_persistence',
    retryCount: 3,
    failedAt: '2026-10-04T12:00:00Z',
    sourceTopic: 'audit.events',
    correlationId: 'flow',
  },
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const stores: ReturnType<typeof createAppStore>[] = [];
afterEach(() => {
  stores.forEach((store) => {
    store
      .dispatch(baseApi.util.getRunningQueriesThunk())
      .forEach((query) => query.abort());
    store
      .dispatch(baseApi.util.getRunningMutationsThunk())
      .forEach((mutation) => mutation.abort());
    store.dispatch(baseApi.util.resetApiState());
  });
  stores.length = 0;
  vi.unstubAllGlobals();
});
function mount(
  handler: (request: Request) => Response | Promise<Response> = () =>
    json(
      { eventId: record.eventId, replayId: 'replay-one', status: 'published' },
      202,
    ),
  entry = record,
) {
  let replayed = false;
  const fetch = vi.fn(async (request: Request) => {
    if (request.method === 'POST') {
      const response = await handler(request);
      if (response.status === 202) replayed = true;
      return response;
    }
    const eventId = decodeURIComponent(
      new URL(request.url).pathname.split('/').at(-1)!,
    );
    return json({
      ...entry,
      ...(eventId === record.eventId ? {} : { id: 'second-record', eventId }),
      replayStatus:
        replayed && eventId === record.eventId
          ? 'published'
          : entry.replayStatus,
    });
  });
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'replay-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [{ path: '/audit/dlq/:eventId', element: <DlqDetailPage /> }],
    {
      initialEntries: [
        `/audit/dlq/${encodeURIComponent(entry.eventId ?? 'unknown')}`,
      ],
    },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { fetch, router };
}
async function confirm() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Replay event' }));
  await user.click(screen.getByRole('button', { name: 'Confirm replay' }));
}
describe('DLQ replay', () => {
  it('preserves publication feedback when the subsequent status refresh fails', async () => {
    mount(() => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json({}, 503)),
      );
      return json(
        {
          eventId: record.eventId,
          replayId: 'published-before-refresh',
          status: 'published',
        },
        202,
      );
    });
    await confirm();
    expect(
      await screen.findByText(/published-before-refresh/),
    ).toBeInTheDocument();
    await screen.findByRole('alert');
    expect(screen.getByText(/published-before-refresh/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay event' })).toBeDisabled();
  });
  it('requires explicit confirmation, sends one authenticated empty-body POST, and shows publication feedback', async () => {
    let requestBody: unknown;
    let url: URL | undefined;
    let authorization: string | null = null;
    const { fetch } = mount(async (request) => {
      requestBody = await request.json();
      url = new URL(request.url);
      authorization = request.headers.get('Authorization');
      return json(
        {
          eventId: record.eventId,
          replayId: 'replay-one',
          status: 'published',
        },
        202,
      );
    });
    await screen.findByRole('button', { name: 'Replay event' });
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(0);
    await confirm();
    expect(
      await screen.findByText(/Replay published to Kafka/),
    ).toHaveTextContent('does not confirm eventual persistence');
    expect(requestBody).toEqual({});
    expect(url!.pathname).toBe(
      `/audit/dlq/${encodeURIComponent(record.eventId!)}/replay`,
    );
    expect(url!.search).toBe('');
    expect(authorization).toBe('Bearer replay-token');
    expect(screen.getByRole('button', { name: 'Replay event' })).toBeDisabled();
    await waitFor(() =>
      expect(
        fetch.mock.calls.filter(([request]) => request.method === 'GET').length,
      ).toBeGreaterThan(1),
    );
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(1);
  });
  it('cancels confirmation without a mutation and restores keyboard focus', async () => {
    const { fetch } = mount();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Replay event' }),
    );
    expect(
      screen.getByRole('button', { name: 'Confirm replay' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel replay' }));
    expect(
      screen.queryByRole('region', { name: 'Confirm replay' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay event' })).toHaveFocus();
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(0);
  });
  it('disables controls while pending and prevents repeated submissions', async () => {
    let resolve!: (response: Response) => void;
    const { fetch } = mount(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Replay event' }),
    );
    await user.dblClick(screen.getByRole('button', { name: 'Confirm replay' }));
    expect(screen.getByRole('status')).toHaveTextContent('Publishing replay');
    expect(screen.getByRole('button', { name: 'Replay event' })).toBeDisabled();
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(1);
    await act(async () => {
      resolve(
        json(
          {
            eventId: record.eventId,
            replayId: 'replay-one',
            status: 'published',
          },
          202,
        ),
      );
    });
    await screen.findByText(/Replay published to Kafka/);
  });
  it.each([401, 403, 404, 409, 503])(
    'shows HTTP %s feedback and never retries automatically',
    async (status) => {
      const { fetch } = mount(() =>
        json({ message: 'backend internals' }, status),
      );
      await confirm();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 401
          ? 'Please sign in again'
          : status === 403
            ? 'do not have permission'
            : status === 404
              ? 'not found'
              : status === 409
                ? 'unsupported or already attempted'
                : 'service is unavailable',
      );
      expect(screen.queryByText('backend internals')).not.toBeInTheDocument();
      expect(
        screen.getByText(/Check the refreshed replay status/),
      ).toBeInTheDocument();
      expect(
        fetch.mock.calls.filter(([request]) => request.method === 'POST'),
      ).toHaveLength(1);
    },
  );
  it('shows network failure ambiguity and requires a fresh confirmation for manual retry', async () => {
    let failed = true;
    const { fetch } = mount(() => {
      if (failed) throw new TypeError('offline');
      return json(
        { eventId: record.eventId, replayId: 'retry-one', status: 'published' },
        202,
      );
    });
    await confirm();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the service',
    );
    failed = false;
    await confirm();
    await screen.findByText(/Replay published to Kafka/);
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(2);
  });
  it.each([
    { permissions: [] },
    { permissions: ['audit:read'] },
    { permissions: ['audit:read', 'audit:manage'] },
    { permissions: ['audit:replay'] },
  ])(
    'hides replay without the exact permission %j',
    async ({ permissions }) => {
      auth.user['https://audit-trail.example.com/permissions'] = permissions;
      const { fetch } = mount();
      await screen.findByRole('region', { name: 'Failure summary' });
      expect(
        screen.queryByRole('region', { name: 'Replay failed event' }),
      ).not.toBeInTheDocument();
      expect(
        fetch.mock.calls.filter(([request]) => request.method === 'POST'),
      ).toHaveLength(0);
    },
  );
  it.each(['reserved', 'published', 'failed'] as const)(
    'blocks records with an existing %s replay attempt',
    async (replayStatus) => {
      mount(undefined, { ...record, replayStatus });
      expect(
        await screen.findByRole('button', { name: 'Replay event' }),
      ).toBeDisabled();
      expect(
        screen.getByText(/A replay attempt already exists/),
      ).toBeInTheDocument();
    },
  );
  it('disables replay for an omitted original payload', async () => {
    mount(undefined, {
      ...record,
      envelope: {
        ...record.envelope,
        originalPayloadOmitted: true,
        originalEvent: null,
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Replay event' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/omitted and cannot be replayed/),
    ).toBeInTheDocument();
  });
  it('resets confirmation when navigating to a different failed event', async () => {
    const { router, fetch } = mount();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Replay event' }));
    await act(async () => {
      await router.navigate('/audit/dlq/second-event');
    });
    await screen.findByRole('button', { name: 'Replay event' });
    expect(
      screen.queryByRole('button', { name: 'Confirm replay' }),
    ).not.toBeInTheDocument();
    expect(
      fetch.mock.calls.filter(([request]) => request.method === 'POST'),
    ).toHaveLength(0);
  });
});
