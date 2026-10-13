import { Dashboard } from '../feature/Dashboard/screens/Dashboard';
import { ProfilePage } from '../feature/Profile/screens/ProfilePage';
import { Devices } from '../feature/Devices/screens/Devices';
import { DeviceGroup } from '../feature/Device Group/screens/DeviceGroup';
import { DeviceHierarchy } from '../feature/Device Hierarchy/screens/DeviceHierarchy';
import { DeviceProfile } from '../feature/Device Profile/screens/DeviceProfile';
import { AuthEvents } from '../feature/Auth Events/screens/AuthEvents';
import { CommEvents } from '../feature/Comm Events/screens/CommEvents';
import { AuditLogs } from '../feature/Audit Logs/screens/AuditLogs';
import { Users } from '../feature/Users/screens/Users';
import { Settings } from '../feature/Settings/screens/Settings';
import { Categories } from '../feature/Master Data/Categories/screens/Categories';
import { SubCategories } from '../feature/Master Data/Sub Categories/screens/SubCategories';
import { Tags } from '../feature/Master Data/Tags/screens/Tags';

import type { Route } from './Routes.type';
import { Login } from '../feature/Auth/screens/Login';
import { PAGE_ROUTES } from '../constant/PageRoutes';
import { ForgotPassword } from '../feature/Auth/screens/ForgotPassword';
import { ResetPassword } from '../feature/Auth/screens/ResetPassword';
import { RolesAndPermissions } from '../feature/RBAC/screen/RolesAndPermissions';
import { PERMISSIONS } from '../constant/Permission';
import { TracingLogs } from '../feature/TracingLogs/screens/TracingLogs';
import MqttDocs from '../feature/docs/mqtt/MqttDocs';

