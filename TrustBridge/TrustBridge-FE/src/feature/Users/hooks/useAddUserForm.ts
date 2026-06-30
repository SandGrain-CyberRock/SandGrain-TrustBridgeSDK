import { useForm } from 'react-hook-form';
import type { AddUserType } from '../types/UsersType';
import { addUserDefaultValue } from '../const/addUserDefaultValue';
import { yupResolver } from '@hookform/resolvers/yup';
import { addUserSchema } from '../schema/addUser.schema';

export const useAddUserForm = () => {
  const formMethods = useForm<AddUserType>({
    defaultValues: addUserDefaultValue,
    resolver: yupResolver(addUserSchema),
  });

  return {
    addUserFormMethods: formMethods,
  };
};
