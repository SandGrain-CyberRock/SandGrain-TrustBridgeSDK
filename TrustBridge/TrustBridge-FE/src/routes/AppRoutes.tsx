import { useMemo } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';

import { Layout } from '../component/Layout';
import { allRoutes, authRoutes } from '../routes/Routes';
import { useIsAuthenticated } from '../hooks/useIsAuthenticatedQuery';
import { extractElementsAndRoutes } from '../utils/ExtractRoutes';
import { PAGE_ROUTES } from '../constant/PageRoutes';
import { useInitInfo } from '../feature/Auth/services/InitInfo.service';
import { ChangePassword } from '../feature/Auth/screens/ChangePassword';
import { SetupWizard } from '../feature/Setup/screens/SetupWizard';

const AppRoutes = () => {
  const isAuthenticated = useIsAuthenticated();
  const { data: initAPI } = useInitInfo();

  const routes = useMemo(() => extractElementsAndRoutes(allRoutes), []);
  const accessibleRoutes = routes.filter((route) => {
    if (!route.permissions) return true;
    return route.permissions.every((perm) =>
      initAPI?.permissions.includes(perm),
    );
  });
  const authAccessibleRoutes = authRoutes.map((route) => ({
    ...route,
    element: isAuthenticated ? <Navigate to="/" replace /> : route.element,
  }));

  // Separate the dashboard route (path "/") from other routes
  // Dashboard should be an index route since it has the same path as parent
  const dashboardRoute = accessibleRoutes.find((route) => route.path === '/');
  const otherRoutes = accessibleRoutes.filter((route) => route.path !== '/');

  const element = useRoutes([
    // Auth routes (accessible when NOT authenticated)
    ...authAccessibleRoutes,
    // Protected routes (require authentication)
    {
      path: '/',
      element:
        isAuthenticated === undefined ? (
          <div>Loading...</div>
        ) : isAuthenticated ? (
          <Layout />
        ) : (
          <Navigate to={PAGE_ROUTES.AUTH.LOGIN} replace />
        ),
      children: isAuthenticated
        ? [
            // Dashboard as index route (renders when path is "/")
            ...(dashboardRoute
              ? [{ index: true, element: dashboardRoute.element }]
              : []),
            ...otherRoutes,
            { path: '*', element: <Navigate to="/" replace /> },
          ]
        : [
            {
              path: '*',
              element: <Navigate to={PAGE_ROUTES.AUTH.LOGIN} replace />,
            },
          ],
    },
    {
      path: PAGE_ROUTES.AUTH.CHANGE_PASSWORD,
      element: isAuthenticated ? (
        <ChangePassword />
      ) : (
        <Navigate to={PAGE_ROUTES.AUTH.LOGIN} replace />
      ),
    },
    {
      path: PAGE_ROUTES.AUTH.SETUP,
      element: isAuthenticated ? (
        <SetupWizard />
      ) : (
        <Navigate to={PAGE_ROUTES.AUTH.LOGIN} replace />
      ),
    },
    // Catch-all for any unmatched routes - redirect based on auth status
    {
      path: '*',
      element: isAuthenticated ? (
        <Navigate to="/" replace />
      ) : (
        <Navigate to={PAGE_ROUTES.AUTH.LOGIN} replace />
      ),
    },
  ]);

  return <>{element}</>;
};

export { AppRoutes };
