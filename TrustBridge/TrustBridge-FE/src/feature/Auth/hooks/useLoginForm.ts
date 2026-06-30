import { yupResolver } from '@hookform/resolvers/yup';

import { useForm } from 'react-hook-form';

import type { LoginTypes } from '../types/Login';
import { loginSchema } from '../schema/Login';
import { useLoginMutation } from '../services/Login.service';

const defaultValues = {
  username: '',
  password: '',
};

export const useLoginForm = () => {
  const formMethods = useForm<LoginTypes>({
    resolver: yupResolver(loginSchema),
    defaultValues,
  });

  const { mutate, mutateAsync, isPending } = useLoginMutation();

  const onLoginSubmit = (data: LoginTypes) =>
    mutate({
      username: data.username,
      password: data.password,
    });
  const verifyAsync = (data: LoginTypes) =>
    mutateAsync({
      username: data.username,
      password: data.password,
    });

  return {
    loginMethod: formMethods,
    onLoginSubmit,
    verifyAsync,
    isLoading: isPending,
  };
};
