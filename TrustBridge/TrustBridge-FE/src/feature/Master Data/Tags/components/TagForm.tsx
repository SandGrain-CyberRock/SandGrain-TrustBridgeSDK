import { useEffect } from 'react';
import { Flex } from '@chakra-ui/react';
import { FormProvider, TextFieldInput } from '../../../../component/Form';
import { AddModal } from '../../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useTagForm } from '../hooks/TagForm';
import { useCreateTag, useGetTagById, useUpdateTag } from '../service/Tag';
import type { TagFormValues } from '../types/Tag.types';

export const TagForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const id = searchParams.get('id') ?? '';
  const isUpdate = searchParams.get('type') === 'updateTag';

  const { tagFormMethods } = useTagForm();
  const { handleSubmit, reset } = tagFormMethods;

  const { data: tagData } = useGetTagById(id, !!id && isUpdate);
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();

  useEffect(() => {
    if (!isUpdate) {
      reset({ tag_name: '' });
    } else if (tagData) {
      reset({ tag_name: tagData.tag_name });
    }
  }, [isUpdate, tagData, reset]);

  const onSubmit = async (data: TagFormValues) => {
    if (isUpdate && id) {
      await updateTag.mutateAsync({ id, data });
    } else {
      await createTag.mutateAsync(data);
    }
    reset();
    modalClose();
  };

  return (
    <FormProvider methods={tagFormMethods}>
      <AddModal
        isOpen={shouldOpen('addTag') || shouldOpen('updateTag')}
        onClose={modalClose}
        title={isUpdate ? 'Edit Tag' : 'Add Tag'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdate ? 'Save Changes' : 'Add'}
        isLoading={createTag.isPending || updateTag.isPending}
      >
        <Flex direction="column" gap={4}>
          <TextFieldInput
            name="tag_name"
            label="Tag Name"
            isRequired
            maxLength={30}
            placeholder="Enter Tag Name"
          />
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
