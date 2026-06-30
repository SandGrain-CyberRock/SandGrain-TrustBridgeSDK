import {
  Badge,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import type { RolesandPermissionsResponse } from '../types/PermissionsType';
import { More } from '../../../assets/svgs';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { StatusToggle } from '../../../component/StatusToggle/StatusToggle';
import { useUpdateRole } from '../service/rolesandPermissions';

type StatusValue = 'ACTIVE' | 'INACTIVE';

type UseRolesColumnsProps = {
  onDelete?: (role: RolesandPermissionsResponse) => void;
};

const ROLE_COLORS: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  OPERATOR: {
    bg: '#B0E6FA',
    color: '#004964',
    border: '#004964',
  },
  ADMINISTRATOR: {
    bg: '#FDECEC',
    color: '#832525',
    border: '#832525',
  },
  TRUST_ADMIN: {
    bg: '#FBF0CE',
    color: '#54432C',
    border: '#54432C',
  },
  DEFAULT: {
    bg: '#FFF4E5',
    color: '#b65100',
    border: '#b65100',
  },
};

export const useRolesColumns = ({ onDelete }: UseRolesColumnsProps = {}): Array<
  ColumnDef<RolesandPermissionsResponse>
> => {
  const { modalOpen } = useModalSearchParams();
  const canUpdate = usePermission(PERMISSIONS.ROLES_AND_PERMISSIONS_UPDATE);
  const canDelete = usePermission(PERMISSIONS.ROLES_AND_PERMISSIONS_DELETE);
  const { mutate: updateRole, isPending } = useUpdateRole();

  const showEdit = canUpdate;
  const showDelete = canDelete;

  return [
    {
      header: 'Role',
      cell: ({ row: { original } }) => {
        const role = original.name;
        const roleColors = ROLE_COLORS[role] ?? ROLE_COLORS.DEFAULT;

        return (
          <VStack align="start" spacing={0}>
            <HStack spacing={2}>
              <Badge
                px={2}
                py={0.5}
                borderRadius="md"
                fontSize="xs"
                bg={roleColors.bg}
                color={roleColors.color}
              >
                {original.label}
              </Badge>
            </HStack>
            <Text fontSize="xs" color="gray.400" mt={0.5}>
              {original.name}
            </Text>
          </VStack>
        );
      },
    },
    {
      header: 'Status',
      cell: ({ row: { original } }) => (
        <StatusToggle
          id={original.id.toString()}
          currentStatus={original.status as StatusValue}
          isLoading={isPending}
          onToggle={({ id, nextStatus }) =>
            updateRole({ id, data: { status: nextStatus } })
          }
        />
      ),
    },
    {
      header: 'Permission Scope',
      cell: ({ row: { original } }) => {
        const modules = [
          ...new Set(
            original.rolePermissions.map((rp) => rp.permission.module),
          ),
        ].sort();

        if (!modules.length) {
          return (
            <Text fontSize="sm" color="gray.400">
              No permissions
            </Text>
          );
        }

        return (
          <Wrap spacing={1}>
            {modules.map((mod) => (
              <WrapItem key={mod}>
                <Badge
                  bg="#007CAA"
                  color="#FEFFFF"
                  variant="subtle"
                  colorScheme="blue"
                  borderRadius="md"
                  px={1.5}
                >
                  {mod}
                </Badge>
              </WrapItem>
            ))}
          </Wrap>
        );
      },
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      cell: ({ row: { original } }) => (
        <Text fontSize="sm">
          {format(new Date(original.created_at), 'yyyy-MM-dd')}
        </Text>
      ),
    },
    {
      header: 'Actions',
      cell: ({ row: { original } }) => {
        const hasItems = showEdit || (showDelete && !!onDelete);

        if (!hasItems) return null;

        return (
          <Menu>
            <MenuButton
              as={IconButton}
              icon={<More />}
              variant="ghost"
              size="sm"
              aria-label="Actions"
            />
            <MenuList minW="140px" paddingX="2" borderRadius="xl">
              <MenuItem
                onClick={() => modalOpen(original.id.toString(), 'viewRole')}
              >
                View
              </MenuItem>
              {showEdit && (
                <MenuItem
                  onClick={() => modalOpen(original.id.toString(), 'editRole')}
                >
                  Edit
                </MenuItem>
              )}
              {showDelete && onDelete && (
                <MenuItem color="red.500" onClick={() => onDelete(original)}>
                  Delete
                </MenuItem>
              )}
            </MenuList>
          </Menu>
        );
      },
    },
  ];
};
