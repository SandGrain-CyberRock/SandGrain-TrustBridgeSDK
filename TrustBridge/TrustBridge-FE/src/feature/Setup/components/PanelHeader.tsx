import { Box, Flex, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface PanelHeaderProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  icon: ReactNode;
}

export const PanelHeader = ({
  step,
  totalSteps,
  title,
  description,
  icon,
}: PanelHeaderProps) => (
  <Flex
    align="center"
    gap="14px"
    px="28px"
    py="24px"
    pb="20px"
    borderBottom="1px solid"
    borderColor="#e5e7eb"
    bg="#f8fafc"
  >
    <Flex
      w="44px"
      h="44px"
      borderRadius="12px"
      border="1px solid"
      borderColor="#f0c070"
      bgGradient="linear(135deg, #fef3e2, #fde4b0)"
      align="center"
      justify="center"
      flexShrink={0}
    >
      {icon}
    </Flex>
    <Box>
      <Text
        fontSize="10.5px"
        fontWeight="600"
        letterSpacing="0.07em"
        textTransform="uppercase"
        color="#91691d"
        mb="3px"
      >
        Step {step} of {totalSteps}
      </Text>
      <Text
        fontSize="18px"
        fontWeight="700"
        color="#111827"
        letterSpacing="-0.01em"
      >
        {title}
      </Text>
      <Text fontSize="12.5px" color="#6b7280" mt="2px">
        {description}
      </Text>
    </Box>
  </Flex>
);

export const SectionLabel = ({ children }: { children: string }) => (
  <Flex
    align="center"
    gap="8px"
    mb={4}
    fontSize="10.5px"
    fontWeight="600"
    letterSpacing="0.08em"
    textTransform="uppercase"
    color="#6b7280"
    _after={{
      content: '""',
      flex: 1,
      height: '1px',
      bg: '#e5e7eb',
    }}
  >
    {children}
  </Flex>
);

export const FormCard = ({ children }: { children: ReactNode }) => (
  <Box
    border="1px solid"
    borderColor="#dde5ee"
    borderRadius="14px"
    bg="#fbfbfc"
    p="20px"
    mb={4}
  >
    {children}
  </Box>
);

export const PanelBody = ({ children }: { children: ReactNode }) => (
  <Box px="28px" py="24px" pb="26px">
    {children}
  </Box>
);
