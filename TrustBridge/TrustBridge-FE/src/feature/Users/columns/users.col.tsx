import {
  Badge,
  IconButton,
  Text,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  VStack,
} from '@chakra-ui/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { UsersType } from '../types/UsersType';
import { More } from '../../../assets/svgs';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { StatusToggle } from '../../../component/StatusToggle/StatusToggle';
import { useUpdateUser } from '../service/Users';
import { useInitInfo } from '../../Auth/services/InitInfo.service';

type UseUsersColumnsProps = {
  onDelete?: (user: UsersType) => void;
  onResetPassword?: (user: UsersType) => void;
};

const isAccountLocked = (accLockedUntil: string | null): boolean => {
  if (!accLockedUntil) return false;
  return new Date(accLockedUntil) > new Date();
};

export const useUsersColumns = ({
  onDelete,
  onResetPassword,
}: UseUsersColumnsProps): Array<ColumnDef<UsersType>> => {
  const { modalOpen } = useModalSearchParams();
  const canUpdate = usePermission(PERMISSIONS.USER_UPDATE);
  const canDelete = usePermission(PERMISSIONS.USER_DELETE);
  const { data: initInfo } = useInitInfo();

  const { mutate, isPending } = useUpdateUser();
  return [
    {
      header: 'Username',
      accessorKey: 'username',
    },
    {
      header: 'Email Address',
      accessorKey: 'email',
    },
    {
      header: 'Role',
      accessorFn: (row) => row.userRoles?.[0]?.role?.name ?? '-',
    },
    {
      header: 'Company Title',
      accessorKey: 'company_title',
    },
    {
      header: 'Status',
      accessorKey: 'user_status',
      cell: ({ row: { original } }) => {
        const locked = isAccountLocked(original.acc_locked_until);
        const isDisabled = original.user_id === initInfo?.user_id;
        return (
          <VStack align="start" spacing={1}>
            <StatusToggle
              id={original.user_id.toString()}
              currentStatus={original.user_status}
              isLoading={isPending}
              isDisabled={isDisabled}
              onToggle={({ id, nextStatus }) =>
                mutate({
                  id,
                  data: { user_status: nextStatus },
                })
              }
            />
            {locked && (
              <Badge colorScheme="red" borderRadius="md" fontSize="2xs">
                Locked
              </Badge>
            )}
          </VStack>
        );
      },
    },
    {
      header: 'Created At',
      accessorKey: 'created_at',
      cell: ({ row: { original } }) => {
        return (
          <Text>{new Date(original.created_at).toLocaleDateString()}</Text>
        );
      },
    },
    {
      header: 'Actions',
      cell: ({ row: { original } }) => {
        const userId: number | undefined = original?.user_id;
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Menu>
              <MenuButton
                as={IconButton}
                icon={<More />}
                variant="ghost"
                size="sm"
                aria-label="Actions"
              />
              <MenuList minW="160px" paddingX="2" borderRadius="xl">
                <MenuItem
                  onClick={() => {
                    if (userId !== undefined && userId !== null) {
                      modalOpen(userId.toString(), 'viewUser');
                    }
                  }}
                >
                  View
                </MenuItem>
                {canUpdate && (
                  <MenuItem
                    onClick={() => {
                      if (userId !== undefined && userId !== null) {
                        modalOpen(userId.toString(), 'updateUser');
                      }
                    }}
                  >
                    Edit
                  </MenuItem>
                )}
                {canUpdate && onResetPassword && (
                  <MenuItem
                    color="orange.500"
                    onClick={() => onResetPassword(original)}
                  >
                    Reset Password
                  </MenuItem>
                )}
                {canDelete &&
                  onDelete &&
                  original.user_id !== initInfo?.user_id && (
                    <MenuItem
                      color="red.500"
                      onClick={() => onDelete(original)}
                    >
                      Delete
                    </MenuItem>
                  )}
              </MenuList>
            </Menu>
          </div>
        );
      },
    },
  ];
};
