import { useForm, type Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { SubCategoryFormValues } from '../types/SubCategory.types';
import { subCategoryDefaultValues } from '../const/defaultValues';
import { subCategorySchema } from '../schema/SubCategory.schema';

export const useSubCategoryForm = () => {
  const formMethods = useForm<SubCategoryFormValues>({
    defaultValues: subCategoryDefaultValues,
    resolver: yupResolver(subCategorySchema) as Resolver<SubCategoryFormValues>,
  });
  return { subCategoryFormMethods: formMethods };
};
