import { useAuth0 } from '@auth0/auth0-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';

export function ProtectedRoute() {
  const { isLoading, isAuthenticated, error } = useAuth0();
  const location = useLocation();
  if (isLoading)
    return (
      <main>
        <p role="status">Checking your session…</p>
      </main>
    );
  if (error)
    return (
      <main className="panel">
        <h1>Authentication failed</h1>
        <p role="alert">{error.message}</p>
        <Link to="/login">Return to login</Link>
      </main>
    );
  if (!isAuthenticated)
    return (
      <Navigate
        to="/login"
        replace
        state={{
          returnTo: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  return <Outlet />;
}
