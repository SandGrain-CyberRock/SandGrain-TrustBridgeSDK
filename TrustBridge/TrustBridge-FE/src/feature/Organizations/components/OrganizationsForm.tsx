import { Flex } from '@chakra-ui/react';
import {
  FormProvider,
  TextAreaInput,
  TextFieldInput,
} from '../../../component/Form';
import { AddModal } from '../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useAddOrganizationsForm } from '../hooks/OrganizationsForm';
import type { AddOrganizationsType } from '../types/Organizations.types';
import {
  useAddOrganizations,
  useUpdateOrganization,
  useGetOrganizationById,
} from '../service/Organizations';
import { useEffect } from 'react';
import { ViewOrganizationsForm } from './ViewOrganizationsForm';

export const OrganizationsForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();

  const addOrganizations = useAddOrganizations();
  const updateOrganizations = useUpdateOrganization();
  const { addOrganizationsFormMethods } = useAddOrganizationsForm();

  const id = searchParams.get('id') ?? '';
  const type = searchParams.get('type');
  const isUpdateMode = type === 'updateOrganizations';
  const { handleSubmit, reset } = addOrganizationsFormMethods;
  const { data: organizationData } = useGetOrganizationById(
    id,
    !!id && isUpdateMode,
  );

  useEffect(() => {
    if (!isUpdateMode) {
      reset({
        name: '',
        description: '',
      });
    }
    if (organizationData) {
      reset({
        name: organizationData.ou_name,
        description: organizationData.ou_description,
      });
    }
  }, [isUpdateMode, organizationData, reset]);

  const onSubmit = async (data: AddOrganizationsType) => {
    if (isUpdateMode && id) {
      await updateOrganizations.mutateAsync({
        id,
        data: {
          ou_name: data.name,
          ou_description: data.description,
        },
      });
    } else {
      await addOrganizations.mutateAsync({
        name: data.name,
        description: data.description,
      });
    }

    reset();
    modalClose();
  };

  return (
    <>
      <FormProvider methods={addOrganizationsFormMethods}>
        <AddModal
          isOpen={
            shouldOpen('addOrganizations') || shouldOpen('updateOrganizations')
          }
          onClose={modalClose}
          title={isUpdateMode ? 'Edit Organization' : 'Add Organization'}
          onSubmit={handleSubmit(onSubmit)}
          submitButtonLabel={isUpdateMode ? 'Save Changes' : 'Add '}
          isLoading={
            addOrganizations.isPending || updateOrganizations.isPending
          }
          childBodyPaddingX={6}
          childBodyPaddingY={4}
        >
          <Flex direction="column" gap={4}>
            <TextFieldInput
              name="name"
              label="Organization Name"
              isRequired
              placeholder="Enter Organization Name"
              maxLength={100}
            />

            <TextAreaInput
              name="description"
              label="Organization Description"
              isRequired
              placeholder="Enter Organization Description"
            />
          </Flex>
        </AddModal>
      </FormProvider>

      <ViewOrganizationsForm />
    </>
  );
};
