import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../lib/Axios';
import type { SuccessResponse, ErrorResponse } from '../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../hooks/useNotification';
import { DEVICE_PROFILE_API } from '../api';
import { invalidateActivityLog } from '../../Dashboard/service/Dashboard';
import type {
  DeviceProfileResponse,
  DeviceProfileListResponse,
  CreateDeviceProfilePayload,
  UpdateDeviceProfilePayload,
} from '../types/DeviceProfile.types';

// ── List (paginated) ────────────────────────────────────────────────────────
const getDeviceProfiles = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) => {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  return httpClient.get<SuccessResponse<DeviceProfileListResponse>>(
    `${DEVICE_PROFILE_API.GET_ALL}${qs ? `?${qs}` : ''}`,
  );
};

export const useGetDeviceProfiles = (params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) =>
  useQuery({
    queryKey: [DEVICE_PROFILE_API.GET_ALL, params],
    queryFn: () => getDeviceProfiles(params),
    select: ({ data }) => data.data,
    placeholderData: (prev) => prev,
  });

// ── Get by ID ───────────────────────────────────────────────────────────────
const getDeviceProfileById = (id: string) =>
  httpClient.get<SuccessResponse<DeviceProfileResponse>>(
    generatePath(DEVICE_PROFILE_API.GET_BY_ID, { id }),
  );

export const useGetDeviceProfileById = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [DEVICE_PROFILE_API.GET_BY_ID, id],
    queryFn: () => getDeviceProfileById(id),
    select: ({ data }) => data.data,
    enabled,
  });

// ── Create ───────────────────────────────────────────────────────────────────
const createDeviceProfile = (payload: CreateDeviceProfilePayload) =>
  httpClient.post<SuccessResponse<DeviceProfileResponse>>(
    DEVICE_PROFILE_API.CREATE,
    payload,
  );

export const useCreateDeviceProfile = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [DEVICE_PROFILE_API.CREATE],
    mutationFn: createDeviceProfile,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [DEVICE_PROFILE_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

// ── Update ───────────────────────────────────────────────────────────────────
const updateDeviceProfile = ({
  id,
  data,
}: {
  id: string;
  data: UpdateDeviceProfilePayload;
}) =>
  httpClient.patch<SuccessResponse<DeviceProfileResponse>>(
    generatePath(DEVICE_PROFILE_API.UPDATE, { id }),
    data,
  );

export const useUpdateDeviceProfile = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [DEVICE_PROFILE_API.UPDATE],
    mutationFn: updateDeviceProfile,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [DEVICE_PROFILE_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

// ── Delete ───────────────────────────────────────────────────────────────────
const deleteDeviceProfile = (id: string) =>
  httpClient.delete<SuccessResponse<null>>(
    generatePath(DEVICE_PROFILE_API.DELETE, { id }),
  );

export const useDeleteDeviceProfile = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [DEVICE_PROFILE_API.DELETE],
    mutationFn: deleteDeviceProfile,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [DEVICE_PROFILE_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};
