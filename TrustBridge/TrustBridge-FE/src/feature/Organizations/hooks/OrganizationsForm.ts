import { useForm } from 'react-hook-form';
import type { AddOrganizationsType } from '../types/Organizations.types';
import { addOrganizationSchema } from '../schema/Organizations.schema';
import { yupResolver } from '@hookform/resolvers/yup';
import { addOrganizationsDefaultValue } from '../const/addOrganizationsDefaultValue';

export const useAddOrganizationsForm = () => {
  const formMethods = useForm<AddOrganizationsType>({
    defaultValues: addOrganizationsDefaultValue,
    resolver: yupResolver(addOrganizationSchema),
  });

  return {
    addOrganizationsFormMethods: formMethods,
  };
};
