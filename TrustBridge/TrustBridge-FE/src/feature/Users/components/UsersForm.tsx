import { useEffect, useState } from 'react';
import { SimpleGrid } from '@chakra-ui/react';
import { AddModal } from '../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import {
  FormProvider,
  SelectInput,
  TextFieldInput,
} from '../../../component/Form';
import { useAddUserForm } from '../hooks/useAddUserForm';
import type { AddUserType, UpdateUserPayload } from '../types/UsersType';
import { useAddUser, useUpdateUser, useGetUserById } from '../service/Users';
import { useGetRolesandPermissions } from '../../RBAC/service/rolesandPermissions';
import { ViewUsersDetails } from './ViewUsersDetails';
import { UserCredentialsModal } from './UserCredentialsModal';

type UsersFormProps = {
  OrganizationId?: number;
};

export const UsersForm = ({ OrganizationId }: UsersFormProps) => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const { addUserFormMethods } = useAddUserForm();
  const addUser = useAddUser();
  const updateUser = useUpdateUser();
  const { handleSubmit, reset } = addUserFormMethods;

  const [createdCredentials, setCreatedCredentials] = useState<{
    username: string;
    email: string;
    generatedPassword: string;
  } | null>(null);

  const id = searchParams.get('id') ?? '';
  const type = searchParams.get('type');
  const isUpdateMode = type === 'updateUser';

  const { data: roles } = useGetRolesandPermissions();

  const { data: userData, refetch } = useGetUserById(id, !!id && isUpdateMode);

  // Filter out TRUST_ADMIN role — it is not assignable via the form
  const roleOptions = (roles || [])
    .filter((role) => role.name !== 'TRUST_ADMIN')
    .map((role) => ({
      label: role.name,
      value: role.id,
    }));

  useEffect(() => {
    if (isUpdateMode && userData) {
      reset({
        name: userData.name ?? '',
        username: userData.username,
        email: userData.email,
        companyTitle: userData.company_title ?? '',
        role: userData.userRoles?.[0]?.role_id ?? 0,
        organizationId: userData.ou_id,
      });
    } else if (!isUpdateMode) {
      reset({
        organizationId: OrganizationId,
      });
    }
  }, [userData, isUpdateMode, reset]);

  useEffect(() => {
    if (isUpdateMode && id) {
      refetch();
    }
  }, [isUpdateMode, id, refetch]);

  const onSubmit = async (data: AddUserType) => {
    try {
      if (isUpdateMode) {
        if (!userData) return;

        const payload: UpdateUserPayload = {
          name: data.name,
          company_title: data.companyTitle,
          user_status: userData.user_status,
          role_id: Number(data.role),
        };

        await updateUser.mutateAsync({ id, data: payload });
        modalClose();
      } else {
        const response = await addUser.mutateAsync(data);
        const created = response.data?.data;
        modalClose();
        if (created?.generatedPassword) {
          setCreatedCredentials({
            username: created.username,
            email: created.email,
            generatedPassword: created.generatedPassword,
          });
        }
      }
    } catch {
      // Error notification is handled by onError in the mutation hooks
    }
  };

  return (
    <>
      <FormProvider methods={addUserFormMethods}>
        <AddModal
          isOpen={shouldOpen('addUser') || shouldOpen('updateUser')}
          onClose={() => {
            reset({
              name: '',
              username: '',
              email: '',
              companyTitle: '',
              role: 0,
              organizationId: OrganizationId,
            });
            modalClose();
          }}
          title={isUpdateMode ? 'Edit User Details' : 'Add User'}
          onSubmit={handleSubmit(onSubmit)}
          submitButtonLabel={isUpdateMode ? 'Save Changes' : 'Add'}
          isLoading={addUser.isPending || updateUser.isPending}
          childBodyPaddingX={4}
          childBodyPaddingY={4}
        >
          <SimpleGrid columns={2} columnGap={4} rowGap={6} width="100%">
            <TextFieldInput
              name="name"
              label="Name"
              isRequired
              placeholder="Enter Name"
              maxLength={100}
            />
            {!isUpdateMode && (
              <TextFieldInput
                name="username"
                label="Username"
                isRequired
                placeholder="Enter Username"
                maxLength={100}
              />
            )}
            {!isUpdateMode && (
              <TextFieldInput
                name="email"
                label="Email Address"
                isRequired
                placeholder="Enter Email Address"
                maxLength={100}
              />
            )}
            <TextFieldInput
              name="companyTitle"
              label="Company Title"
              isRequired
              placeholder="Enter Company Title"
              maxLength={100}
            />
            <SelectInput
              name="role"
              label="Role"
              isRequired
              selectOption={roleOptions}
              placeholder="Select Role"
            />
          </SimpleGrid>
        </AddModal>
      </FormProvider>
      <ViewUsersDetails />
      {createdCredentials && (
        <UserCredentialsModal
          isOpen={!!createdCredentials}
          onClose={() => setCreatedCredentials(null)}
          credentials={createdCredentials}
        />
      )}
    </>
  );
};
