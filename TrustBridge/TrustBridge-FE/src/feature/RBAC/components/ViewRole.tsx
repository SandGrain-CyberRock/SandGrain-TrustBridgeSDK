import {
  Badge,
  Box,
  Divider,
  HStack,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { ViewModal } from '../../../component/Modal/ViewModal';
import type { RolesandPermissionsResponse } from '../types/PermissionsType';

type ViewRoleProps = {
  roles?: RolesandPermissionsResponse[];
};

export const ViewRole = ({ roles }: ViewRoleProps) => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const roleId = searchParams.get('id');

  const role = roles?.find((r) => r.id.toString() === roleId);

  if (!role) return null;

  // Group permissions by module
  const permissionsByModule = role.rolePermissions.reduce<
    Record<string, string[]>
  >((acc, rp) => {
    const mod = rp.permission.module;
    if (!acc[mod]) acc[mod] = [];
    acc[mod].push(rp.permission.key);
    return acc;
  }, {});

  const modules = Object.keys(permissionsByModule).sort();

  return (
    <ViewModal
      isOpen={shouldOpen('viewRole')}
      onClose={modalClose}
      title="Role Details"
      size="md"
      childBodyPaddingX={4}
      childBodyPaddingY={4}
    >
      <VStack align="start" spacing={4}>
        {/* Header */}
        <HStack spacing={3} align="center">
          <Badge
            px={3}
            py={1}
            borderRadius="md"
            fontSize="sm"
            style={{
              background: (role.icon_color ?? '#667eea') + '22',
              color: role.icon_color ?? '#667eea',
            }}
          >
            {role.label}
          </Badge>
          <Badge
            colorScheme={role.status === 'ACTIVE' ? 'green' : 'red'}
            borderRadius="full"
            fontSize="xs"
            px={2}
          >
            {role.status}
          </Badge>
        </HStack>

        <VStack align="start" spacing={0}>
          <Text fontSize="xs" color="gray.400" fontWeight="medium">
            System Name
          </Text>
          <Text fontSize="sm" fontWeight="semibold" color="gray.700">
            {role.name}
          </Text>
        </VStack>

        {role.description && (
          <VStack align="start" spacing={0}>
            <Text fontSize="xs" color="gray.400" fontWeight="medium">
              Description
            </Text>
            <Text fontSize="sm" color="gray.600">
              {role.description}
            </Text>
          </VStack>
        )}

        <VStack align="start" spacing={0}>
          <Text fontSize="xs" color="gray.400" fontWeight="medium">
            Created At
          </Text>
          <Text fontSize="sm" color="gray.600">
            {format(new Date(role.created_at), 'yyyy-MM-dd')}
          </Text>
        </VStack>

        {modules.length > 0 && (
          <>
            <Divider />
            <VStack align="start" spacing={3} w="full">
              <Text fontSize="xs" color="gray.400" fontWeight="medium">
                Permissions ({role.rolePermissions.length})
              </Text>
              {modules.map((mod) => (
                <Box key={mod} w="full">
                  <Text
                    fontSize="xs"
                    fontWeight="semibold"
                    color="blue.600"
                    textTransform="uppercase"
                    mb={1.5}
                  >
                    {mod}
                  </Text>
                  <Wrap spacing={1}>
                    {permissionsByModule[mod].map((key) => (
                      <WrapItem key={key}>
                        <Badge
                          variant="subtle"
                          bg="#007CAA"
                          color="#FEFFFF"
                          fontSize="2xs"
                          borderRadius="md"
                          px={1.5}
                        >
                          {key}
                        </Badge>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              ))}
            </VStack>
          </>
        )}

        {modules.length === 0 && (
          <Text fontSize="sm" color="gray.400">
            No permissions assigned.
          </Text>
        )}
      </VStack>
    </ViewModal>
  );
};
