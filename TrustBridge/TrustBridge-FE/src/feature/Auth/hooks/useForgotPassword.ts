import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { ForgotPasswordType } from '../types/Login';
import { useForgotPassword } from '../services/ForgotPassword.service';
import { useDisclosure } from '@chakra-ui/react';
import type { ErrorResponse } from '../../../lib/types';

const defaultValues = {
  email: '',
};

type ResetModalStatus = 'success' | 'error';

export const useForgotPasswordForm = () => {
  const [message, setMessage] = useState<string>('');
  const [status, setStatus] = useState<ResetModalStatus>('success');
  const {
    isOpen: isResetModalOpen,
    onOpen: onResetModalOpen,
    onClose: onResetModalClose,
  } = useDisclosure();

  const formMethods = useForm<ForgotPasswordType>({
    defaultValues,
  });

  const { mutateAsync, isPending } = useForgotPassword();

  const onForgotPasswordSubmit = async (data: ForgotPasswordType) => {
    try {
      const response = await mutateAsync(data);

      setStatus('success');
      setMessage(
        response?.data?.data?.message ||
          'Password reset link has been sent to your email.',
      );
    } catch (error: unknown) {
      setStatus('error');

      const err = error as ErrorResponse;

      setMessage(
        err?.response?.data?.message ||
          'Unable to send reset link. Please try again.',
      );
    } finally {
      onResetModalOpen();
    }
  };
  return {
    forgotPasswordMethod: formMethods,
    onForgotPasswordSubmit,
    isLoading: isPending,
    isResetModalOpen,
    onResetModalClose,
    message,
    status,
  };
};
