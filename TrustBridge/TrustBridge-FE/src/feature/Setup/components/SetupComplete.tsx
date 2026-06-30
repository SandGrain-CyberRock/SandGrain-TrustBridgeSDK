import { Box, Button, Flex, Text, useClipboard } from '@chakra-ui/react';
import type { InitializeResponse } from '../types/Setup.types';

interface SetupCompleteProps {
  data: InitializeResponse;
  onGoToDashboard: () => void;
}

export const SetupComplete = ({
  data,
  onGoToDashboard,
}: SetupCompleteProps) => {
  const { onCopy, hasCopied } = useClipboard(data.adminUser.generatedPassword);

  return (
    <Flex
      direction="column"
      align="center"
      px="28px"
      py="52px"
      pb="48px"
      textAlign="center"
    >
      {/* Green checkmark icon */}
      <Flex
        w="68px"
        h="68px"
        borderRadius="full"
        bg="#f0fdf4"
        border="2px solid"
        borderColor="#bbf7d0"
        align="center"
        justify="center"
        mb={5}
      >
        <svg
          width="32"
          height="32"
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
        fontSize="22px"
        fontWeight="700"
        color="#111827"
        mb={2}
        letterSpacing="-0.02em"
      >
        TrustBridge Initialised
      </Text>
      <Text fontSize="14px" color="#6b7280" maxW="360px" lineHeight="1.6">
        Your instance is ready. All three setup steps have been completed
        successfully.
      </Text>

      {/* Summary */}
      <Box
        mt={7}
        w="100%"
        maxW="420px"
        bg="#f8fafc"
        border="1px solid"
        borderColor="#e5e7eb"
        borderRadius="12px"
        px="18px"
        py="14px"
        textAlign="left"
      >
        <SummaryRow label="Password changed" value="TrustAdmin" />
        <SummaryRow
          label="Organisation & integrations"
          value={data.organization.ou_name}
        />
        <SummaryRow
          label="Admin user created"
          value={data.adminUser.name}
          isLast
        />
      </Box>

      {/* Credentials box */}
      <Box
        mt={5}
        w="100%"
        maxW="420px"
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
          Admin Credentials
        </Text>
        <Text fontSize="13px" color="#374151" mb={1}>
          Username:{' '}
          <Text as="span" fontWeight="600">
            {data.adminUser.username}
          </Text>
        </Text>
        <Text fontSize="13px" color="#374151" mb={2}>
          Email:{' '}
          <Text as="span" fontWeight="600">
            {data.adminUser.email}
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
              {data.adminUser.generatedPassword}
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
          This password has also been emailed to {data.adminUser.email}
        </Text>
      </Box>

      {/* Go to Dashboard button */}
      <Button
        mt={6}
        w="100%"
        maxW="420px"
        height="44px"
        bg="orange.2500"
        color="white"
        borderRadius="10px"
        fontSize="14px"
        fontWeight="600"
        _hover={{ bg: '#b8821f' }}
        onClick={onGoToDashboard}
      >
        Go to Dashboard
      </Button>
    </Flex>
  );
};

const SummaryRow = ({
  label,
  value,
  isLast = false,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) => (
  <Flex
    align="center"
    gap="10px"
    py="7px"
    borderBottom={isLast ? 'none' : '1px solid'}
    borderColor="#e5e7eb"
  >
    <Flex
      w="20px"
      h="20px"
      borderRadius="full"
      bg="#dcfce7"
      align="center"
      justify="center"
      flexShrink={0}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#16a34a"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </Flex>
    <Text fontSize="13px" color="#6b7280" flex={1}>
      {label}
    </Text>
    <Text fontSize="13px" fontWeight="600" color="#111827">
      {value}
    </Text>
  </Flex>
);
