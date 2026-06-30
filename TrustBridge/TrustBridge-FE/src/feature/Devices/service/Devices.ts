import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../lib/Axios';
import { DEVICE_API } from '../api';
import { DASHBOARD_API, SYSTEM_ACTIVITY_API } from '../../Dashboard/api';
import type { ErrorResponse, SuccesRolesResponse } from '../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Device,
  CreateDevicePayload,
  UpdateDevicePayload,
} from '../types/AllDeviceType';
import { useNotification } from '../../../hooks/useNotification';

// Invalidate all queries that reflect device state changes
export const invalidateDeviceQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
) => {
  queryClient.invalidateQueries({ queryKey: [DEVICE_API.GET_ALL] });
  queryClient.invalidateQueries({ queryKey: [DEVICE_API.STATUS_COUNTS] });
  queryClient.invalidateQueries({ queryKey: [DASHBOARD_API.STATS] });
  queryClient.invalidateQueries({
    queryKey: [DASHBOARD_API.DEVICE_STATUS_CHART],
  });
  queryClient.invalidateQueries({ queryKey: [DASHBOARD_API.RECENT_DEVICES] });
  queryClient.invalidateQueries({ queryKey: [SYSTEM_ACTIVITY_API.GET_RECENT] });
  queryClient.invalidateQueries({ queryKey: [SYSTEM_ACTIVITY_API.GET_ALL] });
};

interface GetDevicesParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  device_group_id?: number;
  profile_id?: number;
  is_active?: boolean;
}

interface PaginatedDevicesResponse {
  data: Device[];
  total: number;
}

interface MoveDevicePayload {
  device_ids: number[];
}

interface DeviceStatusCounts {
  total: number;
  idle: number;
  inprogress: number;
  approved: number;
  rejected: number;
  claimed: number;
  not_claimed: number;
  authenticated: number;
  not_approved: number;
  active: number;
  inactive: number;
}

const getDevices = (params?: GetDevicesParams) => {
  return httpClient.get<SuccesRolesResponse<PaginatedDevicesResponse>>(
    DEVICE_API.GET_ALL,
    { params },
  );
};

export const useGetDevices = (params?: GetDevicesParams) => {
  return useQuery({
    queryKey: [DEVICE_API.GET_ALL, params],
    queryFn: () => getDevices(params),
    select: ({ data }) => data.data,
    placeholderData: (previousData) => previousData,
    refetchInterval: 15000,
  });
};

const getDeviceById = (id: number) => {
  return httpClient.get<SuccesRolesResponse<Device>>(
    generatePath(DEVICE_API.GET_ONE, { id: String(id) }),
  );
};

export const useGetDeviceById = (id: number | null) => {
  return useQuery({
    queryKey: [DEVICE_API.GET_ONE, id],
    queryFn: () => getDeviceById(id!),
    select: ({ data }) => data.data,
    enabled: id !== null,
  });
};

const createDevice = (payload: CreateDevicePayload) => {
  return httpClient.post<SuccesRolesResponse<Device>>(
    DEVICE_API.CREATE,
    payload,
  );
};

export const useCreateDevice = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.CREATE],
    mutationFn: createDevice,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const updateDevice = ({
  id,
  data,
}: {
  id: number;
  data: UpdateDevicePayload;
}) => {
  return httpClient.patch<SuccesRolesResponse<Device>>(
    generatePath(DEVICE_API.UPDATE, { id: String(id) }),
    data,
  );
};

export const useUpdateDevice = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.UPDATE],
    mutationFn: updateDevice,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const deleteDevice = (id: number) => {
  return httpClient.delete<SuccesRolesResponse<null>>(
    generatePath(DEVICE_API.DELETE, { id: String(id) }),
  );
};

export const useDeleteDevice = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.DELETE],
    mutationFn: deleteDevice,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

interface ImportDevicesPayload {
  file: File;
}

