import { useState, useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { StepChangePassword } from '../components/StepChangePassword';
import { StepSystemSetup } from '../components/StepSystemSetup';
import { StepCreateAdmin } from '../components/StepCreateAdmin';
import { SetupComplete } from '../components/SetupComplete';
import { useInitializeMutation } from '../services/Setup.service';
import { AUTH_API_ENDPOINT } from '../../Auth/api';
import type {
  SystemSetupFormData,
  AdminUserFormData,
  InitializeResponse,
} from '../types/Setup.types';

const steps = [
  { label: 'Change Password' },
  { label: 'System Setup' },
  { label: 'Admin User' },
];

export const SetupWizard = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [systemData, setSystemData] = useState<SystemSetupFormData | null>(
    null,
  );
  const [initResult, setInitResult] = useState<InitializeResponse | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mutateAsync: initialize, isPending } = useInitializeMutation();

  const handlePasswordComplete = useCallback(() => {
    setCurrentStep(2);
  }, []);

  const handleSystemSetupComplete = useCallback((data: SystemSetupFormData) => {
    setSystemData(data);
    setCurrentStep(3);
  }, []);

  const handleCreateAdmin = useCallback(
    async (adminData: AdminUserFormData) => {
      if (!systemData) return;

      const response = await initialize({
        orgName: systemData.orgName,
        orgDescription: systemData.orgDescription || undefined,
        orgEmail: systemData.orgEmail,
        tenantCredentials: {
          // tenant_id: systemData.tenant_id,
          // tenant_user_id: systemData.tenant_user_id,
          email: systemData.email,
          password: systemData.password,
          cf_access_client_id: systemData.cf_access_client_id,
          cf_access_client_secret: systemData.cf_access_client_secret,
        },
        adminUser: {
          firstName: adminData.firstName,
          lastName: adminData.lastName,
          email: adminData.email,
        },
      });

      if (response.data?.data) {
        setInitResult(response.data.data);
        setCurrentStep(4);
      }
    },
    [systemData, initialize],
  );

  const handleGoToDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [AUTH_API_ENDPOINT.INIT] });
    navigate('/');
  }, [navigate, queryClient]);

  return (
    <Flex
      minH="100vh"
      bg="#f2f4f7"
      align="center"
      justify="flex-start"
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
          color="#111827"
        >
          Trust
          <Text as="span" color="#c9922a" fontWeight="700">
            Bridge
          </Text>
        </Text>
      </Flex>

      {/* Stepper */}
      {currentStep <= 3 && (
        <Flex
          gap={0}
          mb={7}
          bg="white"
          border="1px solid"
          borderColor="#e5e7eb"
          borderRadius="50px"
          p="6px 8px"
          boxShadow="0 2px 10px rgba(0,0,0,0.06)"
        >
          {steps.map((step, idx) => {
            const stepNum = idx + 1;
            const isActive = currentStep === stepNum;
            const isDone = currentStep > stepNum;

            return (
              <Flex
                key={step.label}
                align="center"
                gap="8px"
                px={4}
                py="7px"
                borderRadius="40px"
                bg={isActive ? '#fef3e2' : 'transparent'}
              >
                <Flex
                  w="24px"
                  h="24px"
                  borderRadius="full"
                  align="center"
                  justify="center"
                  fontSize="11px"
                  fontWeight="700"
                  bg={isDone ? '#dcfce7' : isActive ? '#c9922a' : '#f3f4f6'}
                  color={isDone ? '#16a34a' : isActive ? 'white' : '#71757e'}
                >
                  {isDone ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    stepNum
                  )}
                </Flex>
                <Text
                  fontSize="13px"
                  fontWeight={isActive ? '600' : '400'}
                  color={isDone ? '#16a34a' : isActive ? '#111827' : '#71757e'}
                  display={{ base: 'none', md: 'block' }}
                >
                  {step.label}
                </Text>
              </Flex>
            );
          })}
        </Flex>
      )}

      {/* Card */}
      <Box
        w="min(600px, 100%)"
        bg="white"
        border="1px solid"
        borderColor="#e5e7eb"
        borderRadius="20px"
        boxShadow="0 20px 60px rgba(0,0,0,0.13)"
        overflow="auto"
        sx={{
          scrollbarWidth: 'none', // Firefox
          '&::-webkit-scrollbar': {
            display: 'none', // Chrome/Safari
          },
        }}
      >
        {currentStep === 1 && (
          <StepChangePassword onNext={handlePasswordComplete} />
        )}
        {currentStep === 2 && (
          <StepSystemSetup
            onNext={handleSystemSetupComplete}
            onBack={() => setCurrentStep(1)}
            defaultValues={systemData || undefined}
          />
        )}
        {currentStep === 3 && (
          <StepCreateAdmin
            onSubmit={handleCreateAdmin}
            onBack={() => setCurrentStep(2)}
            isLoading={isPending}
          />
        )}
        {currentStep === 4 && initResult && (
          <SetupComplete
            data={initResult}
            onGoToDashboard={handleGoToDashboard}
          />
        )}
      </Box>
    </Flex>
  );
};
