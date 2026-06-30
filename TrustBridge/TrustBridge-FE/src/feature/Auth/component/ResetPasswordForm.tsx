import { useEffect } from 'react';

import { Box, Button, Text, VStack } from '@chakra-ui/react';
import { FormProvider } from '../../../component/Form';
import { useResetPasswordForm } from '../hooks/useResetPassword';
import { useResetPassword } from '../services/ResetPassword.service';
import { useSearchParams } from 'react-router-dom';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import type { ResetPasswordPayload } from '../types/Login';

export const ResetPasswordForm = () => {
  const { formMethods } = useResetPasswordForm();
  const { mutateAsync, isPending } = useResetPassword();
  const [searchParams] = useSearchParams();

  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      formMethods.setValue('token', token, {
        shouldValidate: true,
      });
    }
  }, [token, formMethods]);

  const onFormSubmit = async (data: ResetPasswordPayload) => {
    const { token, password } = data;

    await mutateAsync({
      token,
      password,
    });
  };

  return (
    <Box w="100%" maxW="600px" mx="auto">
      <FormProvider methods={formMethods}>
        <form onSubmit={formMethods.handleSubmit(onFormSubmit)}>
          <Text
            justifySelf="center"
            variant="xxll_medium"
            align={{ base: 'center', lg: 'left' }}
            color="primary.1800"
          >
            Reset Password
          </Text>

          <Text
            justifySelf="center"
            variant="ssm_medium"
            color="gray.1600"
            mb={{ base: '16px', lg: '30px' }}
          >
            Please set the password to proceed further.
          </Text>

          <VStack alignItems="stretch" gap="18px">
            <LoginPasswordInput
              name="password"
              label="New Password"
              placeholder="Enter Password"
            />
            <LoginPasswordInput
              name="confirmPassword"
              label="Confirm Password"
              placeholder="Confirm Password"
            />

            <Button type="submit" w="100%" height="48px" isLoading={isPending}>
              Reset Password
            </Button>
          </VStack>
        </form>
      </FormProvider>
    </Box>
  );
};
