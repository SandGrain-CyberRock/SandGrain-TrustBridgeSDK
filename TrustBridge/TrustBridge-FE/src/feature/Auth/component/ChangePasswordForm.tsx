import { Box, Button, Text, VStack } from '@chakra-ui/react';
import { FormProvider } from '../../../component/Form';
import { useChangePasswordForm } from '../hooks/useChangePasswordForm';
import { useChangePassword } from '../services/ChangePassword.service';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import type { ChangePasswordPayload } from '../types/Login';

export const ChangePasswordForm = () => {
  const { formMethods } = useChangePasswordForm();
  const { mutateAsync, isPending } = useChangePassword();

  const onFormSubmit = async (
    data: ChangePasswordPayload & { confirmPassword: string },
  ) => {
    await mutateAsync({
      oldPassword: data.oldPassword,
      newPassword: data.newPassword,
    });
  };

  return (
    <Box w="100%" maxW="600px" mx="10">
      <FormProvider methods={formMethods}>
        <form onSubmit={formMethods.handleSubmit(onFormSubmit)}>
          <Text
            justifySelf="center"
            variant="xxll_medium"
            align={{ base: 'center', lg: 'left' }}
            color="primary.1800"
          >
            Change Password
          </Text>

          <Text
            justifySelf="center"
            variant="lgg_normal"
            color="gray.1600"
            mb={{ base: '16px', lg: '30px' }}
          >
            You must change your password before continuing.
          </Text>

          <VStack alignItems="stretch" gap="18px">
            <LoginPasswordInput
              name="oldPassword"
              label="Current Password"
              placeholder="Enter Current Password"
              isRequired
            />
            <LoginPasswordInput
              name="newPassword"
              label="New Password"
              placeholder="Enter New Password"
              isRequired
            />
            <LoginPasswordInput
              name="confirmPassword"
              label="Confirm New Password"
              placeholder="Confirm New Password"
              isRequired
            />

            <Button type="submit" w="100%" height="48px" isLoading={isPending}>
              Change Password
            </Button>
          </VStack>
        </form>
      </FormProvider>
    </Box>
  );
};
