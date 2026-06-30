import { Box, Button, Flex, Image, Text, VStack } from '@chakra-ui/react';
import { LoginTextFieldInput } from '../../../component/Form/Input/LoginTextField';
import { useForgotPasswordForm } from '../hooks/useForgotPassword';
import { FormProvider } from '../../../component/Form';
import { ViewModal } from '../../../component/Modal/ViewModal';
import { emailOpen, errorSign } from '../../../assets/images';

export const ForgotPasswordForm = () => {
  const {
    forgotPasswordMethod,
    onForgotPasswordSubmit,
    isLoading,
    isResetModalOpen,
    onResetModalClose,
    message,
    status,
  } = useForgotPasswordForm();

  return (
    <Box w="100%" maxW="500px" mx="auto">
      <FormProvider methods={forgotPasswordMethod}>
        <form
          onSubmit={forgotPasswordMethod.handleSubmit(onForgotPasswordSubmit)}
        >
          <Text
            justifySelf="center"
            variant="xxll_medium"
            align={{ base: 'center', lg: 'left' }}
            color={'primary.1800'}
          >
            Forgot Password?
          </Text>
          <Text
            justifySelf="center"
            variant="ssm_medium"
            color="gray.1600"
            mb={{ base: '16px', lg: '30px' }}
          >
            Please provide email address to verify.
          </Text>
          <VStack alignItems="stretch" gap="18px">
            <LoginTextFieldInput
              name="email"
              label="Email Address"
              placeholder="Enter Email Address"
            />
            <Button type="submit" w="100%" height="48px" isLoading={isLoading}>
              Verify Email
            </Button>
          </VStack>
        </form>
      </FormProvider>

      <ViewModal
        childBodyPaddingX={3}
        title=""
        isOpen={isResetModalOpen}
        onClose={onResetModalClose}
      >
        <Flex direction="column" align="center" gap={'8px'} py="16px">
          <Image
            src={status === 'success' ? emailOpen : errorSign}
            alt="Status Image"
            mb="16px"
          />
          <Text variant="lgg_medium" color={'primary.1900'}>
            {status === 'success'
              ? 'Reset Link Sent'
              : 'Unable to send reset link'}
          </Text>
          <Text variant="ssm_normal" color="gray.1600">
            {(Array.isArray(message) ? message.join('. ') : message)
              ?.split('. ')
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join('. ')}
          </Text>

          <Button onClick={onResetModalClose} height="48px" mt="20px">
            Go Back
          </Button>
        </Flex>
      </ViewModal>
    </Box>
  );
};
