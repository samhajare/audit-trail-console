import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { safeReturnTo } from '../auth/returnTo';

export function LoginPage() {
  const { isLoading, isAuthenticated, error, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [loginError, setLoginError] = useState('');
  const state = location.state as { returnTo?: unknown } | null;
  const returnTo = safeReturnTo(state?.returnTo);
  if (isLoading)
    return (
      <main>
        <p role="status">Checking your session…</p>
      </main>
    );
  if (isAuthenticated && !error) return <Navigate to={returnTo} replace />;
  async function login() {
    setPending(true);
    setLoginError('');
    try {
      await loginWithRedirect({ appState: { returnTo } });
    } catch (cause) {
      setLoginError(
        cause instanceof Error
          ? cause.message
          : 'Unable to start login. Please try again.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="panel">
      <h1>Sign in to Audit Trail Console</h1>
      <p>Sign in to access the console.</p>
      {(loginError || error?.message) && (
        <p role="alert">{loginError || error?.message}</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void login();
        }}
      >
        {pending ? 'Opening login…' : 'Log in'}
      </button>
    </main>
  );
}
