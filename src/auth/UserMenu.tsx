import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import { useAppDispatch } from '../hooks/store';
import { baseApi } from '../services/baseApi';
import { tokenSession } from './tokenSession';

export function UserMenu() {
  const { user, logout } = useAuth0();
  const dispatch = useAppDispatch();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function signOut() {
    setPending(true);
    setError('');
    const resumeSession = tokenSession.suspend();
    dispatch(baseApi.util.resetApiState());
    try {
      await logout({ logoutParams: { returnTo: window.location.origin } });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to log out. Please try again.',
      );
      resumeSession();
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="user-menu">
      <span aria-label="Signed-in user">
        {user?.name || user?.email || 'Signed-in user'}
      </span>
      {user?.name && user?.email && <span>{user.email}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          void signOut();
        }}
      >
        {pending ? 'Logging out…' : 'Log out'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
