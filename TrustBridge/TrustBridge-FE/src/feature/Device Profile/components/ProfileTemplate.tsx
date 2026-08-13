import { Badge, Box, HStack, IconButton, Text, VStack } from '@chakra-ui/react';
import type { DeviceProfileResponse } from '../types/DeviceProfile.types';
import { Edit, Setting4, Trash } from '../../../assets/svgs';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';

interface ProfileTemplateProps {
  data: DeviceProfileResponse;
}

export const ProfileTemplate = ({ data }: ProfileTemplateProps) => {
  const { modalOpen } = useModalSearchParams();

  return (
    <Box
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      p={'4'}
      bg="white"
      position="relative"
      _hover={{ boxShadow: 'md' }}
      transition="all 0.2s"
      w="100%"
    >
      <HStack justify="space-between" mb={3}>
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <HStack spacing={2}>
            <Text variant="lgg_medium" color="primary.1700" noOfLines={1}>
              {data.profile_name}
            </Text>
            <Text variant="xs_normal" color="gray.500">
              #{data.profile_id}
            </Text>
            {data.is_default && (
              <Badge
                bg="#007CAA"
                color="#FEFFFF"
                borderRadius="full"
                px={2}
                fontSize="xs"
              >
                Default
              </Badge>
            )}
          </HStack>
          <Badge
            colorScheme={data.status === 'ACTIVE' ? 'green' : 'gray'}
            borderRadius="full"
            px={2}
          >
            {data.status}
          </Badge>
        </VStack>
        <HStack spacing={1}>
          <IconButton
            aria-label="Edit profile"
            icon={<Edit />}
            size="sm"
            variant="ghost"
            onClick={() => modalOpen(String(data.profile_id), 'updateProfile')}
          />
          <IconButton
            aria-label="Delete profile"
            icon={<Trash />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() => modalOpen(String(data.profile_id), 'deleteProfile')}
          />
        </HStack>
      </HStack>

      {(data.category || data.subCategory) && (
        <HStack spacing={2} mt={3}>
          <Setting4 />
          <Text variant="ssm_normal" color="gray.1600">
            {[data.category?.category_name, data.subCategory?.sub_category_name]
              .filter(Boolean)
              .join(' / ')}
          </Text>
        </HStack>
      )}

      {data.tags.length > 0 && (
        <HStack mt={3} flexWrap="wrap" gap={2}>
          {data.tags.map((tag) => (
            <Text
              key={tag.tag_id}
              border="solid 1px"
              borderColor="bgSecondary.1200"
              borderRadius="12px"
              p={1}
              variant="xs_normal"
            >
              {tag.tag_name}
            </Text>
          ))}
        </HStack>
      )}

      {/* Profile Params from device profile table */}
      {(data.qos_level || data.claim_type || data.tls_type) && (
        <VStack align="start" mt={3} spacing={2}>
          <HStack flexWrap="wrap" gap={2}>
            {data.qos_level && (
              <Text
                bg="primary.1200"
                borderRadius={'8px'}
                variant="sm_normal"
                color="primary.1900"
                py={'4px'}
                px={'12px'}
              >
                QoS: {data.qos_level}
              </Text>
            )}
            {data.claim_type && (
              <Text
                bg="primary.1200"
                borderRadius={'8px'}
                variant="sm_normal"
                color="primary.1900"
                py={'4px'}
                px={'12px'}
              >
                {data.claim_type}
              </Text>
            )}
            {data.tls_type && (
              <Text
                bg="primary.1200"
                borderRadius={'8px'}
                variant="sm_normal"
                color="primary.1900"
                py={'4px'}
                px={'12px'}
              >
                TLS: {data.tls_type}
              </Text>
            )}
          </HStack>
        </VStack>
      )}
    </Box>
  );
};
