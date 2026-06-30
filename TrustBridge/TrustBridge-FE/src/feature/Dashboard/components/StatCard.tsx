import { Box, VStack, Text } from '@chakra-ui/react';
import { Icon } from '../../../component/Icon';
import type { StatCardType } from '../types/StatCardType';

export const StatCard = ({
  title,
  value,
  growth,
  growthColor,
  iconName,
  bgColor,
  color,
}: StatCardType) => {
  return (
    <Box
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      p={6}
      bg="white"
      position="relative"
      _hover={{ boxShadow: 'md' }}
      transition="all 0.2s"
    >
      <VStack align="start" spacing={1}>
        <Text variant="sm_normal" color="gray.500">
          {title}
        </Text>

        <Text variant="xxl_bold">{value}</Text>

        <Text variant="sm_normal" color={growthColor}>
          {growth}
        </Text>
      </VStack>

      <Box
        position="absolute"
        top={4}
        right={4}
        bgColor={bgColor}
        p={3}
        borderRadius="xl"
      >
        <Icon name={iconName} height="20px" width="20px" color={color} />
      </Box>
    </Box>
  );
};