const importDevices = (payload: ImportDevicesPayload) => {
  const formData = new FormData();
  formData.append('file', payload.file);
  return httpClient.post(DEVICE_API.IMPORT, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const useImportDevices = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.IMPORT],
    mutationFn: (payload: ImportDevicesPayload) => importDevices(payload),
    onSuccess: (response) => {
      const { data } = response;
      const count = data.data?.count ?? 0;
      const importErrors: string[] = data.data?.errors ?? [];
      const msg = `${count} device(s) imported successfully`;
      if (importErrors.length > 0) {
        errorNotification(`${msg}. Issues: ${importErrors.join('; ')}`);
      } else {
        successNotification(msg);
      }
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

interface ExportDevicesOptions {
  search?: string;
  status?: string;
  device_group_id?: number;
  profile_id?: number;
}

export const exportDevices = (
  format: 'xlsx' | 'csv' | 'json' = 'xlsx',
  options?: ExportDevicesOptions,
) => {
  return httpClient.get(DEVICE_API.EXPORT, {
    params: { format, ...options },
    responseType: 'blob',
  });
};

const moveDevice = (payload: MoveDevicePayload) => {
  return httpClient.post<SuccesRolesResponse<null>>(DEVICE_API.MOVE, payload);
};

export const useMoveDevice = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.MOVE],
    mutationFn: moveDevice,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

export interface DeviceLog {
  log_id: number;
  device_id: number;
  process_type: string;
  step: string;
  status: string;
  message: string;
  request_data: string | null;
  response_data: string | null;
  duration_ms: number | null;
  attempt_number: number;
  created_at: string;
}

// server responses wrap device logs inside a `data` field, similar to other API calls
const getDeviceLogs = (id: number) => {
  return httpClient.get<SuccesRolesResponse<DeviceLog[]>>(
    generatePath(DEVICE_API.GET_LOGS, { id: String(id) }),
  );
};

export const useGetDeviceLogs = (id: number | null) => {
  return useQuery({
    queryKey: [DEVICE_API.GET_LOGS, id],
    queryFn: () => getDeviceLogs(id!),
    select: ({ data }) => data.data, // unwrap the nested data array for consumers
    enabled: id !== null,
    refetchInterval: 2000,
  });
};

const getDeviceStatusCounts = () => {
  return httpClient.get<SuccesRolesResponse<DeviceStatusCounts>>(
    DEVICE_API.STATUS_COUNTS,
  );
};

export const useGetDeviceStatusCounts = () => {
  return useQuery({
    queryKey: [DEVICE_API.STATUS_COUNTS],
    queryFn: getDeviceStatusCounts,
    select: ({ data }) => data.data,
    refetchInterval: (query) => (query.state.error ? false : 15000),
  });
};

// Connectivity check types
export interface DeviceConnectivity {
  is_online: boolean;
  last_seen_at: string | null;
}

const checkDeviceConnectivity = (id: number) => {
  return httpClient.get<SuccesRolesResponse<DeviceConnectivity>>(
    generatePath(DEVICE_API.CHECK_CONNECTIVITY, { id: String(id) }),
  );
};

export const useCheckDeviceConnectivity = (id: number | null) => {
  return useQuery({
    queryKey: [DEVICE_API.CHECK_CONNECTIVITY, id],
    queryFn: () => checkDeviceConnectivity(id!),
    select: ({ data }) => data.data,
    enabled: id !== null,
    refetchInterval: 10000, // Poll every 10 seconds to check connectivity
  });
};

export type ProcessType = 'authentication' | 'fw_verification' | 'installation';

interface RunProcessPayload {
  id: number;
  process_type: ProcessType;
  verification_rw?: string;
  auth_option?: 1 | 2 | 3;
}

const runProcess = ({
  id,
  process_type,
  verification_rw,
  auth_option,
}: RunProcessPayload) => {
  return httpClient.post<SuccesRolesResponse<{ message: string }>>(
    generatePath(DEVICE_API.RUN_PROCESS, { id: String(id) }),
    {
      process_type,
      preserve_device_identity: true,
      ...(verification_rw ? { verification_rw } : {}),
      ...(auth_option !== undefined ? { auth_option } : {}),
    },
  );
};

// ─── Lifecycle API types ────────────────────────────────────────────────────

export interface TidStatusData {
  status: string;
  iotId?: string;
  tenantId?: string;
  iot?: {
    id: string;
    username?: string;
    iotToTenantUsers?: {
      id: string;
      tenantUser?: {
        id: string;
        firstName?: string;
        lastName?: string;
        email?: string;
      };
    }[];
  };
  [key: string]: unknown;
}

export interface TenantUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  [key: string]: unknown;
}

export interface IotUser {
  id: string;
  username?: string;
  [key: string]: unknown;
}

// ─── Bulk authenticate (idle / rejected devices) ─────────────────────────────

interface BulkAuthenticatePayload {
  device_ids?: number[];
  device_group_id?: number;
  profile_id?: number;
  statuses?: string[];
}

interface BulkAuthenticateResult {
  queued: number;
  skipped: number;
  devices: { device_id: number; device_name: string; status: string }[];
}

const bulkAuthenticate = (payload: BulkAuthenticatePayload) => {
  return httpClient.post<SuccesRolesResponse<BulkAuthenticateResult>>(
    DEVICE_API.BULK_AUTHENTICATE,
    payload,
  );
};

export const useBulkAuthenticate = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.BULK_AUTHENTICATE],
    mutationFn: bulkAuthenticate,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(
        `Authentication queued for ${data.data.queued} device(s) — results will appear in device logs`,
      );
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to queue bulk authentication',
      );
    },
  });
};

// ─── Lifecycle service functions ─────────────────────────────────────────────

interface BulkLifecycleResult {
  queued: number;
  devices: { device_id: number; device_name: string }[];
}

const bulkLifecycleAuth = (payload: { device_ids?: number[] }) => {
  return httpClient.post<SuccesRolesResponse<BulkLifecycleResult>>(
    DEVICE_API.LIFECYCLE_BULK_AUTH,
    payload,
  );
};

