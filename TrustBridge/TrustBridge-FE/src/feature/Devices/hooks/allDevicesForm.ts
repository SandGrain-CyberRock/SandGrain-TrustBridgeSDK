import { useForm, type Resolver } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { DeviceFormValues } from '../types/AllDeviceType';
import { allDevicesDefaultValue } from '../const/allDevicesDefaultValue';
import { allDevicesSchema } from '../schema/allDevices.schema';

export const useAllDevicesForm = () => {
  const formMethods = useForm<DeviceFormValues>({
    defaultValues: allDevicesDefaultValue,
    resolver: yupResolver(allDevicesSchema) as Resolver<DeviceFormValues>,
  });

  return {
    allDeviceFormMethods: formMethods,
  };
};
