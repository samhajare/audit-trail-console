import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import type { ProviderConfig } from 'launchdarkly-react-client-sdk';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env';
import { FeatureFlagsProvider } from '../src/features/flags/FeatureFlagsProvider';
import {
  auditFlagDefaults,
  FlagContext,
} from '../src/features/flags/flagContext';
import { useAuditFlag } from '../src/features/flags/useAuditFlag';
import { targetContext } from '../src/features/flags/targetContext';
import { LiveActivity } from '../src/features/live/LiveActivity';
import { DlqReplay } from '../src/features/dlq/DlqReplay';
import { createAppStore } from '../src/app/store';
import { createTokenSession } from '../src/auth/tokenSession';
import { baseApi } from '../src/services/baseApi';
import type { DlqRecord } from '../src/types/dlq';

const fake = vi.hoisted(() => ({
  flags: {} as Record<string, unknown>,
  initialize: vi.fn(),
  provider: undefined as ProviderConfig | undefined,
  auth: {
    isAuthenticated: true,
    isLoading: false,
    error: undefined as Error | undefined,
    user: {} as Record<string, unknown>,
  },
}));
vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => fake.auth }));
vi.mock('launchdarkly-js-client-sdk', () => ({ initialize: fake.initialize }));
vi.mock('launchdarkly-react-client-sdk', async () => {
  const React = await import('react');
  const context = React.createContext<unknown>(undefined);
  return {
    LDProvider: (props: ProviderConfig & { children: ReactNode }) => {
      fake.provider = props;
      return (
        <context.Provider value={props.ldClient}>
          {props.children}
        </context.Provider>
      );
    },
    useFlags: () => fake.flags,
    useLDClient: () => React.useContext(context),
  };
});
const originalId = env.launchDarklyClientId;
const clients: {
  close: ReturnType<typeof vi.fn>;
  waitForInitialization: ReturnType<typeof vi.fn>;
}[] = [];
beforeEach(() => {
  env.launchDarklyClientId = 'public-client-id';
  fake.auth.isAuthenticated = true;
  fake.auth.isLoading = false;
  fake.auth.error = undefined;
  fake.auth.user = {
    sub: 'auth0|one',
    [env.auth0TenantClaim]: 'tenant-one',
    [env.auth0PermissionsClaim]: ['audit:read', 'audit:replay'],
    email: 'not-sent@example.com',
  };
  fake.flags = {};
  fake.provider = undefined;
  fake.initialize.mockReset().mockImplementation(() => {
    const client = {
      close: vi.fn(),
      waitForInitialization: vi.fn(async () => {}),
    };
    clients.push(client);
    return client;
  });
});
afterEach(() => {
  env.launchDarklyClientId = originalId;
  clients.splice(0);
  vi.unstubAllGlobals();
});
// Keep hook order fixed while reading the five supported rollout flags.
function FlagProbe() {
  const live = useAuditFlag('audit-live-stream');
  const replay = useAuditFlag('audit-dlq-replay');
  const search = useAuditFlag('audit-new-search');
  const sensitive = useAuditFlag('audit-sensitive-data-view');
  const dataExport = useAuditFlag('audit-data-export');
  return (
    <p>{JSON.stringify({ live, replay, search, sensitive, dataExport })}</p>
  );
}
describe('LaunchDarkly provider and targeting', () => {
  it('initializes with minimal user/tenant multi-context, preserves exact flag keys, and closes on unmount', async () => {
    fake.flags = { 'audit-new-search': true, 'audit-live-stream': true };
    const view = render(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/"search":true/)).toBeInTheDocument(),
    );
    expect(fake.initialize).toHaveBeenCalledWith(
      'public-client-id',
      {
        kind: 'multi',
        user: { kind: 'user', key: 'auth0|one' },
        tenant: { key: 'tenant-one' },
      },
      expect.objectContaining({ streaming: true }),
    );
    expect(JSON.stringify(fake.initialize.mock.calls[0]![1])).not.toContain(
      'email',
    );
    expect(fake.provider?.reactOptions).toEqual({
      useCamelCaseFlagKeys: false,
    });
    expect(fake.provider?.flags).toEqual(auditFlagDefaults);
    expect(clients[0]!.waitForInitialization).toHaveBeenCalledWith(5);
    view.unmount();
    expect(clients[0]!.close).toHaveBeenCalled();
  });
  it('evaluates all five booleans, supports updates and denies missing or non-boolean values', async () => {
    fake.flags = {
      ...Object.fromEntries(
        Object.keys(auditFlagDefaults).map((flag) => [flag, true]),
      ),
    };
    const view = render(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/"search":true/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/"sensitive":true/)).toBeInTheDocument();
    expect(screen.getByText(/"dataExport":true/)).toBeInTheDocument();
    fake.flags = {
      'audit-new-search': false,
      'audit-live-stream': 'true',
      'audit-dlq-replay': 1,
    };
    view.rerender(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    expect(
      screen.getByText(
        '{"live":false,"replay":false,"search":false,"sensitive":false,"dataExport":false}',
      ),
    ).toBeInTheDocument();
    expect(fake.initialize).toHaveBeenCalledTimes(1);
  });
  it.each(['no-id', 'signed-out', 'loading', 'auth-error', 'no-subject'])(
    'does not initialize during %s',
    (state) => {
      if (state === 'no-id') env.launchDarklyClientId = '';
      if (state === 'signed-out') fake.auth.isAuthenticated = false;
      if (state === 'loading') fake.auth.isLoading = true;
      if (state === 'auth-error') fake.auth.error = new Error('auth failed');
      if (state === 'no-subject') delete fake.auth.user.sub;
      render(
        <FeatureFlagsProvider>
          <FlagProbe />
        </FeatureFlagsProvider>,
      );
      expect(fake.initialize).not.toHaveBeenCalled();
      expect(screen.getByText(/"live":false/)).toBeInTheDocument();
    },
  );
  it('keeps features off during initialization and handles timeout without blocking read content', async () => {
    let reject!: (error: Error) => void;
    const client = {
      close: vi.fn(),
      waitForInitialization: vi.fn(
        () =>
          new Promise<void>((_resolve, fail) => {
            reject = fail;
          }),
      ),
    };
    fake.initialize.mockReturnValue(client);
    fake.flags = { 'audit-live-stream': true };
    render(
      <FeatureFlagsProvider>
        <p>Ordinary read content</p>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    await waitFor(() => expect(fake.initialize).toHaveBeenCalled());
    expect(screen.getByText(/"live":false/)).toBeInTheDocument();
    await act(async () => {
      reject(new Error('secret SDK message'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Optional features are disabled',
    );
    expect(screen.getByText('Ordinary read content')).toBeInTheDocument();
    expect(screen.queryByText('secret SDK message')).not.toBeInTheDocument();
    expect(client.close).toHaveBeenCalled();
  });
  it('closes an initializing client on unmount and ignores late readiness', async () => {
    let resolve!: () => void;
    const client = {
      close: vi.fn(),
      waitForInitialization: vi.fn(
        () =>
          new Promise<void>((done) => {
            resolve = done;
          }),
      ),
    };
    fake.initialize.mockReturnValue(client);
    const view = render(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    await waitFor(() => expect(fake.initialize).toHaveBeenCalled());
    view.unmount();
    await act(async () => {
      resolve();
    });
    expect(client.close).toHaveBeenCalledTimes(1);
  });
  it('handles synchronous SDK failures without crashing the read UI', async () => {
    fake.initialize.mockImplementation(() => {
      throw new Error('bad config');
    });
    render(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'settings are unavailable',
    );
  });
  it('resets flags and closes the old client when user/tenant changes or logs out', async () => {
    fake.flags = { 'audit-new-search': true };
    const view = render(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/"search":true/)).toBeInTheDocument(),
    );
    fake.auth.user = {
      ...fake.auth.user,
      sub: 'auth0|two',
      [env.auth0TenantClaim]: 'tenant-two',
    };
    view.rerender(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText(/"search":false/)).toBeInTheDocument();
    await waitFor(() => expect(fake.initialize).toHaveBeenCalledTimes(2));
    expect(clients[0]!.close).toHaveBeenCalled();
    fake.auth.isAuthenticated = false;
    view.rerender(
      <FeatureFlagsProvider>
        <FlagProbe />
      </FeatureFlagsProvider>,
    );
    expect(clients[1]!.close).toHaveBeenCalled();
    expect(screen.getByText(/"search":false/)).toBeInTheDocument();
  });
  it('uses only the configured tenant claim and supports user-only targeting', () => {
    expect(
      targetContext(
        { sub: 'one', tenantId: 'untrusted', other: 'tenant' },
        'configured',
      ),
    ).toEqual({ kind: 'user', key: 'one' });
    expect(targetContext({ sub: 'one', custom: 'tenant' }, 'custom')).toEqual({
      kind: 'multi',
      user: { kind: 'user', key: 'one' },
      tenant: { key: 'tenant' },
    });
    expect(targetContext({ sub: ' ' }, 'custom')).toBeUndefined();
  });
});

const record: DlqRecord = {
  id: 'record',
  eventId: 'event',
  tenantId: 'tenant',
  createdAt: '2026-10-04T12:00:00Z',
  replayStatus: 'pending',
  envelope: {
    originalEvent: {},
    failureReason: 'transient_persistence',
    retryCount: 3,
    failedAt: '2026-10-04T12:00:00Z',
    sourceTopic: 'audit.events',
    correlationId: 'flow',
  },
};
describe('rollout and permission combination', () => {
  it('disables existing capabilities with false flags and never grants permission with true flags', () => {
    const store = createAppStore();
    const flags = { ...auditFlagDefaults };
    const view = render(
      <Provider store={store}>
        <FlagContext.Provider value={{ flags, status: 'ready' }}>
          <LiveActivity />
          <DlqReplay record={record} />
        </FlagContext.Provider>
      </Provider>,
    );
    expect(
      screen.getByRole('button', { name: 'Start live activity' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Replay event' }),
    ).not.toBeInTheDocument();
    fake.auth.user[env.auth0PermissionsClaim] = [];
    view.rerender(
      <Provider store={store}>
        <FlagContext.Provider
          value={{
            flags: {
              ...flags,
              'audit-live-stream': true,
              'audit-dlq-replay': true,
            },
            status: 'ready',
          }}
        >
          <LiveActivity />
          <DlqReplay record={record} />
        </FlagContext.Provider>
      </Provider>,
    );
    expect(
      screen.getByRole('button', { name: 'Start live activity' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Replay event' }),
    ).not.toBeInTheDocument();
    view.unmount();
    store.dispatch(baseApi.util.resetApiState());
  });
  it('stops a running stream and removes replay confirmation when rollout flags switch off', async () => {
    const cancel = vi.fn();
    const fetch = vi.fn(
      async () =>
        new Response(new ReadableStream({ start() {}, cancel }), {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const session = createTokenSession();
    session.setProvider(async () => 'token');
    const store = createAppStore(session);
    const enabledFlags = {
      ...auditFlagDefaults,
      'audit-live-stream': true,
      'audit-dlq-replay': true,
    };
    const tree = (flags: typeof auditFlagDefaults) => (
      <Provider store={store}>
        <FlagContext.Provider value={{ flags, status: 'ready' }}>
          <LiveActivity />
          <DlqReplay record={record} />
        </FlagContext.Provider>
      </Provider>
    );
    const view = render(tree(enabledFlags));
    try {
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Start live activity' }));
      await screen.findByText('Connection: connected');
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Replay event' }));
      expect(
        screen.getByRole('button', { name: 'Confirm replay' }),
      ).toBeInTheDocument();
      view.rerender(tree(auditFlagDefaults));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(store.getState().live.enabled).toBe(false);
      expect(
        screen.queryByRole('button', { name: 'Confirm replay' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Start live activity' }),
      ).toBeDisabled();
    } finally {
      view.unmount();
      store.dispatch(baseApi.util.resetApiState());
    }
  });
});
