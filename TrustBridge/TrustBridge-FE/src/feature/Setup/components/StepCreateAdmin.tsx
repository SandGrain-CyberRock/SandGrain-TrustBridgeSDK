import { Box, Button, Flex, SimpleGrid, Text } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { FormProvider, TextFieldInput } from '../../../component/Form';
import { PanelHeader, PanelBody, FormCard, SectionLabel } from './PanelHeader';
import { adminUserStepSchema } from '../schema/SetupSchema';
import type { AdminUserFormData } from '../types/Setup.types';

interface StepCreateAdminProps {
  onSubmit: (data: AdminUserFormData) => void;
  onBack: () => void;
  isLoading: boolean;
  defaultValues?: Partial<AdminUserFormData>;
}

export const StepCreateAdmin = ({
  onSubmit,
  onBack,
  isLoading,
  defaultValues,
}: StepCreateAdminProps) => {
  const formMethods = useForm<AdminUserFormData>({
    resolver: yupResolver(adminUserStepSchema),
    mode: 'onSubmit',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      ...defaultValues,
    },
  });

  return (
    <Box>
      <PanelHeader
        step={3}
        totalSteps={3}
        title="Admin User Setup"
        description="Create the first Administrator user for this TrustBridge instance."
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
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
      />

      <PanelBody>
        <FormProvider methods={formMethods}>
          <form onSubmit={formMethods.handleSubmit(onSubmit)}>
            <FormCard>
              <SectionLabel>Admin User Details</SectionLabel>
              <SimpleGrid columns={2} gap={4} mb={4}>
                <TextFieldInput
                  name="firstName"
                  label="First Name"
                  isRequired
                  placeholder="Enter First Name"
                />
                <TextFieldInput
                  name="lastName"
                  label="Last Name"
                  isRequired
                  placeholder="Enter Last Name"
                />
              </SimpleGrid>
              <TextFieldInput
                name="email"
                label="Email Address"
                isRequired
                placeholder="Enter Email Address"
                type="email"
              />
            </FormCard>

            <Box
              bg="#fffbeb"
              border="1px solid"
              borderColor="#fde68a"
              borderRadius="10px"
              p="13px 15px"
              mb={4}
            >
              <Flex gap={3} align="flex-start">
                <Box flexShrink={0} mt="1px" color="#d97706">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </Box>
                <Box>
                  <Text
                    fontSize="12.5px"
                    fontWeight="600"
                    color="#78350f"
                    mb="2px"
                  >
                    Auto-generated password
                  </Text>
                  <Text fontSize="12.5px" color="#92400e" lineHeight="1.55">
                    A secure temporary password will be generated and shown to
                    you after creation. The admin user will also receive it by
                    email and must change it on first login.
                  </Text>
                </Box>
              </Flex>
            </Box>

            <Flex gap={3} mt={2}>
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
                isDisabled={isLoading}
              >
                Back
              </Button>
              <Button
                type="submit"
                flex={2}
                height="44px"
                bg="orange.2500"
                color="white"
                borderRadius="10px"
                fontSize="14px"
                fontWeight="600"
                _hover={{ bg: '#b8821f' }}
                isLoading={isLoading}
              >
                Create Admin & Finish
              </Button>
            </Flex>
          </form>
        </FormProvider>
      </PanelBody>
    </Box>
  );
};
