import { Box, Flex, Text, VStack } from '@chakra-ui/react';
import { Icon } from '../../../component/Icon';
import type { ActivityCardProps } from '../types/ActivityCardType';

export const ActivityCard = ({
  iconName,
  title,
  timestamp,
  bgColor = 'primary.1100',
  color,
}: ActivityCardProps) => {
  return (
    <Box
      bg="white"
      p={3}
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="md"
      minW="0"
      mb={2}
    >
      <Flex gap={3} my={'5px'}>
        <Box
          bg={bgColor}
          color={color}
          height="45px"
          width="45px"
          borderRadius="lg"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Icon name={iconName} height="25px" width="25px" />
        </Box>

        <VStack align="start" spacing={0}>
          <Text variant="sm_medium" color={'primary.1700'}>
            {title}
          </Text>
          <Text variant="sm_normal" color="gray.400">
            {timestamp}
          </Text>
        </VStack>
      </Flex>
    </Box>
  );
};
