import { useMutation, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../../lib/Axios';
import type { ErrorResponse, SuccessResponse } from '../../../lib/types';
import { AUTH_API_ENDPOINT } from '../../Auth/api';
import { useNotification } from '../../../hooks/useNotification';
import { TokenService } from '../../../utils/TokenService';
import { ACCESS_TOKEN_KEY } from '../../../constant/TokenConstant';
import type {
  InitializePayload,
  InitializeResponse,
} from '../types/Setup.types';

const initializeSystem = async (data: InitializePayload) => {
  return httpClient.post<SuccessResponse<InitializeResponse>>(
    AUTH_API_ENDPOINT.INITIALIZE,
    data,
  );
};

export const useInitializeMutation = () => {
  const { errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [AUTH_API_ENDPOINT.INITIALIZE],
    mutationFn: initializeSystem,
    onSuccess: (response) => {
      const newToken = response.data?.data?.access_token;
      if (newToken) {
        TokenService.setToken({ key: ACCESS_TOKEN_KEY, value: newToken });
      }
      queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
