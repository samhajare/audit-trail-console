import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { AuditExplorerPage } from '../src/features/audit/AuditExplorerPage';
import { EventDetailPage } from '../src/features/audit/EventDetailPage';
import { baseApi } from '../src/services/baseApi';
import type { AuditEventDetail } from '../src/types/audit';

const event: AuditEventDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-id',
  schemaVersion: '1.0',
  eventType: 'USER_LOGIN',
  timestamp: '2026-10-04T10:00:00Z',
  createdAt: '2026-10-04T10:01:00Z',
  tenantId: 'tenant-1',
  correlationId: 'flow-1',
  actor: { id: 'actor-1' },
  action: 'login',
  resource: { type: 'session', id: 'session-1' },
  changes: { before: null, after: null },
  context: { service: 'identity' },
  metadata: { severity: 'INFO' },
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function page(url: URL, items = [event], total = 60) {
  const limit = Number(url.searchParams.get('limit'));
  return json({
    items,
    total,
    page: Number(url.searchParams.get('page')),
    limit,
    totalPages: Math.ceil(total / limit),
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
  path = '/audit/events',
  handler: (url: URL) => Response | Promise<Response> = page,
) {
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    return url.pathname === `/audit/events/${event.id}`
      ? json(event)
      : handler(url);
  });
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'explorer-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [
      { path: '/audit/events', element: <AuditExplorerPage /> },
      { path: '/audit/events/:id', element: <EventDetailPage /> },
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

describe('audit explorer', () => {
  it('keeps search and pagination usable with a million-event total and a full 100-row page', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      ...event,
      id: `database-${index}`,
      actor: { id: `actor-${index}` },
    }));
    const { fetch, router } = mount('/audit/events?limit=100', (url) =>
      page(url, items, 1_000_000),
    );
    await screen.findByText(`${(1_000_000).toLocaleString()} matching events`);
    expect(screen.getAllByRole('row')).toHaveLength(101);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Actor'), 'actor-99');
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await screen.findByText('Page 1 of 10000');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(new URLSearchParams(router.state.location.search).get('actor')).toBe(
      'actor-99',
    );
    expect(new URLSearchParams(router.state.location.search).get('page')).toBe(
      '2',
    );
    expect(new URLSearchParams(router.state.location.search).get('limit')).toBe(
      '100',
    );
  });
  it('requests an authenticated page and renders all columns and database-id links', async () => {
    const { fetch, router } = mount();
    const link = await screen.findByRole('link', { name: 'USER LOGIN' });
    const table = screen.getByRole('table');
    for (const label of [
      'Timestamp',
      'Event type',
      'Actor',
      'Action',
      'Resource',
      'Service',
      'Correlation ID',
      'Severity',
    ])
      expect(
        within(table).getByRole('columnheader', { name: label }),
      ).toBeInTheDocument();
    expect(within(table).getByText('actor-1')).toBeInTheDocument();
    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.headers.get('Authorization')).toBe('Bearer explorer-token');
    expect(new URL(request.url).searchParams.toString()).toBe(
      'page=1&limit=25',
    );
    expect(
      screen.getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(link).toHaveAttribute('href', `/audit/events/${event.id}`);
    await userEvent.setup().click(link);
    expect(router.state.location.pathname).toBe(`/audit/events/${event.id}`);
    expect(
      screen.getByRole('heading', { name: 'Event details' }),
    ).toBeInTheDocument();
  });

  it('combines all nine filters on submit, preserves exact text, resets pagination, and writes the URL', async () => {
    const { router, fetch } = mount('/audit/events?page=2&limit=25');
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Event type'), 'USER_LOGIN');
    const fields = {
      Actor: ' actor + qa ',
      'Resource type': 'session',
      'Resource ID': 'session-1',
      Service: 'identity',
      Severity: 'INFO',
      'Correlation ID': 'flow-1',
      From: '2026-10-04T00:00:00+05:30',
      To: '2026-10-04T23:59:59+05:30',
    };
    for (const [label, value] of Object.entries(fields))
      await user.type(screen.getByLabelText(label), value);
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const expected = {
      eventType: 'USER_LOGIN',
      actor: ' actor + qa ',
      resourceType: 'session',
      resourceId: 'session-1',
      service: 'identity',
      severity: 'INFO',
      correlationId: 'flow-1',
      from: fields.From,
      to: fields.To,
      page: '1',
      limit: '25',
    };
    expect(
      Object.fromEntries(new URL(fetch.mock.calls[1]![0].url).searchParams),
    ).toEqual(expected);
    expect(
      Object.fromEntries(new URLSearchParams(router.state.location.search)),
    ).toEqual(expected);
  });

  it('restores bookmarked filters and preserves them on next/previous', async () => {
    const { router } = mount(
      '/audit/events?actor=actor-1&severity=INFO&page=2&limit=25',
    );
    await screen.findByRole('table');
    expect(screen.getByLabelText('Actor')).toHaveValue('actor-1');
    expect(screen.getByLabelText('Severity')).toHaveValue('INFO');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(new URLSearchParams(router.state.location.search).get('actor')).toBe(
      'actor-1',
    );
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('changes page size and resets to page one', async () => {
    const { router } = mount('/audit/events?page=2&limit=25');
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Results per page'));
    await user.type(screen.getByLabelText('Results per page'), '50');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('limit')).toBe(
      '50',
    );
  });

  it('restores applied form values and rows on browser back/forward', async () => {
    const { router } = mount('/audit/events?actor=first', (url) =>
      page(url, [
        { ...event, actor: { id: url.searchParams.get('actor') ?? 'none' } },
      ]),
    );
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Actor'));
    await user.type(screen.getByLabelText('Actor'), 'second');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(
      await screen.findByText('second', { selector: 'td' }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByLabelText('Actor')).toHaveValue('first');
    expect(
      await screen.findByText('first', { selector: 'td' }),
    ).toBeInTheDocument();
    await act(async () => {
      await router.navigate(1);
    });
    expect(screen.getByLabelText('Actor')).toHaveValue('second');
  });

  it('blocks invalid date ranges without changing the URL or requesting data', async () => {
    const { fetch, router } = mount();
    await screen.findByRole('table');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From'), '2026-10-05T00:00:00Z');
    await user.type(screen.getByLabelText('To'), '2026-10-04T00:00:00Z');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(screen.getByRole('alert')).toHaveTextContent('From must be earlier');
    expect(router.state.location.search).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('blocks invalid URL pagination and recovers by applying the form', async () => {
    const { fetch } = mount('/audit/events?page=0&actor=actor-1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Page must be a positive whole number',
    );
    expect(fetch).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Apply filters' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('hides previous rows while new filters are loading', async () => {
    const { router } = mount('/audit/events?actor=first', (url) =>
      url.searchParams.get('actor') === 'pending'
        ? new Promise<Response>(() => {})
        : page(url),
    );
    await screen.findByRole('table');
    await act(async () => {
      await router.navigate('/audit/events?actor=pending');
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading audit events',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows genuine empty results', async () => {
    mount('/audit/events', (url) => page(url, [], 0));
    expect(
      await screen.findByText('No events match these filters.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('recovers from out-of-range pages without losing filters', async () => {
    const { router } = mount('/audit/events?page=9&actor=actor-1', (url) =>
      page(url, Number(url.searchParams.get('page')) > 3 ? [] : [event]),
    );
    await screen.findByText(/No events on this page/);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'First page' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('actor')).toBe(
      'actor-1',
    );
  });

  it.each([401, 403, 503])(
    'displays HTTP %s failures and supports retry',
    async (status) => {
      let failed = true;
      mount('/audit/events', (url) =>
        failed ? json({ message: 'private backend text' }, status) : page(url),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        status === 401
          ? 'Please sign in again'
          : status === 403
            ? 'do not have permission'
            : 'service is unavailable',
      );
      expect(
        screen.queryByText('No events match these filters.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('private backend text'),
      ).not.toBeInTheDocument();
      failed = false;
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Retry audit events' }));
      expect(await screen.findByRole('table')).toBeInTheDocument();
    },
  );

  it('displays network failures', async () => {
    mount('/audit/events', () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to reach the service',
    );
  });
});
