import { useMutation } from '@tanstack/react-query';

import { httpClient } from '../../../lib/Axios';
import type { ErrorResponse } from '../../../lib/types';
import { useNotification } from '../../../hooks/useNotification';

export const TENANT_API_ENDPOINT = {
  SAVE_CREDENTIALS: 'api/tenant-api/credentials',
} as const;

export interface TenantCredentialsPayload {
  tenant_id: string;
  tenant_user_id: string;
  email: string;
  password: string;
  cf_access_client_id: string;
  cf_access_client_secret: string;
}

const saveTenantCredentials = (data: TenantCredentialsPayload) =>
  httpClient.post(TENANT_API_ENDPOINT.SAVE_CREDENTIALS, data);

export const useTenantCredentialsMutation = () => {
  const { errorNotification } = useNotification();

  return useMutation({
    mutationFn: saveTenantCredentials,
    onError: (error: ErrorResponse) => {
      errorNotification(
        error?.response?.data?.message || 'Failed to save credentials',
      );
    },
  });
};
