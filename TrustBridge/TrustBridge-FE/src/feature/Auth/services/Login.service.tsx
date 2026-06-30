import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useNavigate } from 'react-router-dom';

import type { LoginResponseType, LoginTypes } from '../types/Login';
import { httpClient } from '../../../lib/Axios';
import type { ErrorResponse, SuccessResponse } from '../../../lib/types';
import { AUTH_API_ENDPOINT } from '../api';
import { TokenService } from '../../../utils/TokenService';
import { ACCESS_TOKEN_KEY } from '../../../constant/TokenConstant';
import { useNotification } from '../../../hooks/useNotification';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';

const login = async (data: LoginTypes) => {
  return httpClient.post<SuccessResponse<LoginResponseType>>(
    AUTH_API_ENDPOINT.LOGIN,
    data,
  );
};

export const useLoginMutation = () => {
  const { successNotification, errorNotification } = useNotification();

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [AUTH_API_ENDPOINT.LOGIN],
    mutationFn: login,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      TokenService.setToken({
        key: ACCESS_TOKEN_KEY,
        value: data?.data?.access_token,
      });
      queryClient.setQueryData(['authentication'], () => true);
      queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
      if (data?.data?.user?.needsInitialization) {
        navigate(PAGE_ROUTES.AUTH.SETUP);
      } else if (data?.data?.user?.mustChangePassword) {
        navigate(PAGE_ROUTES.AUTH.CHANGE_PASSWORD);
      } else {
        navigate('/');
      }
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
