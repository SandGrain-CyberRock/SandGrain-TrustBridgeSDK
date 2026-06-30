import { Box, Button, VStack } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { FormProvider } from '../../../component/Form';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { PanelHeader, PanelBody, FormCard, SectionLabel } from './PanelHeader';
import { changePasswordStepSchema } from '../schema/SetupSchema';
import { useChangePassword } from '../../Auth/services/ChangePassword.service';
import type { ChangePasswordFormData } from '../types/Setup.types';

interface StepChangePasswordProps {
  onNext: () => void;
}

export const StepChangePassword = ({ onNext }: StepChangePasswordProps) => {
  const formMethods = useForm<ChangePasswordFormData>({
    resolver: yupResolver(changePasswordStepSchema),
    mode: 'onChange',
    defaultValues: {
      oldPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const { mutateAsync, isPending } = useChangePassword({
    skipNavigation: true,
  });
  const newPasswordValue = formMethods.watch('newPassword');

  const onSubmit = async (data: ChangePasswordFormData) => {
    await mutateAsync(
      {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      },
      {
        onSuccess: () => {
          onNext();
        },
      },
    );
  };

  return (
    <Box>
      <PanelHeader
        step={1}
        totalSteps={3}
        title="Mandatory Password Change"
        description="TrustAdmin must set a new password before proceeding."
        icon={
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c9922a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        }
      />

      <PanelBody>
        <FormProvider methods={formMethods}>
          <form onSubmit={formMethods.handleSubmit(onSubmit)}>
            <FormCard>
              <SectionLabel>TrustAdmin Credentials</SectionLabel>
              <VStack alignItems="stretch" gap="16px">
                <LoginPasswordInput
                  name="oldPassword"
                  label="Current (Temporary) Password"
                  placeholder="Enter Temporary Password"
                  isRequired
                />
                <Box>
                  <LoginPasswordInput
                    name="newPassword"
                    label="New Password"
                    placeholder="Enter New Password"
                    isRequired
                  />
                  <PasswordStrengthMeter password={newPasswordValue || ''} />
                </Box>
                <LoginPasswordInput
                  name="confirmPassword"
                  label="Confirm New Password"
                  placeholder="Confirm New Password"
                  isRequired
                />
              </VStack>
            </FormCard>

            <Button
              type="submit"
              w="100%"
              height="44px"
              bg="orange.2500"
              color="white"
              borderRadius="10px"
              fontSize="14px"
              fontWeight="600"
              _hover={{ bg: '#b8821f' }}
              isLoading={isPending}
              mt={2}
            >
              Set Password & Continue
            </Button>
          </form>
        </FormProvider>
      </PanelBody>
    </Box>
  );
};
