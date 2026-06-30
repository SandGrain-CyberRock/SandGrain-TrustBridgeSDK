import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { AUTH_API_ENDPOINT } from '../api';
import { httpClient } from '../../../lib/Axios';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';
import type { ErrorResponse } from '../../../lib/types';
import type { ResetPasswordPayload } from '../types/Login';
import { useNotification } from '../../../hooks/useNotification';

const resetPassword = async (data: ResetPasswordPayload) => {
  return httpClient.post(AUTH_API_ENDPOINT.RESETPASSWORD, data);
};

export const useResetPassword = () => {
  const { successNotification, errorNotification } = useNotification();
  const navigate = useNavigate();

  return useMutation({
    mutationKey: [AUTH_API_ENDPOINT.RESETPASSWORD],
    mutationFn: resetPassword,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      navigate(PAGE_ROUTES.AUTH.LOGIN);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
      navigate(PAGE_ROUTES.AUTH.LOGIN);
    },
  });
};
