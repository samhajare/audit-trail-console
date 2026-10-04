import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth0ProviderOptions } from '@auth0/auth0-react';
import { routes } from '../src/app/router/routes';
import { createAppStore } from '../src/app/store';
import { tokenSession } from '../src/auth/tokenSession';
import { env } from '../src/config/env';

const auth = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  error: undefined as Error | undefined,
  user: {
    sub: 'auth0|test',
    name: 'Test User',
    email: 'test@example.com',
    'https://audit-trail.example.com/permissions': ['audit:read'] as string[],
  },
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
  getAccessTokenSilently: vi.fn(),
}));
const provider = vi.hoisted(() => ({
  options: undefined as Auth0ProviderOptions | undefined,
}));
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => auth,
  Auth0Provider: (options: Auth0ProviderOptions) => {
    provider.options = options;
    return options.children;
  },
}));
vi.mock('../src/config/env', () => ({
  env: {
    auth0Domain: 'test.auth0.com',
    auth0ClientId: 'test-client',
    auth0Audience: 'https://test-api.example.com',
    auth0PermissionsClaim: 'https://audit-trail.example.com/permissions',
    apiBaseUrl: 'http://localhost:3000',
  },
}));

// Auth/shell tests isolate dashboard HTTP behavior, covered in dashboard.test.tsx.
vi.mock('../src/features/dashboard/dashboardApi', () => ({
  useDashboardStatisticsQuery: () => ({
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useLatestAuditActivityQuery: () => ({
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

beforeEach(() => {
  auth.isLoading = false;
  auth.isAuthenticated = true;
  auth.error = undefined;
  auth.user['https://audit-trail.example.com/permissions'] = ['audit:read'];
  auth.loginWithRedirect.mockReset().mockResolvedValue(undefined);
  auth.logout.mockReset().mockResolvedValue(undefined);
  auth.getAccessTokenSilently.mockReset().mockResolvedValue('test-token');
});

function renderApp(path = '/') {
  const store = createAppStore();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { store, router };
}

describe('application foundation', () => {
  it('marks detail navigation active and focuses content after path changes', async () => {
    const { router } = renderApp('/missing');
    await act(async () => {
      await router.navigate('/audit/events/invalid-id');
    });
    expect(
      screen.getByRole('link', { name: 'Audit explorer' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('main')).toHaveFocus();
    await act(async () => {
      await router.navigate('/audit/dlq/%20');
    });
    expect(
      screen.getByRole('link', { name: 'Dead-letter queue' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main')).toHaveFocus();
  });
  it('preserves keyboard focus for query-only navigation and provides a skip target', async () => {
    const { router } = renderApp('/audit/events/invalid-id');
    const compact = screen.getByRole('button', { name: 'Compact layout' });
    compact.focus();
    await act(async () => {
      await router.navigate('/audit/events/invalid-id?view=metadata');
    });
    expect(compact).toHaveFocus();
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });
  it('renders the home route within the application shell', () => {
    renderApp();
    expect(
      screen.getByRole('heading', { name: 'Audit dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeInTheDocument();
  });

  it('renders unknown routes and navigates back home', async () => {
    const user = userEvent.setup();
    renderApp('/missing/nested');
    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Return home' }));
    expect(
      await screen.findByRole('heading', { name: 'Audit dashboard' }),
    ).toBeInTheDocument();
  });

  it('updates the layout preference through Redux', async () => {
    const user = userEvent.setup();
    const { store } = renderApp();
    const button = screen.getByRole('button', { name: 'Compact layout' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(store.getState().ui.compactLayout).toBe(true);
    await user.click(button);
    expect(store.getState().ui.compactLayout).toBe(false);
  });
});

describe('Auth0 integration', () => {
  it('protects timeline bookmarks and preserves pagination in the return path', async () => {
    auth.isAuthenticated = false;
    const path = '/audit/timeline/flow?page=2&limit=25';
    renderApp(path);
    await screen.findByRole('heading', {
      name: 'Sign in to Audit Trail Console',
    });
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: path },
    });
  });
  it('protects direct event detail bookmarks and preserves their return path', async () => {
    auth.isAuthenticated = false;
    const path = '/audit/events/00000000-0000-4000-8000-000000000001';
    renderApp(path);
    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to Audit Trail Console',
      }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: path },
    });
  });
  it('protects bookmarked explorer searches and preserves their return path', async () => {
    auth.isAuthenticated = false;
    renderApp('/audit/events?actor=test&page=2');
    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to Audit Trail Console',
      }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/audit/events?actor=test&page=2' },
    });
  });
  it('shows login instead of the protected shell and preserves the requested path', async () => {
    auth.isAuthenticated = false;
    const user = userEvent.setup();
    renderApp('/missing?view=all#content');
    expect(
      await screen.findByRole('heading', {
        name: 'Sign in to Audit Trail Console',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(auth.loginWithRedirect).toHaveBeenCalledWith({
      appState: { returnTo: '/missing?view=all#content' },
    });
  });

  it('does not flash protected content or login while checking the session', () => {
    auth.isLoading = true;
    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Checking your session',
    );
    expect(
      screen.queryByRole('heading', { name: 'Audit dashboard' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Log in' }),
    ).not.toBeInTheDocument();
  });

  it('shows authenticated identity and logs out with the configured return URL', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByLabelText('Signed-in user')).toHaveTextContent(
      'Test User',
    );
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    await expect(tokenSession.getToken()).resolves.toBe('test-token');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(auth.logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
    await expect(tokenSession.getToken()).rejects.toThrow('Sign in');
  });

  it('shows SDK errors and denies protected content', () => {
    auth.error = new Error('Session could not be restored');
    renderApp();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Session could not be restored',
    );
    expect(
      screen.queryByRole('heading', { name: 'Audit dashboard' }),
    ).not.toBeInTheDocument();
  });

  it('shows login failures and allows retry', async () => {
    auth.isAuthenticated = false;
    auth.loginWithRedirect.mockRejectedValueOnce(
      new Error('Login unavailable'),
    );
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Login unavailable');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });

  it('shows logout failures and restores token access for retry', async () => {
    auth.logout.mockRejectedValueOnce(new Error('Logout unavailable'));
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Logout unavailable');
    await expect(tokenSession.getToken()).resolves.toBe('test-token');
  });

  it('configures the provider and restores a safe path after callback', async () => {
    const { router } = renderApp();
    expect(provider.options).toMatchObject({
      domain: 'test.auth0.com',
      clientId: 'test-client',
      authorizationParams: {
        audience: 'https://test-api.example.com',
        redirect_uri: window.location.origin,
      },
    });
    await act(async () => {
      provider.options?.onRedirectCallback?.({ returnTo: '/missing?view=all' });
    });
    expect(router.state.location.pathname).toBe('/missing');
    await act(async () => {
      provider.options?.onRedirectCallback?.({
        returnTo: '//external.example.com',
      });
    });
    expect(router.state.location.pathname).toBe('/');
  });

  it('allows sign-in without requesting an API audience when it is blank', () => {
    const original = env.auth0Audience;
    env.auth0Audience = '';
    try {
      renderApp('/login');
      expect(provider.options).toHaveProperty('authorizationParams', {
        redirect_uri: window.location.origin,
      });
    } finally {
      env.auth0Audience = original;
    }
  });

  it('shows a configuration error without mounting Auth0 when configuration is absent', () => {
    const original = env.auth0Domain;
    env.auth0Domain = '';
    try {
      renderApp();
      expect(
        screen.getByRole('heading', {
          name: 'Authentication configuration required',
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Log in' }),
      ).not.toBeInTheDocument();
    } finally {
      env.auth0Domain = original;
    }
  });

  it('redirects authenticated users away from login', async () => {
    renderApp('/login');
    expect(
      await screen.findByRole('heading', { name: 'Audit dashboard' }),
    ).toBeInTheDocument();
  });
});
