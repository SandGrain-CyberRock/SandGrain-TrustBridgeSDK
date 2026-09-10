export const DASHBOARD_API = {
  STATS: '/api/dashboard/stats',
  DEVICE_STATUS_CHART: '/api/dashboard/charts/device-status',
  AUTH_TREND_CHART: '/api/dashboard/charts/authentication-trend',
  RECENT_DEVICES: '/api/dashboard/recent-devices',
};

export const SYSTEM_ACTIVITY_API = {
  GET_ALL: '/api/system-activity',
  GET_RECENT: '/api/system-activity/recent',
  BY_ENTITY_TYPE: '/api/system-activity/by-entity-type',
  BY_DEVICE: '/api/system-activity/by-device',
  BY_DEVICE_GROUP: '/api/system-activity/by-device-group',
};

export const TRACING_LOGS_API = {
  GET_ALL: '/api/trace-logs',
  DOWNLOAD_ALL: '/api/trace-logs/download/all',
};
