import { useToast, Box, Text, HStack, Icon } from '@chakra-ui/react';
import { RedCloseCircle, TickCircle } from '../assets/svgs';

export const useNotification = () => {
  const toast = useToast();

  const successNotification = (message: string) => {
    toast({
      position: 'top-right',
      duration: 5000,
      isClosable: true,
      render: () => (
        <Box
          bg="primary.1100"
          px={'16px'}
          py={'12px'}
          borderRadius="12px"
          border="1px solid"
          borderColor="brand.1600"
          boxShadow="lg"
          minW="300px"
        >
          <HStack spacing={2} align="center">
            <Icon as={TickCircle} boxSize={5} color="brand.1600" />
            <Text variant="sm_medium" color="brand.1600" flex={1}>
              {message}
            </Text>
          </HStack>
        </Box>
      ),
    });
  };

  const errorNotification = (message: string) => {
    toast({
      duration: 3000,
      isClosable: true,
      position: 'top-right',
      render: () => (
        <Box
          bg="error.1600"
          px={'16px'}
          py={'12px'}
          borderRadius="12px"
          border="1px solid"
          borderColor="error.550"
          boxShadow="lg"
          minW="300px"
        >
          <HStack spacing={2} align="center">
            <Icon as={RedCloseCircle} boxSize={6} />
            <Text variant="sm_medium" color="error.550" flex={1}>
              {message}
            </Text>
          </HStack>
        </Box>
      ),
    });
  };

  return {
    successNotification,
    errorNotification,
  };
};
