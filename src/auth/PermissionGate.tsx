import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { AuditPermission } from './permissions';
import { usePermissions } from './usePermissions';

export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: AuditPermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { has } = usePermissions();
  return has(permission) ? children : fallback;
}

export function RequireAuditRead() {
  const { isLoading } = usePermissions();
  if (isLoading) return <p role="status">Checking your permissions…</p>;
  return (
    <PermissionGate
      permission="audit:read"
      fallback={
        <section className="panel">
          <h1>Audit access restricted</h1>
          <p role="alert">
            Your session does not include the audit:read permission.
          </p>
          <p>
            Contact your administrator to check your access and sign in again
            after it is updated.
          </p>
        </section>
      }
    >
      <Outlet />
    </PermissionGate>
  );
}
