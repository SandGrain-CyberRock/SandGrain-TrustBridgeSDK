import { useEffect } from 'react';
import { Flex } from '@chakra-ui/react';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { AddModal } from '../../../component/Modal/AddModal';
import {
  FormProvider,
  TextAreaInput,
  TextFieldInput,
} from '../../../component/Form';
import { useCreateRoleForm } from '../hooks/useCreateRoleForm';
import {
  useGetPermissions,
  useUpdateRole,
} from '../service/rolesandPermissions';
import { SelectablePills } from '../../../component/Pills/Pills';
import type { RolesandPermissionsResponse } from '../types/PermissionsType';

type EditRoleProps = {
  roles?: RolesandPermissionsResponse[];
};

export const EditRole = ({ roles }: EditRoleProps) => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const roleId = searchParams.get('id');

  const { createRoleFormMethods } = useCreateRoleForm();
  const { handleSubmit, reset } = createRoleFormMethods;

  const { data: permissions } = useGetPermissions();
  const updateRole = useUpdateRole();

  const role = roles?.find((r) => r.id.toString() === roleId);

  // Pre-populate the form whenever the target role changes
  useEffect(() => {
    if (role) {
      reset({
        roleName: role.name,
        label: role.label,
        description: role.description ?? '',
        permission_ids: role.rolePermissions.map((rp) => rp.permission_id),
        icon: role.icon ?? 'user-cog',
        icon_color: role.icon_color ?? '#FF5500',
      });
    }
  }, [role, reset]);

  const onSubmit = async (data: {
    roleName: string;
    label: string;
    description: string;
    permission_ids: number[];
    icon: string;
    icon_color: string;
  }) => {
    if (!roleId) return;
    await updateRole.mutateAsync({
      id: roleId,
      data: {
        name: data.roleName,
        label: data.label,
        description: data.description,
        permission_ids: data.permission_ids,
        icon: data.icon,
        icon_color: data.icon_color,
      },
    });
    modalClose();
  };

  const pillOptions = (permissions || []).map((permission) => ({
    id: permission.id,
    label: permission.key,
  }));

  return (
    <FormProvider methods={createRoleFormMethods}>
      <AddModal
        isOpen={shouldOpen('editRole')}
        onClose={modalClose}
        title="Edit Role"
        submitButtonLabel="Save Changes"
        onSubmit={handleSubmit(onSubmit)}
        isLoading={updateRole.isPending}
        childBodyPaddingX={4}
        childBodyPaddingY={4}
      >
        <Flex justify="space-between" gap={2} mb={3}>
          <TextFieldInput
            name="roleName"
            label="Role Name"
            isRequired
            placeholder="Enter Role Name"
            maxLength={100}
          />
          <TextFieldInput
            name="label"
            label="Label"
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
        <SelectablePills
          name="permission_ids"
          label="Permissions"
          options={pillOptions}
        />
      </AddModal>
    </FormProvider>
  );
};
