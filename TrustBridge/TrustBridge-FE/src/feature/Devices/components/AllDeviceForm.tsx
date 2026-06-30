import {
  FormProvider,
  SelectInput,
  TextFieldInput,
} from '../../../component/Form';
import { AddModal } from '../../../component/Modal/AddModal';
import { Flex, SimpleGrid, Text } from '@chakra-ui/react';
import { useEffect, useMemo } from 'react';
import { useGetDeviceProfiles } from '../../Device Profile/service/DeviceProfile';
import { useAllDevicesForm } from '../hooks/allDevicesForm';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import {
  useCreateDevice,
  useUpdateDevice,
  useGetDeviceById,
} from '../service/Devices';
import { useGetDeviceGroups } from '../../Device Group/service/DeviceGroup';
import type { DeviceFormValues } from '../types/AllDeviceType';
import { useInitInfo } from '../../Auth/services/InitInfo.service';

export const AllDeviceForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const { data: initAPI } = useInitInfo();
  const tenantId = initAPI?.tenant_ids?.[0] ?? '';

  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();

  const { allDeviceFormMethods } = useAllDevicesForm();
  const { handleSubmit, reset } = allDeviceFormMethods;

  const id = searchParams.get('id') ?? '';
  const type = searchParams.get('type');
  const isUpdateMode = type === 'updateDevice';

  const { data: deviceDetail } = useGetDeviceById(
    isUpdateMode ? parseInt(id, 10) : null,
  );
  const { data: deviceGroupsData } = useGetDeviceGroups();
  const { data: deviceProfilesData } = useGetDeviceProfiles({
    limit: 1000,
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (!isUpdateMode) {
      reset({
        device_name: '',
        device_serial: '',
        token_id: '',
        device_group_id: '',
        tenant_id: tenantId,
        profile_id: '',
        batch_no: '',
      });
      return;
    }

    if (deviceDetail) {
      reset({
        device_name: deviceDetail.device_name,
        device_serial: deviceDetail.device_serial ?? '',
        token_id: deviceDetail.token_id,
        device_group_id: String(deviceDetail.device_group_id),
        tenant_id: deviceDetail.tenant_id,
        profile_id: deviceDetail.profile_id
          ? String(deviceDetail.profile_id)
          : '',
        batch_no: deviceDetail.batch_no ?? '',
      });
    }
  }, [isUpdateMode, deviceDetail, reset, tenantId]);

  const deviceGroupOptions = useMemo(() => {
    const groups = deviceGroupsData?.data || [];
    return groups.map((group) => ({
      label: group.group_name,
      value: String(group.device_group_id),
    }));
  }, [deviceGroupsData]);

  const deviceProfileOptions = useMemo(() => {
    const profiles = deviceProfilesData?.data || [];
    return profiles.map((p) => ({
      label: p.profile_name,
      value: String(p.profile_id),
    }));
  }, [deviceProfilesData]);

  const onModalClose = () => {
    modalClose();
    reset();
  };

  const onSubmit = async (data: DeviceFormValues) => {
    if (isUpdateMode && deviceDetail) {
      await updateDevice.mutateAsync({
        id: deviceDetail.device_id,
        data: {
          device_name: data.device_name,
          device_serial: data.device_serial || undefined,
          token_id: data.token_id,
          device_group_id: parseInt(data.device_group_id, 10),
          tenant_id: data.tenant_id || tenantId,
          profile_id: data.profile_id
            ? parseInt(data.profile_id, 10)
            : undefined,
          batch_no: data.batch_no || undefined,
        },
      });
    } else {
      await createDevice.mutateAsync({
        device_name: data.device_name,
        device_serial: data.device_serial || undefined,
        token_id: data.token_id,
        device_group_id: parseInt(data.device_group_id, 10),
        tenant_id: data.tenant_id || tenantId,
        profile_id: data.profile_id ? parseInt(data.profile_id, 10) : undefined,
        batch_no: data.batch_no || undefined,
      });
    }

    onModalClose();
  };

  return (
    <FormProvider methods={allDeviceFormMethods}>
      <AddModal
        isOpen={shouldOpen('addDevice') || shouldOpen('updateDevice')}
        onClose={onModalClose}
        title={isUpdateMode ? 'Edit Device Details' : 'Register Device'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdateMode ? 'Save Changes' : 'Register Device'}
        isLoading={createDevice.isPending || updateDevice.isPending}
        childBodyPaddingX={6}
        childBodyPaddingY={4}
      >
        <Flex>
          <SimpleGrid columns={2} columnGap={6} rowGap={4} width="100%">
            <TextFieldInput
              name="batch_no"
              label="Batch No"
              placeholder="Enter Batch No"
              maxLength={100}
            />
            <TextFieldInput
              name="device_serial"
              label="Device Serial"
              placeholder="Enter Device Serial"
              maxLength={100}
            />

            <TextFieldInput
              name="device_name"
              label="Device Name"
              isRequired
              placeholder="Enter Device Name"
              maxLength={100}
            />
            <Flex direction="column" gap={1}>
              <SelectInput
                name="profile_id"
                label="Device Profile"
                selectOption={deviceProfileOptions}
                placeholder="Select Device Profile"
              />
              <Text fontSize="xs" color="gray.400">
                If not selected, the default profile will be used.
              </Text>
            </Flex>

            <SelectInput
              name="device_group_id"
              label="Device Group"
              isRequired
              selectOption={deviceGroupOptions}
              placeholder="Select Device Group"
            />
            <TextFieldInput
              name="token_id"
              label="Token ID"
              isRequired
              placeholder="Enter Token ID"
              maxLength={100}
            />
          </SimpleGrid>
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
