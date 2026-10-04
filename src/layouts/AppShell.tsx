import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { toggleCompactLayout } from '../app/store/uiSlice';
import { useAppDispatch, useAppSelector } from '../hooks/store';
import { UserMenu } from '../auth/UserMenu';
import { PermissionGate } from '../auth/PermissionGate';

export function AppShell() {
  const compact = useAppSelector((state) => state.ui.compactLayout);
  const dispatch = useAppDispatch();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current !== pathname) {
      main.current?.focus({ preventScroll: true });
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div className={compact ? 'app-shell compact' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <span className="brand">Audit Trail Console</span>
        <nav aria-label="Main navigation">
          <PermissionGate permission="audit:read">
            <NavLink to="/" end>
              Dashboard
            </NavLink>
            <NavLink to="/audit/events">Audit explorer</NavLink>
            <NavLink to="/audit/dlq">Dead-letter queue</NavLink>
          </PermissionGate>
        </nav>
        <UserMenu />
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => dispatch(toggleCompactLayout())}
        >
          Compact layout
        </button>
      </header>
      <main ref={main} id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
