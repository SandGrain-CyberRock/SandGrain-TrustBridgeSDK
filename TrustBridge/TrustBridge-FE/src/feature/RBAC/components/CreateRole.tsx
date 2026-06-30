import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { AddModal } from '../../../component/Modal/AddModal';
import { Box, Divider, Flex, Text } from '@chakra-ui/react';
import {
  FormProvider,
  TextAreaInput,
  TextFieldInput,
} from '../../../component/Form';
import { useCreateRoleForm } from '../hooks/useCreateRoleForm';
import {
  useAddRolesandPermissions,
  useGetPermissions,
} from '../service/rolesandPermissions';
import type { CreateRoleType } from '../types/CreateRoleType';
import { SelectablePills } from '../../../component/Pills/Pills';
import type { Permission } from '../types/PermissionsType';

export const CreateRole = () => {
  const { shouldOpen, modalClose } = useModalSearchParams();

  const { createRoleFormMethods } = useCreateRoleForm();

  const { data: permissions } = useGetPermissions();

  const createRole = useAddRolesandPermissions();

  const { handleSubmit, reset } = createRoleFormMethods;

  const onSubmit = async (data: CreateRoleType) => {
    await createRole.mutateAsync(data);
    reset();
    modalClose();
  };

  const groupedPermissions = (permissions || []).reduce<
    Record<string, Permission[]>
  >((acc, perm) => {
    if (!acc[perm.module]) acc[perm.module] = [];
    acc[perm.module].push(perm);
    return acc;
  }, {});

  return (
    <FormProvider methods={createRoleFormMethods}>
      <AddModal
        isOpen={shouldOpen('createRole')}
        onClose={modalClose}
        title="Create Roles"
        submitButtonLabel="Create"
        onSubmit={handleSubmit(onSubmit)}
        isLoading={createRole.isPending}
        childBodyPaddingX={4}
        childBodyPaddingY={4}
      >
        <Flex justify={'space-between'} gap={2} mb={3}>
          <TextFieldInput
            name="roleName"
            label="Role Name"
            isRequired
            placeholder="Enter Role Name"
            maxLength={100}
          />
          <TextFieldInput
            name="label"
            label="Label "
            isRequired
            placeholder="Enter Label"
            maxLength={100}
          />
        </Flex>
        <TextAreaInput
          name="description"
          label="Description"
          isRequired
          placeholder="Enter Description"
        />

        <Text variant="sm_medium" mt={4} mb={2}>
          Permissions
        </Text>
        <Divider mb={3} />

        {Object.entries(groupedPermissions).map(([module, perms]) => (
          <Box key={module} mb={4}>
            <Text
              fontSize="xs"
              fontWeight="700"
              textTransform="uppercase"
              color="gray.500"
              letterSpacing="wider"
              mb={2}
            >
              {module.replace(/_/g, ' ')}
            </Text>
            <SelectablePills
              name="permission_ids"
              options={perms.map((p) => ({ id: p.id, label: p.action }))}
            />
          </Box>
        ))}
      </AddModal>
    </FormProvider>
  );
};
