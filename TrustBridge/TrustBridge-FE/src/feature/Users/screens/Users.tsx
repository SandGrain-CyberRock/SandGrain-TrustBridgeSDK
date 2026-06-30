import { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { Add, Search } from '../../../assets/svgs';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import {
  useGetUsers,
  exportUsers,
  useDeleteUser,
  useAdminResetPassword,
} from '../service/Users';
import { DataTable } from '../../../component/Table/DataTable';
import { useUsersColumns } from '../columns/users.col';
import { UsersForm } from '../components/UsersForm';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { useInitInfo } from '../../Auth/services/InitInfo.service';
import { useDebounce } from '../../../hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';
import type { UsersType } from '../types/UsersType';
import { ExportMenu } from '../../../component/ExportMenu/ExportMenu';
import { useGetRolesandPermissions } from '../../RBAC/service/rolesandPermissions';
import { UserCredentialsModal } from '../components/UserCredentialsModal';

export const Users = () => {
  const { addModalOpen } = useModalSearchParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: initInfo } = useInitInfo();
  const OrganizationId = initInfo?.org?.ou_id;

  const searchTerm = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const roleFilter = searchParams.get('role') || '';
  const statusFilter = searchParams.get('status') || '';

  const debouncedSearch = useDebounce(searchTerm, 500);

  const { data: usersResponse } = useGetUsers({
    page,
    limit,
    search: debouncedSearch,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });

  const { data: roles } = useGetRolesandPermissions();

  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const {
    isOpen: isResetPasswordOpen,
    onOpen: onResetPasswordOpen,
    onClose: onResetPasswordClose,
  } = useDisclosure();
  const [userToDelete, setUserToDelete] = useState<UsersType | null>(null);
  const [userToReset, setUserToReset] = useState<UsersType | null>(null);
  const [resetCredentials, setResetCredentials] = useState<{
    username: string;
    email: string;
    generatedPassword: string;
  } | null>(null);

  const deleteUser = useDeleteUser();
  const resetPassword = useAdminResetPassword();

  const usersData = usersResponse?.users || [];
  const totalUsers = usersResponse?.pagination?.total || 0;

  const canRetrieve = usePermission(PERMISSIONS.USER_RETRIEVE);

  const handleSearchChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('search', value);
    } else {
      newParams.delete('search');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
  };

  const handlePageSizeChange = (newLimit: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('limit', String(newLimit));
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const openAddUserModal = () => {
    addModalOpen('addUser');
  };

  const handleDeleteClick = (user: UsersType) => {
    setUserToDelete(user);
    onDeleteOpen();
  };

  const handleResetPasswordClick = (user: UsersType) => {
    setUserToReset(user);
    onResetPasswordOpen();
  };

  const handleConfirmDelete = () => {
    if (userToDelete?.user_id) {
      deleteUser.mutate(userToDelete.user_id.toString());
      setUserToDelete(null);
    }
  };

  const handleConfirmResetPassword = () => {
    if (userToReset?.user_id) {
      resetPassword.mutate(userToReset.user_id.toString(), {
        onSuccess: (response) => {
          const credentials = response.data.data;
          setUserToReset(null);
          onResetPasswordClose();
          setResetCredentials(credentials);
        },
      });
    }
  };

  const usersColumns = useUsersColumns({
    onDelete: handleDeleteClick,
    onResetPassword: handleResetPasswordClick,
  });

  return (
    <>
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
        <Flex justify="space-between">
          <VStack align="start">
            <Text variant="xl_medium" color={'primary.1700'}>
              Users
            </Text>
            <Text variant="sm_normal" color="gray.1600">
              Complete list of users in the system
            </Text>
          </VStack>
          <VStack align="end" spacing={4}>
            <HStack>
              {usePermission(PERMISSIONS.USER_CREATE) && (
                <Button
                  variant="primary"
                  px="24px"
                  py="10px"
                  leftIcon={<Add color="white" />}
                  onClick={openAddUserModal}
                >
                  <Text variant="sm_normal">Add Users</Text>
                </Button>
              )}
            </HStack>
          </VStack>
        </Flex>

        <Flex justify="space-between" align="center" mt={4} gap={3}>
          <HStack spacing={3}>
            <InputGroup bg="gray.25" borderRadius="xl" minW="300px">
              <InputLeftElement pointerEvents="none">
                <Search />
              </InputLeftElement>
              <Input
                placeholder="Search by username, email, or name..."
                fontSize="xs"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </InputGroup>

            <Select
              aria-label="Filter by roles"
              placeholder="All roles"
              fontSize="xs"
              borderRadius="xl"
              maxW="180px"
              value={roleFilter}
              onChange={(e) => handleFilterChange('role', e.target.value)}
            >
              {(roles ?? []).map((role) => (
                <option key={role.id} value={role.name}>
                  {role.label}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Filter by status"
              placeholder="All status"
              fontSize="xs"
              borderRadius="xl"
              maxW="160px"
              value={statusFilter}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </HStack>

          <Box>
            <ExportMenu
              onExport={exportUsers}
              exportOptions={{ search: debouncedSearch }}
              filename="users-export"
              canExport={canRetrieve}
            />
          </Box>
        </Flex>

        <DataTable
          data={usersData}
          columns={usersColumns}
          showCheckbox={false}
          emptyStateText="No users available"
          footerProps={{
            currentPage: page,
            pageSize: limit,
            totalCount: totalUsers,
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange,
          }}
        />
      </Box>

      <UsersForm OrganizationId={OrganizationId} />

      <ConfirmDialog
        isOpen={isResetPasswordOpen}
        onClose={onResetPasswordClose}
        onConfirm={handleConfirmResetPassword}
        title="Reset User Password"
        message={`Send a temporary password to "${userToReset?.name || userToReset?.username}"? They will receive it by email and must change it on next login.`}
        confirmText="Send Reset"
        cancelText="Cancel"
        isLoading={resetPassword.isPending}
        colorScheme="orange"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={onDeleteClose}
        onConfirm={handleConfirmDelete}
        title="Delete User"
        message={`Are you sure you want to delete "${userToDelete?.name || userToDelete?.username}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={deleteUser.isPending}
        colorScheme="red"
      />

      {resetCredentials && (
        <UserCredentialsModal
          isOpen={!!resetCredentials}
          onClose={() => setResetCredentials(null)}
          credentials={resetCredentials}
          title="Password Reset Successfully"
          subtitle="The user's password has been reset. Please share the new credentials below."
        />
      )}
    </>
  );
};
