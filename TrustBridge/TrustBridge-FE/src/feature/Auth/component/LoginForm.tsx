import { Box, Button, Text, VStack } from '@chakra-ui/react';

import { FormProvider } from '../../../component/Form';
import LoginPasswordInput from '../../../component/Form/Input/LoginPasswordField';
import { LoginTextFieldInput } from '../../../component/Form/Input/LoginTextField';

import { useLoginForm } from '../hooks/useLoginForm';

export const LoginForm = () => {
  const { loginMethod, onLoginSubmit, isLoading } = useLoginForm();

  return (
    <Box w="100%" maxW="600px" mx="10">
      <FormProvider methods={loginMethod}>
        <form onSubmit={loginMethod.handleSubmit(onLoginSubmit)}>
          <Text
            justifySelf="center"
            variant="xxll_medium"
            align={{ base: 'center', lg: 'left' }}
            color={'primary.1800'}
          >
            Welcome to Trust
            <Text as="span" color="#c9922a">
              Bridge
            </Text>
          </Text>
          <Text
            justifySelf="center"
            variant="lgg_normal"
            color="gray.1600"
            mb={{ base: '16px', lg: '30px' }}
          >
            Let's get started
          </Text>

          <VStack alignItems="stretch" gap="18px">
            <LoginTextFieldInput
              name="username"
              label="Username"
              placeholder="Enter Username"
              isRequired
            />

            {/* Password */}

            <LoginPasswordInput
              name="password"
              label="Password"
              placeholder="Enter Password"
              isRequired
            />

            {/* Submit */}
            <Button type="submit" w="100%" height="48px" isLoading={isLoading}>
              Login
            </Button>
          </VStack>
        </form>
      </FormProvider>
    </Box>
  );
};
