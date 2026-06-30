import { useForm } from 'react-hook-form';
import type { CreateRoleType } from '../types/CreateRoleType';
import { createRoleDefaultValue } from '../const/createRoleDefaultValue';
import { yupResolver } from '@hookform/resolvers/yup';
import { createRoleSchema } from '../schema/createRoleSchema';

export const useCreateRoleForm = () => {
  const formMethods = useForm<CreateRoleType>({
    defaultValues: createRoleDefaultValue,
    resolver: yupResolver(createRoleSchema),
  });
  return {
    createRoleFormMethods: formMethods,
  };
};
