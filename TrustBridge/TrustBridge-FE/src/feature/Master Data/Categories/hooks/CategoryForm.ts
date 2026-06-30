import { useForm, type Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { CategoryFormValues } from '../types/Category.types';
import { categoryDefaultValues } from '../const/defaultValues';
import { categorySchema } from '../schema/Category.schema';

export const useCategoryForm = () => {
  const formMethods = useForm<CategoryFormValues>({
    defaultValues: categoryDefaultValues,
    resolver: yupResolver(categorySchema) as Resolver<CategoryFormValues>,
  });
  return { categoryFormMethods: formMethods };
};
