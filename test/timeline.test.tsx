import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { EventDetailPage } from '../src/features/audit/EventDetailPage';
import { TimelinePage } from '../src/features/timeline/TimelinePage';
import { baseApi } from '../src/services/baseApi';
import type { AuditTimelineEvent } from '../src/types/audit';

const event: AuditTimelineEvent = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-one',
  schemaVersion: '1.0',
  eventType: 'USER_LOGIN',
  timestamp: '2026-10-04T10:00:00Z',
  createdAt: '2026-10-04T12:00:00Z',
  tenantId: 'tenant-one',
  correlationId: 'flow + refund',
  actor: { id: 'actor-one' },
  resource: { type: 'user', id: 'user-one' },
  action: 'sign in',
  context: { service: 'identity' },
  metadata: {},
  changes: { before: null, after: null },
};
const later = {
  ...event,
  id: '00000000-0000-4000-8000-000000000002',
  eventId: 'producer-two',
  timestamp: '2026-10-04T16:00:00+05:30',
  action: 'later action',
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(
  items = [event, later],
  pageNumber = 1,
  total = items.length,
  limit = 25,
) {
  return {
    items,
    page: pageNumber,
    total,
    limit,
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
  handler: (url: URL) => Response | Promise<Response> = () => json(page()),
  path = `/audit/timeline/${encodeURIComponent(event.correlationId)}`,
) {
  const fetch = vi.fn(async (request: Request) =>
    handler(new URL(request.url)),
  );
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'timeline-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [
      { path: '/audit/timeline/:correlationId', element: <TimelinePage /> },
      { path: '/audit/events/:id', element: <EventDetailPage /> },
      { path: '/audit/events', element: <p>Explorer destination</p> },
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

describe('correlation timeline', () => {
  it('authenticates, encodes the correlation ID, and presents all required fields in backend chronological order', async () => {
    const { fetch } = mount();
    const list = await screen.findByRole('list', {
      name: 'Events, oldest to newest',
    });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(event.timestamp);
    expect(items[1]).toHaveTextContent(later.timestamp);
    for (const text of [
      'USER LOGIN',
      'actor-one',
      'sign in',
      'user: user-one',
      'identity',
    ])
      expect(items[0]).toHaveTextContent(text);
    const request = fetch.mock.calls[0]![0];
    const url = new URL(request.url);
    expect(url.pathname).toBe(
      `/audit/timeline/${encodeURIComponent(event.correlationId)}`,
    );
    expect([...url.searchParams]).toEqual([
      ['page', '1'],
      ['limit', '25'],
    ]);
    expect(request.headers.get('Authorization')).toBe('Bearer timeline-token');
    expect(within(items[0]!).getByRole('link')).toHaveAttribute(
      'href',
      `/audit/events/${event.id}`,
    );
    expect(within(items[1]!).getByRole('link')).toHaveAttribute(
      'href',
      `/audit/events/${later.id}`,
    );
  });
  it('navigates from a timeline item to its actual details and back through the correlation link', async () => {
    const { router } = mount((url) =>
      json(url.pathname.startsWith('/audit/events/') ? event : page([event])),
    );
    await userEvent
      .setup()
      .click(await screen.findByRole('link', { name: 'USER LOGIN' }));
    expect(
      await screen.findByRole('region', { name: 'Event summary' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/audit/events/${event.id}`);
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: event.correlationId }));
    expect(await screen.findByRole('list')).toBeInTheDocument();
  });
  it('preserves URL pagination and supports next, previous and browser history', async () => {
    const { router, fetch } = mount(
      (url) => json(page([event], Number(url.searchParams.get('page')), 3, 1)),
      '/audit/timeline/flow?limit=1&page=1',
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
    expect(new URL(fetch.mock.calls[1]![0].url).searchParams.get('page')).toBe(
      '2',
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Previous page' }));
    await screen.findByText('Page 1 of 3');
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByText('Page 2 of 3');
  });
  it('hides old results while a new correlation loads', async () => {
    const { router } = mount((url) =>
      url.pathname.endsWith('/pending')
        ? new Promise<Response>(() => {})
        : json(page()),
    );
    await screen.findByRole('list');
    await act(async () => {
      await router.navigate('/audit/timeline/pending');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading correlation timeline',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
  it('shows an empty timeline and disables pagination', async () => {
    mount(() => json(page([])));
    expect(
      await screen.findByText('No events found for this correlation ID.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
  it('recovers from an out-of-range page', async () => {
    mount(
      (url) =>
        json(
          page(
            url.searchParams.get('page') === '9' ? [] : [event],
            Number(url.searchParams.get('page')),
            1,
          ),
        ),
      '/audit/timeline/flow?page=9',
    );
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'First page' }));
    expect(await screen.findByRole('list')).toBeInTheDocument();
  });
  it.each([401, 403, 404, 503])(
    'handles HTTP %s and retries without displaying backend internals',
    async (status) => {
      let failed = true;
      mount(() =>
        failed ? json({ message: 'backend internal' }, status) : json(page()),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 401
          ? 'Please sign in again'
          : status === 403
            ? 'do not have permission'
            : status === 404
              ? 'not found'
              : 'service is unavailable',
      );
      expect(screen.queryByText('backend internal')).not.toBeInTheDocument();
      failed = false;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry timeline' }));
      expect(await screen.findByRole('list')).toBeInTheDocument();
    },
  );
  it('handles network errors', async () => {
    mount(() => {
      throw new TypeError('offline');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the service',
    );
  });
  it.each(['?page=0', '?page=1&page=2', '?limit=101', '?limit=abc'])(
    'blocks invalid pagination %s',
    (search) => {
      const { fetch } = mount(undefined, `/audit/timeline/flow${search}`);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rejects blank correlation IDs without a request', () => {
    const { fetch } = mount(undefined, '/audit/timeline/%20');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('shows a fallback for missing service and an alert for an empty response', async () => {
    const { router } = mount((url) =>
      json(
        url.pathname.endsWith('/empty')
          ? null
          : page([{ ...event, context: {} }]),
      ),
    );
    expect(await screen.findByText('Not provided')).toBeInTheDocument();
    await act(async () => {
      await router.navigate('/audit/timeline/empty');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No timeline data was returned',
    );
  });
});
