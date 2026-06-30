import { AUTH_API_ENDPOINT } from '../api';
import { useMutation } from '@tanstack/react-query';
import type { ForgotPasswordType } from '../types/Login';
import { httpClient } from '../../../lib/Axios';

const forgotPassword = async (data: ForgotPasswordType) => {
  return httpClient.post(AUTH_API_ENDPOINT.FORGOTPASSWORD, data);
};

export const useForgotPassword = () => {
  return useMutation({
    mutationKey: [AUTH_API_ENDPOINT.FORGOTPASSWORD],
    mutationFn: forgotPassword,
  });
};
