import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../lib/Axios';
import { DEVICE_GROUP_API, TENANT_API } from '../api';
import type { ErrorResponse, SuccesRolesResponse } from '../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeviceGroup,
  CreateDeviceGroupPayload,
  UpdateDeviceGroupPayload,
} from '../types/DeviceGroupType';

import { useNotification } from '../../../hooks/useNotification';
import { invalidateActivityLog } from '../../Dashboard/service/Dashboard';

interface GetDeviceGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

interface PaginatedDeviceGroupsResponse {
  data: DeviceGroup[];
  total: number;
}

const getDeviceGroups = (params?: GetDeviceGroupsParams) => {
  return httpClient.get<SuccesRolesResponse<PaginatedDeviceGroupsResponse>>(
    DEVICE_GROUP_API.GET_ALL,
    { params },
  );
};

export const useGetDeviceGroups = (params?: GetDeviceGroupsParams) => {
  return useQuery({
    queryKey: [DEVICE_GROUP_API.GET_ALL, params],
    queryFn: () => getDeviceGroups(params),
    select: ({ data }) => data.data,
  });
};

const getDeviceGroupById = (id: number) => {
  return httpClient.get<SuccesRolesResponse<DeviceGroup>>(
    generatePath(DEVICE_GROUP_API.GET_ONE, { id: String(id) }),
  );
};

export const useGetDeviceGroupById = (id: number | null) => {
  return useQuery({
    queryKey: [DEVICE_GROUP_API.GET_ONE, id],
    queryFn: () => getDeviceGroupById(id!),
    select: ({ data }) => data.data,
    enabled: id !== null,
  });
};

const createDeviceGroup = (payload: CreateDeviceGroupPayload) => {
  return httpClient.post<SuccesRolesResponse<DeviceGroup>>(
    DEVICE_GROUP_API.CREATE,
    payload,
  );
};

export const useCreateDeviceGroup = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_GROUP_API.CREATE],
    mutationFn: createDeviceGroup,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [DEVICE_GROUP_API.GET_ALL],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const updateDeviceGroup = ({
  id,
  data,
}: {
  id: number;
  data: UpdateDeviceGroupPayload;
}) => {
  return httpClient.patch<SuccesRolesResponse<DeviceGroup>>(
    generatePath(DEVICE_GROUP_API.UPDATE, { id: String(id) }),
    data,
  );
};

export const useUpdateDeviceGroup = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_GROUP_API.UPDATE],
    mutationFn: updateDeviceGroup,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [DEVICE_GROUP_API.GET_ALL],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

interface TenantInfo {
  tenant_id: string;
  tenant_name: string;
  prefix: string;
}

export interface HeartbeatResponse {
  status: string;
  tenant: TenantInfo;
}

const getHeartbeat = () => {
  return httpClient.get<SuccesRolesResponse<HeartbeatResponse>>(
    TENANT_API.HEARTBEAT,
  );
};

export const useGetHeartbeat = () => {
  return useQuery({
    queryKey: [TENANT_API.HEARTBEAT],
    queryFn: getHeartbeat,
    select: ({ data }) => data.data,
    staleTime: 5 * 60 * 1000,
  });
};

const deleteDeviceGroup = (id: number) => {
  return httpClient.delete<SuccesRolesResponse<null>>(
    generatePath(DEVICE_GROUP_API.DELETE, { id: String(id) }),
  );
};

export const useDeleteDeviceGroup = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [DEVICE_GROUP_API.DELETE],
    mutationFn: deleteDeviceGroup,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [DEVICE_GROUP_API.GET_ALL],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
