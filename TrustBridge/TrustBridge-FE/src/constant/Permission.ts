export const PERMISSIONS = {
  DEVICE_RETRIEVE: 'device:retrieve',
  DEVICE_CREATE: 'device:create',
  DEVICE_UPDATE: 'device:update',
  DEVICE_DELETE: 'device:delete',

  DEVICE_GROUP_RETRIEVE: 'device-group:retrieve',
  DEVICE_GROUP_CREATE: 'device-group:create',
  DEVICE_GROUP_UPDATE: 'device-group:update',
  DEVICE_GROUP_DELETE: 'device-group:delete',

  ORGANIZATIONS_RETRIEVE: 'org:retrieve',
  ORGANIZATIONS_CREATE: 'org:create',
  ORGANIZATIONS_UPDATE: 'org:update',
  ORGANIZATIONS_DELETE: 'org:delete',

  DEVICE_HIERARCHY_RETRIEVE: 'device_hierarchy:retrieve',

  DEVICE_PROFILE_RETRIEVE: 'device-profile:retrieve',
  DEVICE_PROFILE_CREATE: 'device-profile:create',
  DEVICE_PROFILE_UPDATE: 'device-profile:update',
  DEVICE_PROFILE_DELETE: 'device-profile:delete',

  MASTER_DATA_RETRIEVE: 'master-data:retrieve',
  MASTER_DATA_CREATE: 'master-data:create',
  MASTER_DATA_UPDATE: 'master-data:update',
  MASTER_DATA_DELETE: 'master-data:delete',

  AUTH_EVENTS_RETRIEVE: 'auth_events:retrieve',

  COMM_EVENTS_RETRIEVE: 'comm_events:retrieve',

  AUDIT_LOGS_RETRIEVE: 'audit_logs:retrieve',

  ROLES_AND_PERMISSIONS_RETRIEVE: 'role:retrieve',
  ROLES_AND_PERMISSIONS_CREATE: 'role:create',
  ROLES_AND_PERMISSIONS_UPDATE: 'role:update',
  ROLES_AND_PERMISSIONS_DELETE: 'role:delete',

  USER_RETRIEVE: 'user:retrieve',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  SETTING_RETRIEVE: 'setting:retrieve',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
