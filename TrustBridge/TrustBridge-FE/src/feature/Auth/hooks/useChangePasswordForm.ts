import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { ChangePasswordType } from '../types/Login';
import { changePasswordSchema } from '../schema/ChangePassword';

const defaultValues = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
};

export const useChangePasswordForm = () => {
  const formMethods = useForm<ChangePasswordType>({
    resolver: yupResolver(changePasswordSchema),
    defaultValues,
  });

  return { formMethods };
};
