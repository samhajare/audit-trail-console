import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { DashboardPage } from '../src/features/dashboard/DashboardPage';
import { EventDetailUnavailablePage } from '../src/pages/EventDetailUnavailablePage';
import { baseApi } from '../src/services/baseApi';
import type { AuditEventDetail, AuditStatistics } from '../src/types/audit';

const event: AuditEventDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-1',
  schemaVersion: '1.0',
  eventType: 'USER_LOGIN',
  timestamp: '2026-10-04T08:30:00Z',
  createdAt: '2026-10-04T08:31:00Z',
  tenantId: 'tenant-1',
  correlationId: 'flow-1',
  actor: { id: 'actor-1' },
  resource: { type: 'session', id: 'session-1' },
  action: 'signed in',
  changes: { before: null, after: null },
  context: { service: 'identity' },
  metadata: { severity: 'INFO' },
};
function stats(total: number): AuditStatistics {
  return {
    total,
    byEventType: {
      USER_LOGIN: total,
      USER_ROLE_CHANGED: 0,
      DATA_EXPORTED: 0,
      CONFIG_CHANGED: 0,
      PAYMENT_REFUNDED: 0,
    },
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const stores: ReturnType<typeof createAppStore>[] = [];
afterEach(() => {
  stores.forEach((store) => store.dispatch(baseApi.util.resetApiState()));
  stores.length = 0;
  vi.unstubAllGlobals();
});

function mount(handler: (url: URL) => Response | Promise<Response>) {
  const fetch = vi.fn(async (request: Request) =>
    handler(new URL(request.url)),
  );
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'dashboard-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter([
    { path: '/', element: <DashboardPage /> },
    { path: '/audit/events/:id', element: <EventDetailUnavailablePage /> },
  ]);
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { fetch, router };
}
function successfulResponse(url: URL) {
  if (url.pathname.endsWith('/events'))
    return json({
      items: [event],
      total: 300,
      page: 1,
      limit: 10,
      totalPages: 30,
    });
  if (url.searchParams.has('from')) return json(stats(42));
  if (url.searchParams.get('severity') === 'HIGH') return json(stats(8));
  if (url.searchParams.get('severity') === 'ERROR') return json(stats(12));
  if (url.searchParams.get('severity') === 'CRITICAL') return json(stats(3));
  return json(stats(300));
}

describe('dashboard', () => {
  it('loads backend totals and latest records through authenticated RTK Query requests', async () => {
    const { fetch } = mount(successfulResponse);
    await screen.findByRole('link', { name: 'USER LOGIN — signed in' });
    expect(
      within(screen.getByRole('region', { name: 'Events today' })).getByText(
        '42',
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('region', { name: 'High-severity events' }),
      ).getByText('23'),
    ).toBeInTheDocument();
    expect(screen.getByText('300 total events')).toBeInTheDocument();
    expect(screen.getByText('actor-1')).toBeInTheDocument();
    expect(screen.getByText('identity')).toBeInTheDocument();
    const requests = fetch.mock.calls.map(([request]) => request);
    expect(requests).toHaveLength(6);
    expect(
      requests.every(
        (request) =>
          request.headers.get('Authorization') === 'Bearer dashboard-token',
      ),
    ).toBe(true);
    const latest = requests
      .map((request) => new URL(request.url))
      .find((url) => url.pathname.endsWith('/events'));
    expect(latest?.searchParams.get('limit')).toBe('10');
    expect(latest?.searchParams.get('page')).toBe('1');
    const today = requests
      .map((request) => new URL(request.url))
      .find((url) => url.searchParams.has('from'));
    const from = new Date(today!.searchParams.get('from')!);
    const to = new Date(today!.searchParams.get('to')!);
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
    expect(to.getMilliseconds()).toBe(999);
    expect(from.toDateString()).toBe(new Date().toDateString());
  });

  it('shows loading states while backend responses are pending', () => {
    mount(() => new Promise<Response>(() => {}));
    expect(screen.getByRole('status')).toHaveTextContent('Updating dashboard');
    expect(screen.getByText('Loading today’s events…')).toBeInTheDocument();
    expect(screen.getByText('Loading latest activity…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh dashboard' }),
    ).toBeDisabled();
  });

  it('shows genuine empty results with zero counts', async () => {
    mount((url) =>
      url.pathname.endsWith('/events')
        ? json({ items: [], total: 0, page: 1, limit: 10, totalPages: 0 })
        : json(stats(0)),
    );
    expect(await screen.findByText('No recent activity.')).toBeInTheDocument();
    expect(await screen.findByText('No audit events yet.')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Events today' })).getByText(
        '0',
      ),
    ).toBeInTheDocument();
  });

  it.each([401, 403, 503])(
    'renders an explicit HTTP %s error without presenting failed counts as zero',
    async (status) => {
      mount(() => json({ message: 'private backend detail' }, status));
      expect(await screen.findAllByRole('alert')).toHaveLength(4);
      expect(
        screen.queryByText('private backend detail'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
      const expected =
        status === 401
          ? 'Your session is not authorized. Please sign in again.'
          : status === 403
            ? 'You do not have permission to perform this action.'
            : 'The service is unavailable. Please try again later.';
      expect(
        screen
          .getAllByRole('alert')
          .every((alert) => alert.textContent === expected),
      ).toBe(true);
    },
  );

  it('keeps successful panels visible when a severity request fails and supports retry', async () => {
    let fail = true;
    mount((url) =>
      fail && url.searchParams.get('severity') === 'CRITICAL'
        ? json({}, 503)
        : successfulResponse(url),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The service is unavailable',
    );
    expect(
      await screen.findByRole('link', { name: 'USER LOGIN — signed in' }),
    ).toBeInTheDocument();
    const panel = within(
      screen.getByRole('region', { name: 'High-severity events' }),
    );
    expect(panel.queryByText('20')).not.toBeInTheDocument();
    fail = false;
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Retry high-severity events' }),
      );
    expect(await panel.findByText('23')).toBeInTheDocument();
  });

  it('refreshes counts and activity manually', async () => {
    let changed = false;
    mount((url) =>
      changed && url.searchParams.has('from')
        ? json(stats(45))
        : successfulResponse(url),
    );
    await screen.findByRole('link', { name: 'USER LOGIN — signed in' });
    changed = true;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Refresh dashboard' }));
    expect(
      await within(
        screen.getByRole('region', { name: 'Events today' }),
      ).findByText('45'),
    ).toBeInTheDocument();
  });

  it('links using the database id and reaches the reserved detail route', async () => {
    const { router } = mount(successfulResponse);
    const link = await screen.findByRole('link', {
      name: 'USER LOGIN — signed in',
    });
    expect(link).toHaveAttribute('href', `/audit/events/${event.id}`);
    await userEvent.setup().click(link);
    expect(router.state.location.pathname).toBe(`/audit/events/${event.id}`);
    expect(
      screen.getByRole('heading', { name: 'Event details' }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Return to dashboard' }));
    expect(
      await screen.findByRole('heading', { name: 'Audit dashboard' }),
    ).toBeInTheDocument();
  });
});
