import {
  Box,
  Button,
  Modal as ChakraModal,
  HStack,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';

import { CloseIcon } from '../../assets/svgs';
import type { ModalProps } from './types';

export const AddModal = ({
  isOpen,
  onClose,
  title,
  children,
  childBodyPaddingX,
  childBodyPaddingY,
  limitChildOverflow,
  isLoading,
  cancelButtonLabel = 'Cancel',
  submitButtonLabel = 'Submit',
  showSubmitButton = true,
  onSubmit,
  isDisabled = false,
  size = 'md',
}: ModalProps) => {
  const customSize = size === 'md' ? '717px' : size;

  return (
    <ChakraModal
      scrollBehavior="inside"
      isOpen={isOpen}
      onClose={onClose}
      size={customSize}
      isCentered
    >
      <ModalOverlay />
      <ModalContent
        boxShadow="0 4px 48px -2.5px #18274B24"
        borderRadius="16px"
        bg="gray.25"
        maxW={size === 'md' ? '700px' : undefined}
      >
        <VStack
          alignItems="stretch"
          gap="0"
          border="1px solid"
          borderColor="gray.100"
          borderRadius="12px"
          overflow="hidden"
        >
          <ModalHeader minHeight="56px" padding="0" backgroundColor="gray.1400">
            <HStack
              justifyContent="space-between"
              borderBottom="1px solid"
              borderBottomColor="gray.100"
              height="56px"
              px="16px"
              sx={{
                svg: {
                  color: 'gray.400',
                },
              }}
            >
              <Text variant="md_medium">{title}</Text>

              <CloseIcon onClick={onClose} cursor="pointer" />
            </HStack>
          </ModalHeader>
          <ModalBody
            margin="0"
            px={childBodyPaddingX}
            py={childBodyPaddingY}
            fontSize="15px"
            maxH={limitChildOverflow ? '100%' : undefined}
            overflowY={limitChildOverflow ? 'hidden' : undefined}
          >
            <Box
              border="1px solid"
              borderColor="primary.1200"
              borderRadius="xl"
              p={4}
              bg="white"
              position="relative"
              _hover={{ boxShadow: 'md' }}
              transition="all 0.2s"
            >
              {children}
            </Box>
          </ModalBody>
          <ModalFooter padding="0">
            <HStack
              justifyContent="flex-end"
              gap="14px"
              borderTopColor="gray.100"
              width="full"
              height="70px"
              px="16px"
            >
              <Button onClick={onClose} variant="cancel">
                {cancelButtonLabel}
              </Button>
              {showSubmitButton && (
                <Button
                  isLoading={isLoading}
                  onClick={onSubmit}
                  isDisabled={isDisabled}
                >
                  {submitButtonLabel}
                </Button>
              )}
            </HStack>
          </ModalFooter>
        </VStack>
      </ModalContent>
    </ChakraModal>
  );
};
