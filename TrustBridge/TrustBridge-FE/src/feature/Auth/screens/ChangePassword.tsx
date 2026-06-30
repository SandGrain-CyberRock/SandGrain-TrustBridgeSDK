import { Box, Flex, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { FormProvider } from '../../../component/Form';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import { PasswordStrengthMeter } from '../../Setup/components/PasswordStrengthMeter';
import {
  PanelHeader,
  PanelBody,
  FormCard,
  SectionLabel,
} from '../../Setup/components/PanelHeader';
import { changePasswordStepSchema } from '../../Setup/schema/SetupSchema';
import { useChangePassword } from '../services/ChangePassword.service';
import { Button, VStack } from '@chakra-ui/react';
import { AUTH_API_ENDPOINT } from '../api';

export const ChangePassword = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const formMethods = useForm({
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

  const onSubmit = async (data: {
    oldPassword: string;
    newPassword: string;
  }) => {
    await mutateAsync(
      {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: [AUTH_API_ENDPOINT.INIT],
          });
          navigate('/');
        },
      },
    );
  };

  return (
    <Flex
      h="100vh"
      bg="gray.25"
      align="center"
      justify="center"
      p={{ base: 4, md: 8 }}
      direction="column"
    >
      {/* Brand */}
      <Flex align="center" gap="10px" mb={7}>
        <Flex
          w="38px"
          h="38px"
          bgGradient="linear(135deg, #fef3e2, #fde4b0)"
          border="1.5px solid"
          borderColor="#f0c070"
          borderRadius="10px"
          align="center"
          justify="center"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c9922a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </Flex>
        <Text
          fontSize="20px"
          fontWeight="700"
          letterSpacing="0.02em"
          color="primary.1800"
        >
          Trust
          <Text as="span" color="#c9922a" fontWeight="700">
            Bridge
          </Text>
        </Text>
      </Flex>

      {/* Card */}
      <Box
        w="min(600px, 100%)"
        bg="white"
        border="1px solid"
        borderColor="primary.1200"
        borderRadius="20px"
        boxShadow="0 20px 60px rgba(0,0,0,0.13)"
        overflow="hidden"
      >
        <PanelHeader
          step={1}
          totalSteps={1}
          title="Change Your Password"
          description="You must set a new password before continuing."
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
                <SectionLabel>New Credentials</SectionLabel>
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
                isLoading={isPending}
                mt={2}
              >
                Set Password & Continue
              </Button>
            </form>
          </FormProvider>
        </PanelBody>
      </Box>
    </Flex>
  );
};
