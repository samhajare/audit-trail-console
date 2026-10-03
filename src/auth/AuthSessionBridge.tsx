import { useAuth0 } from '@auth0/auth0-react';
import { useLayoutEffect } from 'react';
import { useAppDispatch } from '../hooks/store';
import { baseApi } from '../services/baseApi';
import { tokenSession } from './tokenSession';

export function AuthSessionBridge() {
  const { isAuthenticated, isLoading, error, user, getAccessTokenSilently } =
    useAuth0();
  const dispatch = useAppDispatch();
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
    getAccessTokenSilently,
    dispatch,
  ]);
  return null;
}
