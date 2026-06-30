import {
  Box,
  Button,
  Flex,
  Text,
  useClipboard,
  Modal as ChakraModal,
  ModalOverlay,
  ModalContent,
  ModalBody,
} from '@chakra-ui/react';

interface UserCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: {
    username: string;
    email: string;
    generatedPassword: string;
  };
  title?: string;
  subtitle?: string;
}

export const UserCredentialsModal = ({
  isOpen,
  onClose,
  credentials,
  title = 'User Created Successfully',
  subtitle = 'The user account has been created. Please share the credentials below.',
}: UserCredentialsModalProps) => {
  const { onCopy, hasCopied } = useClipboard(credentials.generatedPassword);

  return (
    <ChakraModal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent borderRadius="16px" bg="gray.25" maxW="480px">
        <ModalBody px="28px" py="32px">
          <Flex direction="column" align="center" textAlign="center">
            {/* Green checkmark icon */}
            <Flex
              w="56px"
              h="56px"
              borderRadius="full"
              bg="#f0fdf4"
              border="2px solid"
              borderColor="#bbf7d0"
              align="center"
              justify="center"
              mb={4}
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16a34a"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </Flex>

            <Text
              fontSize="18px"
              fontWeight="700"
              color="#111827"
              mb={1}
              letterSpacing="-0.02em"
            >
              {title}
            </Text>
            <Text fontSize="13px" color="#6b7280" maxW="340px" lineHeight="1.6">
              {subtitle}
            </Text>
          </Flex>

          {/* Credentials box */}
          <Box
            mt={5}
            w="100%"
            border="1.5px dashed"
            borderColor="#c9d4e3"
            borderRadius="10px"
            p="16px 18px"
            textAlign="left"
          >
            <Text
              fontSize="11px"
              fontWeight="600"
              letterSpacing="0.06em"
              textTransform="uppercase"
              color="#6b7280"
              mb={1}
            >
              User Credentials
            </Text>
            <Text fontSize="13px" color="#374151" mb={1}>
              Username:{' '}
              <Text as="span" fontWeight="600">
                {credentials.username}
              </Text>
            </Text>
            <Text fontSize="13px" color="#374151" mb={2}>
              Email:{' '}
              <Text as="span" fontWeight="600">
                {credentials.email}
              </Text>
            </Text>

            <Flex
              align="center"
              justify="space-between"
              gap={3}
              bg="white"
              border="1px solid"
              borderColor="#e5e7eb"
              borderRadius="8px"
              px={3}
              py={2}
            >
              <Box>
                <Text
                  fontSize="11px"
                  fontWeight="600"
                  letterSpacing="0.06em"
                  textTransform="uppercase"
                  color="#6b7280"
                  mb="2px"
                >
                  Temporary Password
                </Text>
                <Text
                  fontFamily="monospace"
                  fontSize="15px"
                  fontWeight="500"
                  color="#111827"
                  letterSpacing="0.04em"
                  wordBreak="break-all"
                >
                  {credentials.generatedPassword}
                </Text>
              </Box>
              <Button
                size="sm"
                onClick={onCopy}
                bg={hasCopied ? '#f0fdf4' : '#fef3e2'}
                border="1px solid"
                borderColor={hasCopied ? '#bbf7d0' : '#f0c070'}
                borderRadius="8px"
                color={hasCopied ? '#16a34a' : '#b8821f'}
                fontSize="12.5px"
                fontWeight="500"
                px={3}
                h="34px"
                _hover={{ bg: hasCopied ? '#dcfce7' : '#fde4b0' }}
                flexShrink={0}
              >
                {hasCopied ? 'Copied!' : 'Copy'}
              </Button>
            </Flex>

            <Text fontSize="11px" color="#92400e" mt={2}>
              This password has also been emailed to {credentials.email}
            </Text>
          </Box>

          <Button
            mt={5}
            w="100%"
            height="40px"
            bg="orange.2500"
            color="white"
            borderRadius="10px"
            fontSize="14px"
            fontWeight="600"
            _hover={{ bg: '#b8821f' }}
            onClick={onClose}
          >
            Done
          </Button>
        </ModalBody>
      </ModalContent>
    </ChakraModal>
  );
};
