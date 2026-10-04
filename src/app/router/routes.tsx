import type { RouteObject } from 'react-router-dom';
import { AppShell } from '../../layouts/AppShell';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { EventDetailPage } from '../../features/audit/EventDetailPage';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { AuthProviderLayout } from '../../auth/AuthProviderLayout';
import { ProtectedRoute } from '../../auth/ProtectedRoute';
import { LoginPage } from '../../pages/LoginPage';
import { AuditExplorerPage } from '../../features/audit/AuditExplorerPage';
import { TimelinePage } from '../../features/timeline/TimelinePage';
import { RequireAuditRead } from '../../auth/PermissionGate';
import { DlqListPage } from '../../features/dlq/DlqListPage';
import { DlqDetailPage } from '../../features/dlq/DlqDetailPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AuthProviderLayout />,
    children: [
      { path: 'login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                element: <RequireAuditRead />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'audit/events', element: <AuditExplorerPage /> },
                  { path: 'audit/dlq', element: <DlqListPage /> },
                  { path: 'audit/dlq/:eventId', element: <DlqDetailPage /> },
                  {
                    path: 'audit/events/:id',
                    element: <EventDetailPage />,
                  },
                  {
                    path: 'audit/timeline/:correlationId',
                    element: <TimelinePage />,
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
