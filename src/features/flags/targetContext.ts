import type { LDContext } from 'launchdarkly-js-client-sdk';
export function targetContext(
  user: Record<string, unknown> | undefined,
  tenantClaim: string,
): LDContext | undefined {
  if (typeof user?.sub !== 'string' || !user.sub.trim()) return undefined;
  const tenant = user[tenantClaim];
  const context = { kind: 'user', key: user.sub };
  return typeof tenant === 'string' && tenant.trim()
    ? { kind: 'multi', user: context, tenant: { key: tenant } }
    : context;
}
