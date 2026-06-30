import {
  Box,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Text,
  Tooltip,
} from '@chakra-ui/react';

import type { FormWrapperProps } from './Wrapper.types';

export const FormWrapper = ({
  label,
  error,
  children,
  isRequired,
  isDisabled,
  tooltip,
  focusRef,
}: FormWrapperProps) => {
  const errorMessage = error?.message;

  return (
    <FormControl isInvalid={!!errorMessage} isDisabled={isDisabled}>
      {label && (
        <FormLabel
          marginBottom="2"
          width="fit-content"
          onClick={() => focusRef?.current?.focus()}
        >
          <HStack spacing={1.5} align="center">
            <Text variant="sm_medium">
              {label}
              {isRequired ? (
                <Text as="span" color="red.300">
                  {' '}
                  *
                </Text>
              ) : undefined}
            </Text>
            {tooltip && (
              <Tooltip
                label={tooltip}
                hasArrow
                placement="top"
                bg="secondary.900"
                color="white"
                fontSize="12px"
                borderRadius="6px"
                px={3}
                py={2}
              >
                <Box
                  as="span"
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  w="14px"
                  h="14px"
                  borderRadius="full"
                  bg="gray.200"
                  color="gray.500"
                  fontSize="10px"
                  fontWeight="700"
                  cursor="help"
                  lineHeight="1"
                >
                  i
                </Box>
              </Tooltip>
            )}
          </HStack>
        </FormLabel>
      )}

      {children}

      {errorMessage && (
        <FormErrorMessage marginTop="1">{errorMessage}</FormErrorMessage>
      )}
    </FormControl>
  );
};