export const allRoutes: Route[] = [
  {
    sectionHeading: 'Main',
    children: [
      {
        icon: 'dashboard',
        name: 'Dashboard',
        route: PAGE_ROUTES.DASHBOARD,
        isVisible: true,
        element: <Dashboard />,
      },
      {
        icon: 'devices',
        name: 'Devices',
        isVisible: true,

        children: [
          {
            name: 'Device Enrollment',
            route: PAGE_ROUTES.DEVICE_ENROLLMENT,
            isVisible: true,

            element: <Devices filterStatus="idle" />,
            permissions: [PERMISSIONS.DEVICE_RETRIEVE],
          },
          {
            name: 'Claimed Devices',
            route: PAGE_ROUTES.AUTHENTICATED_DEVICES,
            isVisible: true,

            element: <Devices filterStatus="claimed" />,
            permissions: [PERMISSIONS.DEVICE_RETRIEVE],
          },
          {
            name: 'Active Devices',
            route: PAGE_ROUTES.ACTIVE_DEVICES,
            isVisible: true,

            element: <Devices filterStatus="authenticated" isActive={true} />,
            permissions: [PERMISSIONS.DEVICE_RETRIEVE],
          },
          {
            name: 'Inactive Devices',
            route: PAGE_ROUTES.INACTIVE_DEVICES,
            isVisible: true,

            element: <Devices filterStatus="authenticated" isActive={false} />,
            permissions: [PERMISSIONS.DEVICE_RETRIEVE],
          },
          {
            name: 'Rejected Devices',
            route: PAGE_ROUTES.REJECTED_DEVICES,
            isVisible: true,

            element: <Devices filterStatus="rejected" />,
            permissions: [PERMISSIONS.DEVICE_RETRIEVE],
          },
        ],
      },
      {
        icon: 'hierarchy',
        name: 'Device Hierarchy',
        route: PAGE_ROUTES.DEVICE_HIERARCHY,
        isVisible: true,

        element: <DeviceHierarchy />,
        permissions: [PERMISSIONS.DEVICE_HIERARCHY_RETRIEVE],
      },
    ],
  },
  {
    sectionHeading: 'Master Data',
    children: [
      {
        icon: 'layers',
        name: 'Device Group',
        route: PAGE_ROUTES.DEVICE_GROUP,
        isVisible: true,

        element: <DeviceGroup />,
        permissions: [PERMISSIONS.DEVICE_GROUP_RETRIEVE],
      },
      {
        icon: 'sliders',
        name: 'Device Profile',
        route: PAGE_ROUTES.DEVICE_PROFILE,
        isVisible: true,

        element: <DeviceProfile />,
        permissions: [PERMISSIONS.DEVICE_PROFILE_RETRIEVE],
      },
      {
        icon: 'grid',
        name: 'Categories',
        route: PAGE_ROUTES.MASTER_DATA_CATEGORIES,
        isVisible: true,

        element: <Categories />,
        permissions: [PERMISSIONS.MASTER_DATA_RETRIEVE],
      },
      {
        icon: 'sitemap',
        name: 'Sub Categories',
        route: PAGE_ROUTES.MASTER_DATA_SUB_CATEGORIES,
        isVisible: true,

        element: <SubCategories />,
        permissions: [PERMISSIONS.MASTER_DATA_RETRIEVE],
      },
      {
        icon: 'tag',
        name: 'Tags',
        route: PAGE_ROUTES.MASTER_DATA_TAGS,
        isVisible: true,

        element: <Tags />,
        permissions: [PERMISSIONS.MASTER_DATA_RETRIEVE],
      },
    ],
  },
  {
    sectionHeading: 'Monitoring',
    children: [
      {
        icon: 'shieldTick',
        name: 'Auth Events',
        route: PAGE_ROUTES.AUTH_EVENTS,
        isVisible: true,
        element: <AuthEvents />,
        permissions: [PERMISSIONS.AUTH_EVENTS_RETRIEVE],
      },
      {
        icon: 'sound',
        name: 'Comm Events',
        route: PAGE_ROUTES.COMM_EVENTS,
        isVisible: true,
        element: <CommEvents />,
        permissions: [PERMISSIONS.COMM_EVENTS_RETRIEVE],
      },
      {
        icon: 'clipboardList',
        name: 'Audit Logs',
        route: PAGE_ROUTES.AUDIT_LOGS,
        isVisible: true,

        element: <AuditLogs />,
      },
      {
        icon: 'clipboardList',
        name: 'Tracing Logs',
        route: PAGE_ROUTES.TRACING_LOGS,
        isVisible: true,
        element: <TracingLogs />,
      },
    ],
  },
  {
    sectionHeading: 'Administration',
    children: [
      {
        icon: 'user',
        name: 'Users',
        route: PAGE_ROUTES.USERS,
        isVisible: true,
        element: <Users />,
        permissions: [PERMISSIONS.USER_RETRIEVE],
      },
      {
        icon: 'shieldTick',
        name: 'Roles & Permissions',
        route: PAGE_ROUTES.ROLES_PERMISSIONS,
        isVisible: true,
        element: <RolesAndPermissions />,
        permissions: [PERMISSIONS.ROLES_AND_PERMISSIONS_RETRIEVE],
      },
      {
        icon: 'settings',
        name: 'Settings',
        route: PAGE_ROUTES.SETTINGS,
        isVisible: true,
        element: <Settings />,
        permissions: [PERMISSIONS.SETTING_RETRIEVE],
      },
    ],
  },

  {
    sectionHeading: 'Documentation',
    children: [
      {
        icon: 'sitemap',
        name: 'MQTT Docs',
        route: PAGE_ROUTES.MQTT_DOCS,
        isVisible: true,
        element: <MqttDocs />,
      },
    ],
  },

  {
    icon: 'logout',
    name: 'Logout',
    isVisible: true,
    element: <div>Logout</div>,
  },
  {
    name: 'Profile',
    route: PAGE_ROUTES.PROFILE,
    isVisible: false,
    element: <ProfilePage />,
  },
];

export const authRoutes = [
  {
    path: PAGE_ROUTES.AUTH.LOGIN,
    element: <Login />,
  },
  {
    path: PAGE_ROUTES.AUTH.FORGOT_PASSWORD,
    element: <ForgotPassword />,
  },
  {
    path: PAGE_ROUTES.AUTH.RESET_PASSWORD,
    element: <ResetPassword />,
  },
];
