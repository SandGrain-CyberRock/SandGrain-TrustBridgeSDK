import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import type { DeviceGroupFormValues } from '../types/DeviceGroupType';
import { deviceGroupDefaultValue } from '../const/deviceGroupDefaultValue';
import { deviceGroupSchema } from '../schema/deviceGroup.schema';

export const useDeviceGroupForm = () => {
  const formMethods = useForm<DeviceGroupFormValues>({
    defaultValues: deviceGroupDefaultValue,
    resolver: yupResolver(deviceGroupSchema),
  });

  return { deviceGroupFormMethods: formMethods };
};
