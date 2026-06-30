import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../../lib/Axios';
import type { ErrorResponse } from '../../../lib/types';
import { useNotification } from '../../../hooks/useNotification';
import { AUTH_API_ENDPOINT } from '../../Auth/api';

export const PROFILE_API_ENDPOINT = {
  PROFILE: 'api/auth/profile',
  CHANGE_PASSWORD: 'api/auth/change-password',
  CREDENTIALS: 'api/tenant-api/credentials',
} as const;

export interface UpdateProfilePayload {
  name?: string;
  company_title?: string;
}

export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateCredentialsPayload {
  tenant_user_id?: string;
  email?: string;
  password?: string;
  cf_access_client_id?: string;
  cf_access_client_secret?: string;
}

export interface TenantCredentials {
  tenant_id: string;
  tenant_user_id: string;
  email: string;
  cf_access_client_id: string;
  cf_access_client_secret: string;
}

const getProfile = () =>
  httpClient.get(PROFILE_API_ENDPOINT.PROFILE).then((r) => r.data?.data);

const getCredentials = () =>
  httpClient.get(PROFILE_API_ENDPOINT.CREDENTIALS).then((r) => r.data?.data);

const updateProfile = (data: UpdateProfilePayload) =>
  httpClient.patch(PROFILE_API_ENDPOINT.PROFILE, data);

const changePassword = (data: ChangePasswordPayload) =>
  httpClient.post(PROFILE_API_ENDPOINT.CHANGE_PASSWORD, data);

const updateCredentials = (data: UpdateCredentialsPayload) =>
  httpClient.patch(PROFILE_API_ENDPOINT.CREDENTIALS, data);

export const useProfileQuery = () =>
  useQuery({
    queryKey: [PROFILE_API_ENDPOINT.PROFILE],
    queryFn: getProfile,
  });

export const useCredentialsQuery = (enabled: boolean) =>
  useQuery({
    queryKey: [PROFILE_API_ENDPOINT.CREDENTIALS],
    queryFn: getCredentials,
    enabled,
  });

export const useUpdateProfileMutation = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      successNotification('Profile updated successfully');
      queryClient.invalidateQueries({
        queryKey: [PROFILE_API_ENDPOINT.PROFILE],
      });
      queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to update profile',
      );
    },
  });
};

export const useChangePasswordMutation = () => {
  const { successNotification, errorNotification } = useNotification();
  return useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      successNotification('Password changed successfully');
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to change password',
      );
    },
  });
};

export const useUpdateCredentialsMutation = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCredentials,
    onSuccess: () => {
      successNotification('Credentials updated successfully');
      queryClient.invalidateQueries({
        queryKey: [PROFILE_API_ENDPOINT.CREDENTIALS],
      });
      queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
    },
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to update credentials',
      );
    },
  });
};
