import {
  Box,
  Modal as ChakraModal,
  HStack,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';
import type { ModalProps } from './types';
import { CloseIcon } from '../../assets/svgs';

export const ViewModal = ({
  isOpen,
  onClose,
  title,
  children,
  childBodyPaddingX,
  childBodyPaddingY,
  limitChildOverflow,
  size = 'sm',
}: ModalProps) => {
  return (
    <ChakraModal
      scrollBehavior="inside"
      isOpen={isOpen}
      onClose={onClose}
      size={size}
      isCentered
    >
      <ModalOverlay />
      <ModalContent boxShadow="0 4px 48px -2.5px #18274B24" borderRadius="16px">
        <VStack
          alignItems="stretch"
          gap="0"
          border="1px solid"
          borderColor="gray.100"
          borderRadius="16px"
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
            backgroundColor="gray.25"
          >
            <Box
              border="1px solid"
              borderColor="primary.1200"
              borderRadius="xl"
              p={3}
              bg="white"
              position="relative"
              _hover={{ boxShadow: 'md' }}
              transition="all 0.2s"
            >
              {children}
            </Box>
          </ModalBody>
        </VStack>
      </ModalContent>
    </ChakraModal>
  );
};
