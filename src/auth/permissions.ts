export const auditPermissions = [
  'audit:read',
  'audit:export',
  'audit:view-sensitive',
  'audit:replay',
  'audit:manage',
] as const;

export type AuditPermission = (typeof auditPermissions)[number];

// These claims control presentation only. API authorization belongs to the service.
export function getPermissions(
  claims: unknown,
  claimName: string,
): readonly AuditPermission[] {
  if (
    !claims ||
    typeof claims !== 'object' ||
    !Object.hasOwn(claims, claimName)
  )
    return [];
  const value: unknown = (claims as Record<string, unknown>)[claimName];
  if (
    !Array.isArray(value) ||
    !value.every((item: unknown) => typeof item === 'string')
  )
    return [];
  return auditPermissions.filter((permission) => value.includes(permission));
}

export function hasPermission(
  permissions: readonly AuditPermission[],
  permission: AuditPermission,
): boolean {
  return permissions.includes(permission);
}
