import { useForm, type Resolver } from 'react-hook-form';
import type { DeviceProfileFormValues } from '../types/DeviceProfile.types';
import { createProfileDefaultValue } from '../const/createDeviceDefaultValue';
import { createProfileSchema } from '../schema/createProfile.schema';
import { yupResolver } from '@hookform/resolvers/yup';

export const useCreateProfileForm = () => {
  const formMethods = useForm<DeviceProfileFormValues>({
    defaultValues: createProfileDefaultValue,
    resolver: yupResolver(
      createProfileSchema,
    ) as unknown as Resolver<DeviceProfileFormValues>,
  });

  return {
    createProfileFormMethods: formMethods,
  };
};
