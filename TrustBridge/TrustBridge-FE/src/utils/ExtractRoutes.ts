import type { JSX } from 'react';
import type { Route } from '../routes/Routes.type';

type ExtractedRoutes = {
  path?: string;
  element?: JSX.Element;
  permissions?: string[];
};

export function extractElementsAndRoutes(routes: Route[]) {
  let result = [] as ExtractedRoutes[];
  routes.forEach((route) => {
    result.push({
      element: route.element,
      path: route.route,
      permissions: route.permissions,
    });
    if (route.children) {
      result = result.concat(extractElementsAndRoutes(route.children));
    }
  });
  return result;
}
