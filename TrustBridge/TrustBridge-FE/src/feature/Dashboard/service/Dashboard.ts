import { useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../../lib/Axios';
import { DASHBOARD_API, SYSTEM_ACTIVITY_API, TRACING_LOGS_API } from '../api';
import type { SuccesRolesResponse } from '../../../lib/types';
import type {
  ChartData,
  FindLogsResult,
  SystemActivity,
} from '../types/DashboardTypes';

export const invalidateActivityLog = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  queryClient.invalidateQueries({ queryKey: [SYSTEM_ACTIVITY_API.GET_ALL] });
  queryClient.invalidateQueries({ queryKey: [SYSTEM_ACTIVITY_API.GET_RECENT] });
};

export interface DashboardStats {
  total_devices: number;
  new_devices: number;
  rejected_devices: number;
  claimed_devices: number;
  active_devices: number;
  inactive_devices: number;
  failed_authentications: number;
  recent_events: number;
  auth_success_rate: number;
}

// tracing logs
export interface TracingLogsParams {
  limit: number;
  cursor?: number;
  process_type?: string;
  status?: string;
}

// Dashboard Stats
const getDashboardStats = () => {
  return httpClient.get<SuccesRolesResponse<DashboardStats>>(
    DASHBOARD_API.STATS,
  );
};

export const useGetDashboardStats = () => {
  return useQuery({
    queryKey: [DASHBOARD_API.STATS],
    queryFn: getDashboardStats,
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
};

// Device Status Chart
const getDeviceStatusChart = () => {
  return httpClient.get<SuccesRolesResponse<ChartData>>(
    DASHBOARD_API.DEVICE_STATUS_CHART,
  );
};

export const useGetDeviceStatusChart = () => {
  return useQuery({
    queryKey: [DASHBOARD_API.DEVICE_STATUS_CHART],
    queryFn: getDeviceStatusChart,
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
};

// Authentication Trend Chart
interface AuthTrendParams {
  days?: number;
}

const getAuthTrendChart = (params?: AuthTrendParams) => {
  return httpClient.get<SuccesRolesResponse<ChartData>>(
    DASHBOARD_API.AUTH_TREND_CHART,
    { params },
  );
};

export const useGetAuthTrendChart = (params?: AuthTrendParams) => {
  return useQuery({
    queryKey: [DASHBOARD_API.AUTH_TREND_CHART, params],
    queryFn: () => getAuthTrendChart(params),
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 30000),
  });
};

// Recent Devices
interface RecentDevicesParams {
  limit?: number;
}

const getRecentDevices = (params?: RecentDevicesParams) => {
  return httpClient.get<
    SuccesRolesResponse<
      Array<{
        device_id: number;
        device_name: string;
        status: string;
        created_at: string;
        deviceGroup: { group_name: string } | null;
        deviceProfile: { profile_id: number; profile_name: string } | null;
        is_active: boolean;
      }>
    >
  >(DASHBOARD_API.RECENT_DEVICES, { params });
};

export const useGetRecentDevices = (params?: RecentDevicesParams) => {
  return useQuery({
    queryKey: [DASHBOARD_API.RECENT_DEVICES, params],
    queryFn: () => getRecentDevices(params),
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 30000),
  });
};

// System Activities
interface SystemActivityParams {
  limit?: number;
  offset?: number;
}

const getSystemActivities = (params?: SystemActivityParams) => {
  return httpClient.get<{
    data: SystemActivity[];
    total: number;
    message: string;
  }>(SYSTEM_ACTIVITY_API.GET_ALL, { params });
};

export const useGetSystemActivities = (params?: SystemActivityParams) => {
  return useQuery({
    queryKey: [SYSTEM_ACTIVITY_API.GET_ALL, params],
    queryFn: () => getSystemActivities(params),
    select: ({ data }) => data,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
};

// Recent Activities
interface RecentActivityParams {
  limit?: number;
}

const getRecentActivities = (params?: RecentActivityParams) => {
  return httpClient.get<SuccesRolesResponse<SystemActivity[]>>(
    SYSTEM_ACTIVITY_API.GET_RECENT,
    { params },
  );
};

export const useGetRecentActivities = (params?: RecentActivityParams) => {
  return useQuery({
    queryKey: [SYSTEM_ACTIVITY_API.GET_RECENT, params],
    queryFn: () => getRecentActivities(params),
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
};

const getTracingLogs = (params?: TracingLogsParams) => {
  return httpClient.get<SuccesRolesResponse<FindLogsResult>>(
    TRACING_LOGS_API.GET_ALL,
    { params },
  );
};

export const useGetTracingLogs = (params?: TracingLogsParams) => {
  return useQuery({
    queryKey: [TRACING_LOGS_API.GET_ALL, params],
    queryFn: () => getTracingLogs(params),
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 10000),
  });
};
