import { useAuth0 } from '@auth0/auth0-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LDProvider,
  useFlags,
  useLDClient,
} from 'launchdarkly-react-client-sdk';
import {
  initialize,
  type LDClient,
  type LDContext,
} from 'launchdarkly-js-client-sdk';
import { env } from '../../config/env';
import { auditFlagDefaults, FlagContext, type AuditFlag } from './flagContext';
import { targetContext } from './targetContext';

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, error } = useAuth0();
  const authenticated = isAuthenticated && !isLoading && !error;
  const subject = user?.sub;
  const tenantValue: unknown = user?.[env.auth0TenantClaim];
  const tenant = typeof tenantValue === 'string' ? tenantValue : undefined;
  const context = useMemo(
    () =>
      authenticated
        ? targetContext(
            { sub: subject, [env.auth0TenantClaim]: tenant },
            env.auth0TenantClaim,
          )
        : undefined,
    [authenticated, subject, tenant],
  );
  if (!env.launchDarklyClientId || !context)
    return (
      <FlagContext.Provider
        value={{ flags: auditFlagDefaults, status: 'disabled' }}
      >
        {children}
      </FlagContext.Provider>
    );
  return (
    <FlagSession
      key={JSON.stringify([env.launchDarklyClientId, context])}
      context={context}
    >
      {children}
    </FlagSession>
  );
}

function FlagSession({
  context,
  children,
}: {
  context: LDContext;
  children: ReactNode;
}) {
  const [client, setClient] = useState<LDClient>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let ownedClient: LDClient | undefined;
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        ownedClient = initialize(env.launchDarklyClientId, context, {
          streaming: true,
          logger: { error() {}, warn() {}, info() {}, debug() {} },
        });
        return ownedClient.waitForInitialization(5);
      })
      .then(() => {
        if (active && ownedClient) setClient(ownedClient);
      })
      .catch(() => {
        if (active) setFailed(true);
        ownedClient?.close();
      });
    return () => {
      active = false;
      ownedClient?.close();
    };
  }, [context]);
  return (
    <LDProvider
      clientSideID={env.launchDarklyClientId}
      deferInitialization
      context={client ? context : undefined}
      ldClient={client}
      flags={auditFlagDefaults}
      reactOptions={{ useCamelCaseFlagKeys: false }}
    >
      <FlagValues expectedClient={client} failed={failed}>
        {children}
      </FlagValues>
    </LDProvider>
  );
}

function FlagValues({
  expectedClient,
  failed,
  children,
}: {
  expectedClient?: LDClient;
  failed: boolean;
  children: ReactNode;
}) {
  const values = useFlags();
  const client = useLDClient();
  const ready = !!expectedClient && client === expectedClient && !failed;
  const flags = Object.fromEntries(
    (Object.keys(auditFlagDefaults) as AuditFlag[]).map((flag) => [
      flag,
      ready && values[flag] === true,
    ]),
  ) as typeof auditFlagDefaults;
  return (
    <FlagContext.Provider
      value={{ flags, status: failed ? 'error' : ready ? 'ready' : 'loading' }}
    >
      {failed && (
        <p role="alert">
          Feature rollout settings are unavailable. Optional features are
          disabled.
        </p>
      )}
      {children}
    </FlagContext.Provider>
  );
}
