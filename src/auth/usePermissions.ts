import { useAuth0 } from '@auth0/auth0-react';
import { env } from '../config/env';
import {
  getPermissions,
  hasPermission,
  type AuditPermission,
} from './permissions';

export function usePermissions() {
  const { user, isAuthenticated, isLoading, error } = useAuth0();
  const permissions =
    isAuthenticated && !isLoading && !error
      ? getPermissions(user, env.auth0PermissionsClaim)
      : [];
  return {
    isLoading,
    has: (permission: AuditPermission) =>
      hasPermission(permissions, permission),
  };
}
