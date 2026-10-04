import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { PermissionGate, RequireAuditRead } from '../src/auth/PermissionGate';
import {
  auditPermissions,
  getPermissions,
  hasPermission,
} from '../src/auth/permissions';
import { env } from '../src/config/env';
import { AuditExplorerPage } from '../src/features/audit/AuditExplorerPage';
import { EventDetailPage } from '../src/features/audit/EventDetailPage';
import { DashboardPage } from '../src/features/dashboard/DashboardPage';
import { TimelinePage } from '../src/features/timeline/TimelinePage';
import { AppShell } from '../src/layouts/AppShell';
import { baseApi } from '../src/services/baseApi';
import { AuthSessionBridge } from '../src/auth/AuthSessionBridge';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  error: undefined as Error | undefined,
  user: {} as Record<string, unknown>,
  logout: vi.fn(),
  getAccessTokenSilently: vi.fn(async () => 'permission-token'),
}));
const authUpdates = vi.hoisted(() => ({
  version: 0,
  listeners: new Set<() => void>(),
}));
vi.mock('@auth0/auth0-react', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth0: () => {
      useSyncExternalStore(
        (listener) => {
          authUpdates.listeners.add(listener);
          return () => authUpdates.listeners.delete(listener);
        },
        () => authUpdates.version,
      );
      return auth;
    },
  };
});
const claim = 'https://audit-trail.example.com/permissions';
const cacheProbeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    permissionCacheProbe: builder.query<{ sensitive: string }, void>({
      query: () => '/test-only',
    }),
  }),
});
const stores: ReturnType<typeof createAppStore>[] = [];
beforeEach(() => {
  auth.isAuthenticated = true;
  auth.isLoading = false;
  auth.error = undefined;
  auth.user = { sub: 'auth0|reader', [claim]: [] };
});
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
  path: string,
  handler: () => Response = () => {
    throw new Error('Unexpected API request');
  },
) {
  const fetch = vi.fn(async () => handler());
  vi.stubGlobal('fetch', fetch);
  const session = createTokenSession();
  session.setProvider(async () => 'permission-token');
  const store = createAppStore(session);
  stores.push(store);
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          {
            element: <RequireAuditRead />,
            children: [
              { path: '/', element: <DashboardPage /> },
              { path: '/audit/events', element: <AuditExplorerPage /> },
              { path: '/audit/events/:id', element: <EventDetailPage /> },
              {
                path: '/audit/timeline/:correlationId',
                element: <TimelinePage />,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  const view = (
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  );
  render(view);
  return {
    fetch,
    refresh: () =>
      act(() => {
        authUpdates.version += 1;
        authUpdates.listeners.forEach((listener) => listener());
      }),
  };
}

describe('permission claims', () => {
  it('recognizes all five exact permission values and removes duplicates/unknown values', () => {
    const permissions = getPermissions(
      {
        [claim]: [...auditPermissions, 'audit:*', 'AUDIT_ADMIN', 'audit:read'],
      },
      claim,
    );
    expect(permissions).toEqual(auditPermissions);
    for (const permission of auditPermissions)
      expect(hasPermission(permissions, permission)).toBe(true);
    expect(hasPermission(['audit:manage'], 'audit:read')).toBe(false);
  });
  it.each([
    undefined,
    null,
    {},
    { [claim]: 'audit:read' },
    { [claim]: ['audit:read', 1] },
    { roles: ['AUDIT_ADMIN'], scope: 'audit:read' },
    { permissions: ['audit:read'] },
  ])('denies missing or malformed configured claims: %j', (claims) => {
    expect(getPermissions(claims, claim)).toEqual([]);
  });
  it('reads only the configured claim and ignores inherited properties', () => {
    expect(getPermissions({ custom: ['audit:replay'] }, 'custom')).toEqual([
      'audit:replay',
    ]);
    expect(
      getPermissions(Object.create({ [claim]: ['audit:read'] }), claim),
    ).toEqual([]);
  });
});

describe('permission rendering', () => {
  it.each(['permissions', 'tenant'])(
    'clears cached responses when the same user changes %s',
    async (change) => {
      auth.user[claim] = ['audit:read', 'audit:view-sensitive'];
      auth.user[env.auth0TenantClaim] = 'tenant-one';
      const store = createAppStore();
      stores.push(store);
      const rendered = render(
        <Provider store={store}>
          <AuthSessionBridge />
        </Provider>,
      );
      await act(async () => {
        await store.dispatch(
          cacheProbeApi.util.upsertQueryData(
            'permissionCacheProbe',
            undefined,
            {
              sensitive: 'previous response',
            },
          ),
        );
      });
      expect(
        cacheProbeApi.endpoints.permissionCacheProbe.select()(store.getState())
          .data,
      ).toEqual({ sensitive: 'previous response' });
      if (change === 'permissions') auth.user[claim] = ['audit:read'];
      else auth.user[env.auth0TenantClaim] = 'tenant-two';
      rendered.rerender(
        <Provider store={store}>
          <AuthSessionBridge />
        </Provider>,
      );
      expect(
        cacheProbeApi.endpoints.permissionCacheProbe.select()(store.getState())
          .data,
      ).toBeUndefined();
    },
  );
  it.each(auditPermissions)(
    'shows %s content only for its exact permission',
    (permission) => {
      const view = (
        <PermissionGate permission={permission} fallback={<p>Unavailable</p>}>
          <button>Capability</button>
        </PermissionGate>
      );
      const rendered = render(view);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      auth.user[claim] = [permission];
      rendered.rerender(
        <PermissionGate permission={permission} fallback={<p>Unavailable</p>}>
          <button>Capability</button>
        </PermissionGate>,
      );
      expect(screen.getByRole('button')).toBeEnabled();
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    },
  );
  it.each([
    '/',
    '/audit/events?actor=one',
    '/audit/events/00000000-0000-4000-8000-000000000001',
    '/audit/timeline/flow?page=2',
  ])('blocks direct read bookmarks and hides navigation at %s', (path) => {
    const { fetch } = mount(path);
    expect(
      screen.getByRole('heading', { name: 'Audit access restricted' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('audit:read');
    expect(
      screen.queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Audit explorer' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps backend 403 authoritative even when the user claim grants read', async () => {
    auth.user[claim] = ['audit:read'];
    const { fetch } = mount(
      '/audit/events',
      () =>
        new Response(JSON.stringify({ message: 'backend internals' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'do not have permission',
    );
    expect(screen.queryByText('backend internals')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Audit explorer' }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Retry audit events' }));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('removes mounted content when read permission is revoked', async () => {
    auth.user[claim] = ['audit:read'];
    const { refresh } = mount(
      '/audit/events',
      () =>
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            limit: 25,
            totalPages: 0,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await screen.findByText('No events match these filters.');
    auth.user[claim] = [];
    refresh();
    expect(
      screen.getByRole('heading', { name: 'Audit access restricted' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Audit explorer' }),
    ).not.toBeInTheDocument();
  });
  it.each(['loading', 'signed-out', 'error'])(
    'does not grant permissions from stale user claims during %s',
    (state) => {
      auth.user[claim] = ['audit:read'];
      auth.isLoading = state === 'loading';
      auth.isAuthenticated = state !== 'signed-out';
      auth.error = state === 'error' ? new Error('session failed') : undefined;
      render(
        <PermissionGate permission="audit:read">
          <button>Protected capability</button>
        </PermissionGate>,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );
  it('supports a configured namespaced claim without falling back to another claim', () => {
    const original = env.auth0PermissionsClaim;
    env.auth0PermissionsClaim = 'https://company.example/permissions';
    try {
      auth.user[claim] = ['audit:read'];
      const rendered = render(
        <PermissionGate permission="audit:read">
          <p>Allowed</p>
        </PermissionGate>,
      );
      expect(screen.queryByText('Allowed')).not.toBeInTheDocument();
      auth.user[env.auth0PermissionsClaim] = ['audit:read'];
      rendered.rerender(
        <PermissionGate permission="audit:read">
          <p>Allowed</p>
        </PermissionGate>,
      );
      expect(screen.getByText('Allowed')).toBeInTheDocument();
    } finally {
      env.auth0PermissionsClaim = original;
    }
  });
});
