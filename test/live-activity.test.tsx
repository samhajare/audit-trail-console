import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { DashboardPage } from '../src/features/dashboard/DashboardPage';
import { baseApi } from '../src/services/baseApi';
import type { AuditEventDetail } from '../src/types/audit';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined,
  user: { 'https://audit-trail.example.com/permissions': ['audit:read'] },
}));
vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));
vi.mock('../src/features/flags/useAuditFlag', () => ({
  useAuditFlag: () => true,
}));
afterEach(() => vi.unstubAllGlobals());
const event: AuditEventDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  eventId: 'producer-live',
  schemaVersion: '1.0',
  eventType: 'USER_LOGIN',
  timestamp: '2026-10-04T12:00:00Z',
  createdAt: '2026-10-04T12:00:01Z',
  tenantId: 'tenant-one',
  correlationId: 'flow',
  actor: { id: 'actor' },
  resource: { type: 'session', id: 'session' },
  action: 'arrived live',
  context: { service: 'identity' },
  metadata: {},
  changes: { before: null, after: null },
};
function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
}
describe('live dashboard integration', () => {
  it('starts only on demand, shows events without refresh, avoids duplicates, stops and cleans up on logout', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let recorded = false;
    let cancel = vi.fn();
    const streamRequests: AbortSignal[] = [];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        if (url.pathname === '/audit/stream') {
          streamRequests.push(init!.signal!);
          cancel = vi.fn();
          return new Response(
            new ReadableStream<Uint8Array>({
              start(value) {
                controller = value;
              },
              cancel,
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        if (url.pathname === '/audit/events')
          return json({
            items: recorded ? [event] : [],
            total: recorded ? 1 : 0,
            page: 1,
            limit: 10,
            totalPages: recorded ? 1 : 0,
          });
        return json({
          total: recorded ? 1 : 0,
          byEventType: { USER_LOGIN: recorded ? 1 : 0 },
        });
      },
    );
    vi.stubGlobal('fetch', fetch);
    const session = createTokenSession();
    session.setProvider(async () => 'live-token');
    const store = createAppStore(session);
    const view = render(
      <Provider store={store}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>,
    );
    try {
      await screen.findByText('No recent activity.');
      expect(streamRequests).toHaveLength(0);
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Start live activity' }));
      await screen.findByText('Connection: connected');
      recorded = true;
      await act(async () => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: audit-event\ndata: ${JSON.stringify({ eventId: event.eventId })}\n\n`,
          ),
        );
      });
      const activity = screen.getByRole('region', { name: 'Latest activity' });
      await within(activity).findByRole('link', { name: /arrived live/ });
      expect(within(activity).getAllByRole('listitem')).toHaveLength(1);
      await act(async () => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: audit-event\ndata: ${JSON.stringify({ eventId: event.eventId })}\n\n`,
          ),
        );
      });
      expect(within(activity).getAllByRole('listitem')).toHaveLength(1);
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Stop live activity' }));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(streamRequests[0]!.aborted).toBe(true);
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Start live activity' }));
      await screen.findByText('Connection: connected');
      act(() => {
        session.suspend();
      });
      await waitFor(() => expect(store.getState().live.enabled).toBe(false));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(streamRequests[1]!.aborted).toBe(true);
    } finally {
      view.unmount();
      store.dispatch(baseApi.util.resetApiState());
    }
  });
});
