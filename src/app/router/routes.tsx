import type { RouteObject } from 'react-router-dom';
import { AppShell } from '../../layouts/AppShell';
import { DashboardPage } from '../../features/dashboard/DashboardPage';
import { EventDetailUnavailablePage } from '../../pages/EventDetailUnavailablePage';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { AuthProviderLayout } from '../../auth/AuthProviderLayout';
import { ProtectedRoute } from '../../auth/ProtectedRoute';
import { LoginPage } from '../../pages/LoginPage';

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
              { index: true, element: <DashboardPage /> },
              {
                path: 'audit/events/:id',
                element: <EventDetailUnavailablePage />,
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
