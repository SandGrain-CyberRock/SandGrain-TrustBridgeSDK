import { useEffect } from 'react';
import { Flex } from '@chakra-ui/react';
import { FormProvider, TextFieldInput } from '../../../../component/Form';
import { AddModal } from '../../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useCategoryForm } from '../hooks/CategoryForm';
import {
  useCreateCategory,
  useGetCategoryById,
  useUpdateCategory,
} from '../service/Category';
import type { CategoryFormValues } from '../types/Category.types';

export const CategoryForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const id = searchParams.get('id') ?? '';
  const isUpdate = searchParams.get('type') === 'updateCategory';

  const { categoryFormMethods } = useCategoryForm();
  const { handleSubmit, reset } = categoryFormMethods;

  const { data: categoryData } = useGetCategoryById(id, !!id && isUpdate);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();

  useEffect(() => {
    if (!isUpdate) {
      reset({ category_name: '' });
    } else if (categoryData) {
      reset({ category_name: categoryData.category_name });
    }
  }, [isUpdate, categoryData, reset]);

  const onSubmit = async (data: CategoryFormValues) => {
    if (isUpdate && id) {
      await updateCategory.mutateAsync({ id, data });
    } else {
      await createCategory.mutateAsync(data);
    }
    reset();
    modalClose();
  };

  return (
    <FormProvider methods={categoryFormMethods}>
      <AddModal
        isOpen={shouldOpen('addCategory') || shouldOpen('updateCategory')}
        onClose={modalClose}
        title={isUpdate ? 'Edit Category' : 'Add Category'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdate ? 'Save Changes' : 'Add'}
        isLoading={createCategory.isPending || updateCategory.isPending}
      >
        <Flex direction="column" gap={4}>
          <TextFieldInput
            name="category_name"
            label="Category Name"
            isRequired
            maxLength={50}
            placeholder="Enter Category Name"
          />
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
