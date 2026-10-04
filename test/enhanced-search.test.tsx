import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { AuditExplorerPage } from '../src/features/audit/AuditExplorerPage';
import {
  auditFlagDefaults,
  FlagContext,
} from '../src/features/flags/flagContext';
import { baseApi } from '../src/services/baseApi';

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
function response(url: URL) {
  return new Response(
    JSON.stringify({
      items: [],
      total: 0,
      page: Number(url.searchParams.get('page')),
      limit: Number(url.searchParams.get('limit')),
      totalPages: 0,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
function mount(
  path = '/audit/events',
  enabled = true,
  handler: (url: URL) => Response | Promise<Response> = response,
) {
  const fetch = vi.fn(async (request: Request) =>
    handler(new URL(request.url)),
  );
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'search-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [{ path: '/audit/events', element: <AuditExplorerPage /> }],
    { initialEntries: [path] },
  );
  const tree = (flag: boolean) => (
    <Provider store={store}>
      <FlagContext.Provider
        value={{
          flags: { ...auditFlagDefaults, 'audit-new-search': flag },
          status: 'ready',
        }}
      >
        <RouterProvider router={router} />
      </FlagContext.Provider>
    </Provider>
  );
  const view = render(tree(enabled));
  return {
    router,
    fetch,
    toggle: (flag: boolean) => view.rerender(tree(flag)),
  };
}
function params(router: ReturnType<typeof createMemoryRouter>) {
  return new URLSearchParams(router.state.location.search);
}
describe('flagged enhanced audit search', () => {
  it('switches old/new UX without changing the URL or duplicating queries', async () => {
    const { toggle, fetch, router } = mount(
      '/audit/events?actor=one&page=3&limit=10',
      false,
    );
    await screen.findByText('No events match these filters.');
    expect(
      screen.queryByRole('region', { name: 'Enhanced audit search' }),
    ).not.toBeInTheDocument();
    const originalUrl = router.state.location.search;
    toggle(true);
    expect(
      screen.getByRole('region', { name: 'Enhanced audit search' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Applied filters' }),
    ).toHaveTextContent('Actor: one');
    expect(screen.getByLabelText('Actor')).toHaveValue('one');
    expect(router.state.location.search).toBe(originalUrl);
    expect(fetch).toHaveBeenCalledTimes(1);
    toggle(false);
    expect(
      screen.queryByRole('button', { name: 'Clear all filters' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Actor')).toHaveValue('one');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('shows all nine active filters and removes one while preserving the others and page size', async () => {
    const initial = new URLSearchParams({
      eventType: 'USER_LOGIN',
      actor: 'one',
      resourceType: 'user',
      resourceId: 'user-one',
      service: 'identity',
      severity: 'WARN',
      correlationId: 'flow',
      from: '2026-10-04T00:00:00Z',
      to: '2026-10-04T23:59:59Z',
      page: '4',
      limit: '50',
    });
    const { router, fetch } = mount(`/audit/events?${initial}`);
    await screen.findByText('No events match these filters.');
    expect(
      within(
        screen.getByRole('list', { name: 'Applied filters' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(9);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Remove Actor filter' }));
    expect(params(router).has('actor')).toBe(false);
    expect(params(router).get('page')).toBe('1');
    expect(params(router).get('limit')).toBe('50');
    expect(params(router).get('service')).toBe('identity');
    expect(
      screen.queryByRole('button', { name: 'Remove Actor filter' }),
    ).not.toBeInTheDocument();
    await screen.findByText('No events match these filters.');
    expect(
      new URL(fetch.mock.calls.at(-1)![0].url).searchParams.get('actor'),
    ).toBeNull();
    await act(async () => {
      await router.navigate(-1);
    });
    expect(
      screen.getByRole('button', { name: 'Remove Actor filter' }),
    ).toBeInTheDocument();
    expect(params(router).get('page')).toBe('4');
  });
  it('clears every filter, retains a valid limit, resets pagination, and updates the original form', async () => {
    const { router } = mount(
      '/audit/events?actor=one&correlationId=flow&severity=WARN&page=4&limit=50',
    );
    await screen.findByText('No events match these filters.');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect([...params(router)]).toEqual([
      ['page', '1'],
      ['limit', '50'],
    ]);
    expect(screen.getByText('No filters applied.')).toBeInTheDocument();
    expect(screen.getByLabelText('Actor')).toHaveValue('');
    expect(screen.getByLabelText('Quick correlation ID search')).toHaveValue(
      '',
    );
  });
  it('recovers from invalid bookmarked filters and pagination using clear-all', async () => {
    const { router, fetch } = mount(
      '/audit/events?eventType=BAD&from=invalid&page=0&limit=200&other=ignored',
    );
    expect(fetch).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Clear all filters' }));
    await screen.findByText('No events match these filters.');
    expect([...params(router)]).toEqual([
      ['page', '1'],
      ['limit', '25'],
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('quick-searches an exact correlation ID while keeping applied filters and ignoring unsubmitted drafts', async () => {
    const { router, fetch } = mount(
      '/audit/events?actor=applied&page=4&limit=10',
    );
    await screen.findByText('No events match these filters.');
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText('Actor'));
    await user.type(screen.getByLabelText('Actor'), 'draft');
    await user.type(
      screen.getByLabelText('Quick correlation ID search'),
      ' flow + refund ',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole('button', { name: 'Search correlation ID' }),
    );
    await screen.findByText('No events match these filters.');
    expect(params(router).get('correlationId')).toBe(' flow + refund ');
    expect(params(router).get('actor')).toBe('applied');
    expect(params(router).get('page')).toBe('1');
    expect(params(router).get('limit')).toBe('10');
    const request = fetch.mock.calls.at(-1)![0];
    expect(request.headers.get('Authorization')).toBe('Bearer search-token');
    expect(new URL(request.url).pathname).toBe('/audit/events');
    expect(new URL(request.url).searchParams.get('correlationId')).toBe(
      ' flow + refund ',
    );
  });
  it('supports quick search with keyboard submission and restores its state on back navigation', async () => {
    const { router } = mount('/audit/events?correlationId=old&limit=10');
    await screen.findByText('No events match these filters.');
    const user = userEvent.setup();
    const input = screen.getByLabelText('Quick correlation ID search');
    await user.clear(input);
    await user.type(input, 'new{Enter}');
    await screen.findByText('No events match these filters.');
    expect(params(router).get('correlationId')).toBe('new');
    await act(async () => {
      await router.navigate(-1);
    });
    expect(screen.getByLabelText('Quick correlation ID search')).toHaveValue(
      'old',
    );
    expect(
      screen.getByRole('list', { name: 'Applied filters' }),
    ).toHaveTextContent('Correlation ID: old');
  });
  it('rejects blank quick searches without changing the URL or making a request', async () => {
    const { router, fetch } = mount();
    await screen.findByText('No events match these filters.');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Search correlation ID' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'nonblank correlation ID',
    );
    expect(router.state.location.search).toBe('');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('shares validation with the existing form instead of bypassing invalid applied date bounds', async () => {
    const { fetch } = mount('/audit/events?from=invalid&correlationId=flow');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Search correlation ID' }));
    const quick = screen.getByRole('form', {
      name: 'Correlation ID quick search',
    });
    expect(within(quick).getByRole('alert')).toHaveTextContent(
      'valid ISO date-time',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('updates chips after the full form is applied and resets page 1', async () => {
    const { router } = mount('/audit/events?page=3');
    await screen.findByText('No events match these filters.');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Service'), 'identity');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));
    await screen.findByText('No events match these filters.');
    expect(
      screen.getByRole('list', { name: 'Applied filters' }),
    ).toHaveTextContent('Service: identity');
    expect(params(router).get('page')).toBe('1');
  });
  it('retains loading, HTTP error and retry behavior in the enhanced UX', async () => {
    let failed = true;
    mount(undefined, true, (url) =>
      failed
        ? new Response('{}', {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        : response(url),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'do not have permission',
    );
    expect(
      screen.getByRole('region', { name: 'Enhanced audit search' }),
    ).toBeInTheDocument();
    failed = false;
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry audit events' }));
    expect(
      await screen.findByText('No events match these filters.'),
    ).toBeInTheDocument();
  });
});
