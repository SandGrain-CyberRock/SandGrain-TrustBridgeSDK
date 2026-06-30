import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { ResetPasswordType } from '../types/Login';
import { resetPasswordSchema } from '../schema/ResetPassword';

const defaultValues = {
  token: '',
  password: '',
  confirmPassword: '',
};

export const useResetPasswordForm = () => {
  const formMethods = useForm<ResetPasswordType>({
    resolver: yupResolver(resetPasswordSchema),

    defaultValues,
  });

  return {
    formMethods,
  };
};
