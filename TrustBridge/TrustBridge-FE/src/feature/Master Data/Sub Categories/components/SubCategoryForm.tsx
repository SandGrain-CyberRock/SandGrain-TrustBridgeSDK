import { useEffect } from 'react';
import { Flex } from '@chakra-ui/react';
import {
  FormProvider,
  SelectInput,
  TextFieldInput,
} from '../../../../component/Form';
import { AddModal } from '../../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useSubCategoryForm } from '../hooks/SubCategoryForm';
import {
  useCreateSubCategory,
  useGetSubCategoryById,
  useUpdateSubCategory,
} from '../service/SubCategory';
import { useGetCategories } from '../../Categories/service/Category';
import type { SubCategoryFormValues } from '../types/SubCategory.types';

export const SubCategoryForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const id = searchParams.get('id') ?? '';
  const isUpdate = searchParams.get('type') === 'updateSubCategory';

  const { subCategoryFormMethods } = useSubCategoryForm();
  const { handleSubmit, reset } = subCategoryFormMethods;

  const { data: subCategoryData } = useGetSubCategoryById(id, !!id && isUpdate);
  const { data: categories } = useGetCategories();
  const createSubCategory = useCreateSubCategory();
  const updateSubCategory = useUpdateSubCategory();

  const categoryOptions =
    categories?.map((c) => ({
      label: c.category_name,
      value: String(c.category_id),
    })) ?? [];

  useEffect(() => {
    if (!isUpdate) {
      reset({ sub_category_name: '', category_id: '' });
    } else if (subCategoryData) {
      reset({
        sub_category_name: subCategoryData.sub_category_name,
        category_id: String(subCategoryData.category_id),
      });
    }
  }, [isUpdate, subCategoryData, reset]);

  const onSubmit = async (data: SubCategoryFormValues) => {
    const payload = {
      sub_category_name: data.sub_category_name,
      category_id: Number(data.category_id),
    };
    if (isUpdate && id) {
      await updateSubCategory.mutateAsync({ id, data: payload });
    } else {
      await createSubCategory.mutateAsync(payload);
    }
    reset();
    modalClose();
  };

  return (
    <FormProvider methods={subCategoryFormMethods}>
      <AddModal
        isOpen={shouldOpen('addSubCategory') || shouldOpen('updateSubCategory')}
        onClose={modalClose}
        title={isUpdate ? 'Edit Sub-Category' : 'Add Sub-Category'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdate ? 'Save Changes' : 'Add'}
        isLoading={createSubCategory.isPending || updateSubCategory.isPending}
      >
        <Flex direction="column" gap={4}>
          <SelectInput
            name="category_id"
            label="Category"
            isRequired
            isSearchable
            selectOption={categoryOptions}
            placeholder="Select Category"
          />
          <TextFieldInput
            name="sub_category_name"
            label="Sub-Category Name"
            isRequired
            maxLength={50}
            placeholder="Enter Sub-Category Name"
          />
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
