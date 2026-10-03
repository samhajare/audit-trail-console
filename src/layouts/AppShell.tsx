import { NavLink, Outlet } from 'react-router-dom';
import { toggleCompactLayout } from '../app/store/uiSlice';
import { useAppDispatch, useAppSelector } from '../hooks/store';
import { UserMenu } from '../auth/UserMenu';

export function AppShell() {
  const compact = useAppSelector((state) => state.ui.compactLayout);
  const dispatch = useAppDispatch();

  return (
    <div className={compact ? 'app-shell compact' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header>
        <UserMenu />
        <span className="brand">Audit Trail Console</span>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
        </nav>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => dispatch(toggleCompactLayout())}
        >
          Compact layout
        </button>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
