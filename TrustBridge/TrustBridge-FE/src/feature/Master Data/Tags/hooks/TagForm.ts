import { useForm, type Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { TagFormValues } from '../types/Tag.types';
import { tagDefaultValues } from '../const/defaultValues';
import { tagSchema } from '../schema/Tag.schema';

export const useTagForm = () => {
  const formMethods = useForm<TagFormValues>({
    defaultValues: tagDefaultValues,
    resolver: yupResolver(tagSchema) as Resolver<TagFormValues>,
  });
  return { tagFormMethods: formMethods };
};
