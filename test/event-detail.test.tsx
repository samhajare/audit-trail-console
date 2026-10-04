import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { EventDetailPage } from '../src/features/audit/EventDetailPage';
import { baseApi } from '../src/services/baseApi';
import type { AuditEventDetail } from '../src/types/audit';

const event: AuditEventDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-event',
  schemaVersion: '1.0',
  eventType: 'USER_ROLE_CHANGED',
  timestamp: '2026-10-04T12:00:00.000Z',
  createdAt: '2026-10-04T12:00:01.000Z',
  tenantId: 'tenant-one',
  correlationId: 'role-flow',
  actor: { id: 'actor-one', email: '[MASKED]', role: 'ADMIN' },
  resource: { type: 'user', id: 'user-one' },
  action: 'change role',
  changes: {
    before: { role: 'VIEWER', nested: { enabled: false }, items: [1, null] },
    after: { role: 'ANALYST', nested: { enabled: true }, items: [2, null] },
  },
  context: { service: 'identity', source: 'console' },
  metadata: { severity: 'WARN', note: '<script>unsafe text</script>' },
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
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
    store.dispatch(baseApi.util.resetApiState());
  });
  stores.length = 0;
  vi.unstubAllGlobals();
});

function mount(
  handler: (url: URL) => Response | Promise<Response> = () => json(event),
  path = `/audit/events/${event.id}`,
) {
  const fetch = vi.fn(async (request: Request) =>
    handler(new URL(request.url)),
  );
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'detail-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [
      { path: '/audit/events/:id', element: <EventDetailPage /> },
      { path: '/audit/events', element: <p>Explorer destination</p> },
      { path: '/', element: <p>Dashboard destination</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { router, fetch };
}

describe('event details', () => {
  it('loads a detail record by database UUID with bearer authentication and shows all metadata', async () => {
    const { fetch } = mount();
    const summary = await screen.findByRole('region', {
      name: 'Event summary',
    });
    for (const value of [
      event.eventId,
      event.id,
      event.eventType,
      event.timestamp,
      event.createdAt,
      event.actor.id,
      '[MASKED]',
      'ADMIN',
      event.action,
      event.resource.type,
      event.resource.id,
      'identity',
      event.tenantId,
      event.correlationId,
      'WARN',
      '1.0',
    ])
      expect(within(summary).getByText(value)).toBeInTheDocument();
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(new URL(request.url).pathname).toBe(`/audit/events/${event.id}`);
    expect(new URL(request.url).search).toBe('');
    expect(request.headers.get('Authorization')).toBe('Bearer detail-token');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows distinct before/after snapshots, nested values, context, metadata, and exact raw response data', async () => {
    mount();
    await screen.findByRole('region', { name: 'Before' });
    expect(
      JSON.parse(screen.getByLabelText('Before JSON').textContent!),
    ).toEqual(event.changes.before);
    expect(
      JSON.parse(screen.getByLabelText('After JSON').textContent!),
    ).toEqual(event.changes.after);
    expect(
      JSON.parse(screen.getByLabelText('Context JSON').textContent!),
    ).toEqual(event.context);
    expect(
      JSON.parse(screen.getByLabelText('Metadata JSON').textContent!),
    ).toEqual(event.metadata);
    const summary = screen.getByText('Raw JSON', { selector: 'summary' });
    summary.focus();
    await userEvent.setup().click(summary);
    expect(summary.parentElement).toHaveAttribute('open');
    expect(
      JSON.parse(screen.getByLabelText('Raw event JSON').textContent!),
    ).toEqual(event);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByLabelText('Raw event JSON')).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('distinguishes absent snapshots from provided empty objects', async () => {
    mount(() => json({ ...event, changes: { before: null, after: {} } }));
    expect(
      await screen.findByText('No before snapshot was provided.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Before JSON')).toHaveTextContent('null');
    expect(screen.getByLabelText('After JSON')).toHaveTextContent('{}');
    expect(
      screen.queryByText('No after snapshot was provided.'),
    ).not.toBeInTheDocument();
  });

  it('handles missing optional actor/service/severity fields and empty context without inventing values', async () => {
    mount(() =>
      json({ ...event, actor: { id: 'actor-one' }, context: {}, metadata: {} }),
    );
    const summary = await screen.findByRole('region', {
      name: 'Event summary',
    });
    expect(within(summary).getAllByText('Not provided')).toHaveLength(4);
    expect(screen.getByLabelText('Context JSON')).toHaveTextContent('{}');
  });

  it('shows loading and hides the previous record when the route ID changes', async () => {
    const pendingId = '00000000-0000-4000-8000-000000000002';
    const { router } = mount((url) =>
      url.pathname.endsWith(pendingId)
        ? new Promise<Response>(() => {})
        : json(event),
    );
    await screen.findByRole('region', { name: 'Event summary' });
    await act(async () => {
      await router.navigate(`/audit/events/${pendingId}`);
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading event details',
    );
    expect(
      screen.queryByRole('region', { name: 'Event summary' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(event.eventId)).not.toBeInTheDocument();
  });

  it('shows not-found state for a missing or inaccessible event', async () => {
    mount(() => json({}, 404));
    expect(
      await screen.findByRole('heading', { name: 'Event not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The requested resource was not found',
    );
    expect(screen.queryByLabelText('Raw event JSON')).not.toBeInTheDocument();
  });

  it.each([401, 403, 503])(
    'shows HTTP %s failures and supports retry without exposing backend error bodies',
    async (status) => {
      let failed = true;
      mount(() =>
        failed ? json({ message: 'internal detail' }, status) : json(event),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 401
          ? 'Please sign in again'
          : status === 403
            ? 'do not have permission'
            : 'service is unavailable',
      );
      expect(screen.queryByText('internal detail')).not.toBeInTheDocument();
      failed = false;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry event details' }));
      expect(
        await screen.findByRole('region', { name: 'Event summary' }),
      ).toBeInTheDocument();
    },
  );

  it('shows network failures', async () => {
    mount(() => {
      throw new TypeError('Fetch failure');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the service',
    );
  });

  it('handles an empty successful response', async () => {
    mount(() => json(null));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No event data was returned',
    );
  });

  it('rejects malformed route IDs before making a request', () => {
    const { fetch } = mount(undefined, '/audit/events/not-a-uuid');
    expect(
      screen.getByRole('heading', { name: 'Invalid event ID' }),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('provides explicit explorer and dashboard navigation for direct bookmarks', async () => {
    const { router } = mount();
    await screen.findByRole('region', { name: 'Event summary' });
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to audit explorer' }));
    expect(router.state.location.pathname).toBe('/audit/events');
    expect(await screen.findByText('Explorer destination')).toBeInTheDocument();
  });
});
