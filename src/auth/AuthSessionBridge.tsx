import { useAuth0 } from '@auth0/auth0-react';
import { useLayoutEffect } from 'react';
import { useAppDispatch } from '../hooks/store';
import { baseApi } from '../services/baseApi';
import { tokenSession } from './tokenSession';
import { env } from '../config/env';
import { getPermissions } from './permissions';

export function AuthSessionBridge() {
  const { isAuthenticated, isLoading, error, user, getAccessTokenSilently } =
    useAuth0();
  const dispatch = useAppDispatch();
  const tenantValue: unknown = user?.[env.auth0TenantClaim];
  const tenantKey = typeof tenantValue === 'string' ? tenantValue : '';
  const permissionKey = getPermissions(user, env.auth0PermissionsClaim).join(
    '|',
  );
  useLayoutEffect(() => {
    tokenSession.setProvider(
      isAuthenticated && !isLoading && !error
        ? () => getAccessTokenSilently()
        : undefined,
    );
    return () => {
      tokenSession.setProvider(undefined);
      dispatch(baseApi.util.resetApiState());
    };
  }, [
    isAuthenticated,
    isLoading,
    error,
    user?.sub,
    tenantKey,
    permissionKey,
    getAccessTokenSilently,
    dispatch,
  ]);
  return null;
}
