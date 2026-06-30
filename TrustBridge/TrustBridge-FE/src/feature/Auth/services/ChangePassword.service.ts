import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AUTH_API_ENDPOINT } from '../api';
import { httpClient } from '../../../lib/Axios';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';
import type { ErrorResponse } from '../../../lib/types';
import type { ChangePasswordPayload } from '../types/Login';
import { useNotification } from '../../../hooks/useNotification';

const changePassword = async (data: ChangePasswordPayload) => {
  return httpClient.post(AUTH_API_ENDPOINT.CHANGE_PASSWORD, data);
};

export const useChangePassword = (options?: { skipNavigation?: boolean }) => {
  const { successNotification, errorNotification } = useNotification();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [AUTH_API_ENDPOINT.CHANGE_PASSWORD],
    mutationFn: changePassword,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      // Refetch /auth/me so mustChangePassword is updated
      queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
      if (!options?.skipNavigation) {
        navigate(PAGE_ROUTES.DASHBOARD);
      }
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
