import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';

import { FormProvider, TextFieldInput } from '../../../component/Form';
import PasswordInput from '../../../component/Form/Input/Password';
import { useTenantCredentialsForm } from '../hooks/useTenantCredentialsForm';
import type { TenantCredentialsPayload } from '../service/TenantCredentials';

interface TenantCredentialsFormProps {
  isOpen: boolean;
  onSubmit: (data: TenantCredentialsPayload) => void;
  isLoading?: boolean;
}

export const TenantCredentialsForm = ({
  isOpen,
  onSubmit,
  isLoading,
}: TenantCredentialsFormProps) => {
  const { formMethods } = useTenantCredentialsForm();
  const { handleSubmit } = formMethods;

  return (
    <FormProvider methods={formMethods}>
      <Modal
        isOpen={isOpen}
        onClose={() => {}}
        closeOnEsc={false}
        closeOnOverlayClick={false}
        isCentered
        size="xl"
      >
        <ModalOverlay />
        <ModalContent
          boxShadow="0 4px 48px -2.5px #18274B24"
          borderRadius="16px"
          bg="gray.25"
          maxW="700px"
        >
          <VStack
            alignItems="stretch"
            gap="0"
            border="1px solid"
            borderColor="gray.100"
            borderRadius="12px"
            overflow="hidden"
          >
            <ModalHeader
              minHeight="56px"
              padding="0"
              backgroundColor="gray.1400"
            >
              <VStack
                alignItems="flex-start"
                borderBottom="1px solid"
                borderBottomColor="gray.100"
                px="16px"
                py="12px"
                gap="2px"
              >
                <Text variant="md_medium">Setup Tenant Credentials</Text>
                <Text variant="sm_normal" color="gray.500">
                  Configure your Sandgrain tenant access before using the
                  application.
                </Text>
              </VStack>
            </ModalHeader>

            <ModalBody px={6} py={5}>
              <SimpleGrid columns={2} columnGap={4} rowGap={4}>
                <TextFieldInput
                  name="tenant_id"
                  label="Tenant ID"
                  isRequired
                  placeholder="Enter Tenant ID"
                />
                <TextFieldInput
                  name="tenant_user_id"
                  label="Tenant User ID"
                  isRequired
                  placeholder="Enter Tenant User ID"
                />
                <TextFieldInput
                  name="email"
                  label="Access Email"
                  isRequired
                  placeholder="Enter Email Address"
                  type="email"
                />
                <PasswordInput
                  name="password"
                  label="Access Password"
                  isRequired
                  placeholder="Enter Access Password"
                />
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
            </ModalBody>

            <ModalFooter padding="0">
              <VStack
                width="full"
                borderTop="1px solid"
                borderColor="gray.100"
                px="16px"
                height="70px"
                justifyContent="center"
                alignItems="flex-end"
              >
                <Button
                  onClick={handleSubmit(onSubmit)}
                  isLoading={isLoading}
                  minW="140px"
                >
                  Save Credentials
                </Button>
              </VStack>
            </ModalFooter>
          </VStack>
        </ModalContent>
      </Modal>
    </FormProvider>
  );
};

export default TenantCredentialsForm;