export const useBulkLifecycleAuth = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.LIFECYCLE_BULK_AUTH],
    mutationFn: bulkLifecycleAuth,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(
        `Lifecycle auth queued for ${data.data.queued} device(s) — results will appear in device logs`,
      );
      invalidateDeviceQueries(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to queue lifecycle auth',
      );
    },
  });
};

const getTidStatus = (id: number) => {
  return httpClient.get<SuccesRolesResponse<TidStatusData>>(
    generatePath(DEVICE_API.TID_STATUS, { id: String(id) }),
  );
};

export const useGetTidStatus = (id: number | null) => {
  return useQuery({
    queryKey: [DEVICE_API.TID_STATUS, id],
    queryFn: () => getTidStatus(id!),
    select: ({ data }) => data.data,
    enabled: id !== null,
  });
};

const getLifecycleTenantUsers = (deviceId: number) => {
  return httpClient.get<SuccesRolesResponse<TenantUser[]>>(
    DEVICE_API.LIFECYCLE_TENANT_USERS,
    { params: { device_id: deviceId } },
  );
};

export const useGetLifecycleTenantUsers = (deviceId: number | null) => {
  return useQuery({
    queryKey: [DEVICE_API.LIFECYCLE_TENANT_USERS, deviceId],
    queryFn: () => getLifecycleTenantUsers(deviceId!),
    select: ({ data }) =>
      Array.isArray(data.data)
        ? data.data
        : ((data.data as { list?: TenantUser[] })?.list ?? []),
    enabled: deviceId !== null,
  });
};

const getDeviceGroups = () => {
  return httpClient.get<
    SuccesRolesResponse<{
      data: { device_group_id: number; group_name: string }[];
    }>
  >(DEVICE_API.DEVICE_GROUPS);
};

export const useGetDeviceGroups = () => {
  return useQuery({
    queryKey: [DEVICE_API.DEVICE_GROUPS],
    queryFn: getDeviceGroups,
    select: ({ data }) =>
      data.data.data.map((g) => ({
        id: g.device_group_id,
        username: g.group_name,
      })),
  });
};

interface UpdateLifecyclePayload {
  id: number;
  status: string;
  applyToAllDelegates?: boolean;
  iotId?: string;
  tenantId?: string;
}

const updateLifecycle = ({ id, ...body }: UpdateLifecyclePayload) => {
  return httpClient.put<SuccesRolesResponse<{ is_active: boolean }>>(
    generatePath(DEVICE_API.UPDATE_LIFECYCLE, { id: String(id) }),
    body,
  );
};

export const useUpdateLifecycle = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_API.UPDATE_LIFECYCLE],
    mutationFn: updateLifecycle,
    onSuccess: async (response, variables) => {
      const { data } = response;
      successNotification(data.message);
      // If ReadyForHandover, also set the device status to idle in TrustBridge
      if (variables.status === 'ReadyForHandover') {
        await updateDevice({
          id: variables.id,
          data: { status: 'idle' },
        });
      }
      invalidateDeviceQueries(queryClient);
      queryClient.invalidateQueries({
        queryKey: [DEVICE_API.TID_STATUS, variables.id],
      });
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to update lifecycle',
      );
    },
  });
};

export const useRunProcess = (deviceId: number | null) => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Omit<RunProcessPayload, 'id'>) =>
      runProcess({ id: deviceId!, ...payload }),
    onSuccess: (_, vars) => {
      const processLabels: Record<ProcessType, string> = {
        authentication: 'Authentication',
        fw_verification: 'FW Verification',
        installation: 'Installation',
      };
      const authOptionLabels: Record<number, string> = {
        1: ' — Normal Flow',
        2: ' — Fault Injection',
        3: ' — Error Stress',
      };
      const suffix =
        vars.process_type === 'authentication' && vars.auth_option
          ? (authOptionLabels[vars.auth_option] ?? '')
          : '';
      successNotification(
        `${processLabels[vars.process_type]}${suffix} started`,
      );
      // Immediate refresh + schedule follow-up polls to capture incoming gateway logs
      queryClient.invalidateQueries({
        queryKey: [DEVICE_API.GET_LOGS, deviceId],
      });
      [2000, 5000, 10000].forEach((delay) => {
        setTimeout(() => {
          queryClient.invalidateQueries({
            queryKey: [DEVICE_API.GET_LOGS, deviceId],
          });
        }, delay);
      });
      // Refresh device list and dashboard stats after process settles
      // (enrollment/authentication update device status asynchronously)
      [3000, 8000, 15000].forEach((delay) => {
        setTimeout(() => {
          invalidateDeviceQueries(queryClient);
        }, delay);
      });
    },
    onError: (err: ErrorResponse) => {
      errorNotification(
        err?.response?.data?.message || 'Failed to start process',
      );
    },
  });
};
