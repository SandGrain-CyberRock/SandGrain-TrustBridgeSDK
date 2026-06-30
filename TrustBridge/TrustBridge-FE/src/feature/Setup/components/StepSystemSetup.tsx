import { Box, Button, Flex, SimpleGrid } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  FormProvider,
  TextFieldInput,
  TextAreaInput,
} from '../../../component/Form';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import { PanelHeader, FormCard, SectionLabel } from './PanelHeader';
import { systemSetupStepSchema } from '../schema/SetupSchema';
import type { SystemSetupFormData } from '../types/Setup.types';

interface StepSystemSetupProps {
  onNext: (data: SystemSetupFormData) => void;
  onBack: () => void;
  defaultValues?: Partial<SystemSetupFormData>;
}

export const StepSystemSetup = ({
  onNext,
  onBack,
  defaultValues,
}: StepSystemSetupProps) => {
  const formMethods = useForm<SystemSetupFormData>({
    resolver: yupResolver(systemSetupStepSchema),
    mode: 'onSubmit',
    defaultValues: {
      orgName: '',
      orgDescription: '',
      orgEmail: '',
      // tenant_id: '',
      // tenant_user_id: '',
      email: '',
      password: '',
      confirmAccessPassword: '',
      cf_access_client_id: '',
      cf_access_client_secret: '',
      ...defaultValues,
    },
  });

  const onSubmit = (data: SystemSetupFormData) => {
    onNext(data);
  };

  return (
    <Box>
      <PanelHeader
        step={2}
        totalSteps={3}
        title="Initial TrustBridge Setup"
        description="Configure your organisation and CyberRock integration."
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
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        }
      />

      <Box px="28px" pt="24px" pb="4px">
        <FormProvider methods={formMethods}>
          <form
            id="system-setup-form"
            onSubmit={formMethods.handleSubmit(onSubmit)}
          >
            <FormCard>
              <SectionLabel>Organisation Details</SectionLabel>
              <SimpleGrid columns={1} gap={4}>
                <TextFieldInput
                  name="orgName"
                  label="Organisation Name"
                  isRequired
                  placeholder="Enter Organization Name"
                />
                <TextAreaInput
                  name="orgDescription"
                  label="Organisation Description"
                  placeholder="Enter Organization Description"
                />
                <TextFieldInput
                  name="orgEmail"
                  label="Organisation Email"
                  isRequired
                  placeholder="Enter Organization Email"
                  type="email"
                />
              </SimpleGrid>
            </FormCard>

            <FormCard>
              <SectionLabel>CyberRock Integration</SectionLabel>
              <SimpleGrid columns={1} gap={4}>
                {/* <TextFieldInput
                  name="tenant_id"
                  label="Tenant ID (CyberRock)"
                  isRequired
                  placeholder="Enter Tenant ID"
                />
                <TextFieldInput
                  name="tenant_user_id"
                  label="Tenant User ID"
                  isRequired
                  placeholder="Enter your Tenant User ID"
                /> */}
                <TextFieldInput
                  name="email"
                  label="Access Email"
                  isRequired
                  placeholder="Enter Email Address"
                  type="email"
                />
                <LoginPasswordInput
                  name="password"
                  label="Access Password"
                  isRequired
                  placeholder="Enter Access Password"
                />
                <LoginPasswordInput
                  name="confirmAccessPassword"
                  label="Confirm Access Password"
                  isRequired
                  placeholder="Confirm Access Password"
                />
              </SimpleGrid>
            </FormCard>

            <FormCard>
              <SectionLabel>Cloudflare</SectionLabel>
              <SimpleGrid columns={1} gap={4}>
                <TextFieldInput
                  name="cf_access_client_id"
                  label="CF Access Client ID"
                  isRequired
                  placeholder="Enter Cloudflare Access Client ID"
                />
                <TextFieldInput
                  name="cf_access_client_secret"
                  label="CF Access Client Secret"
                  isRequired
                  placeholder="Enter Cloudflare Access Client Secret"
                />
              </SimpleGrid>
            </FormCard>
          </form>
        </FormProvider>
      </Box>

      {/* Footer with buttons - always visible */}
      <Flex
        gap={3}
        px="28px"
        py="16px"
        borderTop="1px solid"
        borderColor="#e5e7eb"
      >
        <Button
          variant="outline"
          onClick={onBack}
          flex={1}
          height="44px"
          borderRadius="10px"
          fontSize="14px"
          fontWeight="500"
          borderColor="#d6dee8"
          color="#374151"
        >
          Back
        </Button>
        <Button
          type="submit"
          form="system-setup-form"
          flex={2}
          height="44px"
          bg="orange.2500"
          color="white"
          borderRadius="10px"
          fontSize="14px"
          fontWeight="600"
          _hover={{ bg: '#b8821f' }}
        >
          Save & Continue
        </Button>
      </Flex>
    </Box>
  );
};
