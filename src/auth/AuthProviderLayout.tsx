import { Auth0Provider } from '@auth0/auth0-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { env } from '../config/env';
import { AuthSessionBridge } from './AuthSessionBridge';
import { safeReturnTo } from './returnTo';
import { FeatureFlagsProvider } from '../features/flags/FeatureFlagsProvider';

export function AuthProviderLayout() {
  const navigate = useNavigate();
  if (!env.auth0Domain || !env.auth0ClientId) {
    return (
      <main className="panel">
        <h1>Authentication configuration required</h1>
        <p role="alert">
          Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID in your environment,
          then restart the application.
        </p>
      </main>
    );
  }
  return (
    <Auth0Provider
      domain={env.auth0Domain}
      clientId={env.auth0ClientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(env.auth0Audience ? { audience: env.auth0Audience } : {}),
      }}
      onRedirectCallback={(appState) => {
        void navigate(safeReturnTo(appState?.returnTo), { replace: true });
      }}
    >
      <AuthSessionBridge />
      <FeatureFlagsProvider>
        <Outlet />
      </FeatureFlagsProvider>
    </Auth0Provider>
  );
}
