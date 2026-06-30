import {
  Box,
  Button,
  Center,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Spinner,
  Text,
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Add, Search } from '../../../assets/svgs';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useDebounce } from '../../../hooks/useDebounce';
import { CreateRole } from '../components/CreateRole';
import { EditRole } from '../components/EditRole';
import { ViewRole } from '../components/ViewRole';
import {
  useGetRolesandPermissions,
  useDeleteRole,
} from '../service/rolesandPermissions';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { DataTable } from '../../../component/Table/DataTable';
import { useRolesColumns } from '../columns/roles.col';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';
import type { RolesandPermissionsResponse } from '../types/PermissionsType';

type StatusFilter = '' | 'ACTIVE' | 'INACTIVE';

export const RolesAndPermissions = () => {
  const { addModalOpen } = useModalSearchParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchTerm = searchParams.get('search') || '';
  const statusFilter = (searchParams.get('status') || '') as StatusFilter;
  const moduleFilter = searchParams.get('module') || '';

  const debouncedSearch = useDebounce(searchTerm, 500);

  const {
    data: roles,
    isLoading,
    isError,
  } = useGetRolesandPermissions({
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
    module: moduleFilter || undefined,
  });

  // Fetch all roles (no filter) to populate the module dropdown
  const { data: allRoles } = useGetRolesandPermissions();

  const allModules = useMemo(() => {
    if (!allRoles?.length) return [];
    const modules = new Set<string>();
    allRoles.forEach((role) =>
      role.rolePermissions.forEach((rp) => modules.add(rp.permission.module)),
    );
    return Array.from(modules).sort();
  }, [allRoles]);

  const [roleToDelete, setRoleToDelete] =
    useState<RolesandPermissionsResponse | null>(null);
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();

  const deleteRole = useDeleteRole();

  const handleDeleteClick = (role: RolesandPermissionsResponse) => {
    setRoleToDelete(role);
    onDeleteOpen();
  };

  const handleConfirmDelete = () => {
    if (roleToDelete) {
      deleteRole.mutate(roleToDelete.id.toString(), {
        onSuccess: () => {
          setRoleToDelete(null);
          onDeleteClose();
        },
      });
    }
  };

  const handleSearchChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('search', value);
    } else {
      newParams.delete('search');
    }
    setSearchParams(newParams);
  };

  const handleStatusChange = (value: StatusFilter) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('status', value);
    } else {
      newParams.delete('status');
    }
    setSearchParams(newParams);
  };

  const handleModuleChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('module', value);
    } else {
      newParams.delete('module');
    }
    setSearchParams(newParams);
  };

  const rolesColumns = useRolesColumns({
    onDelete: handleDeleteClick,
  });

  const renderContent = () => {
    if (isLoading) {
      return (
        <Center py={12}>
          <Spinner size="lg" color="primary.1700" />
        </Center>
      );
    }

    if (isError) {
      return (
        <Center py={10}>
          <Text color="gray.500">Failed to load roles</Text>
        </Center>
      );
    }

    return (
      <DataTable
        data={roles ?? []}
        columns={rolesColumns}
        showCheckbox={false}
        emptyStateText="No roles available"
      />
    );
  };

  return (
    <>
      <Box
        border="1px solid"
        borderColor="primary.1200"
        borderRadius="xl"
        pt={4}
        pb={6}
        px={6}
        bg="white"
        position="relative"
      >
        <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
          <VStack align="start" spacing={0}>
            <Text variant="xl_medium" color="primary.1700">
              Roles & Permissions
            </Text>
            <Text variant="sm_normal" color="gray.1600">
              Manage roles and their assigned permission scopes.
            </Text>
          </VStack>
          {usePermission(PERMISSIONS.ROLES_AND_PERMISSIONS_CREATE) && (
            <Button
              px="24px"
              height="38px"
              leftIcon={<Add color="white" />}
              onClick={() => addModalOpen('createRole')}
            >
              Create Role
            </Button>
          )}
        </Flex>

        <Flex align="center" mb={4} gap={3}>
          <HStack spacing={3}>
            <InputGroup bg="gray.25" borderRadius="xl" minW="300px">
              <InputLeftElement pointerEvents="none">
                <Search />
              </InputLeftElement>
              <Input
                placeholder="Search by name or label..."
                fontSize="xs"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </InputGroup>
            <Select
              aria-label="Filter for modules"
              placeholder="All"
              fontSize="xs"
              borderRadius="xl"
              maxW="200px"
              value={moduleFilter}
              onChange={(e) => handleModuleChange(e.target.value)}
            >
              {allModules.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Filter for status"
              placeholder="All status"
              fontSize="xs"
              borderRadius="xl"
              maxW="160px"
              value={statusFilter}
              onChange={(e) =>
                handleStatusChange(e.target.value as StatusFilter)
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </HStack>
        </Flex>

        {renderContent()}
      </Box>

      <CreateRole />
      <EditRole roles={roles} />
      <ViewRole roles={roles} />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={onDeleteClose}
        onConfirm={handleConfirmDelete}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${roleToDelete?.label}"? Users assigned this role will lose its permissions.`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={deleteRole.isPending}
        colorScheme="red"
      />
    </>
  );
};
