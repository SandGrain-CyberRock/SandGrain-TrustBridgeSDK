import { FormProvider, TextFieldInput } from '../../../component/Form';
import { AddModal } from '../../../component/Modal/AddModal';
import {
  Flex,
  SimpleGrid,
  InputGroup,
  InputLeftAddon,
  Input,
  FormControl,
  FormLabel,
  Text,
  Skeleton,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useDeviceGroupForm } from '../hooks/deviceGroupForm';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import {
  useCreateDeviceGroup,
  useUpdateDeviceGroup,
  useGetDeviceGroupById,
  useGetHeartbeat,
} from '../service/DeviceGroup';
import type { DeviceGroupFormValues } from '../types/DeviceGroupType';

const PrefixedUsernameField = ({ prefix }: { prefix: string }) => {
  const {
    register,
    formState: { errors },
  } = useFormContext<DeviceGroupFormValues>();

  return (
    <FormControl isRequired isInvalid={!!errors.group_name}>
      <FormLabel fontSize="sm" fontWeight="medium">
        Device Group Name
      </FormLabel>
      <InputGroup>
        <InputLeftAddon
          bg="gray.100"
          borderColor="primary.1200"
          borderRadius="12px 0 0 12px"
          fontSize="14px"
          color="gray.600"
          px={3}
        >
          {prefix ? `${prefix}-` : ''}
        </InputLeftAddon>
        <Input
          {...register('group_name')}
          placeholder="Enter Device Group Name"
          maxLength={50}
          borderLeftRadius={0}
          borderColor="primary.1200"
          borderRadius="0 12px 12px 0"
          fontSize="14px"
          py="14px"
          px="12px"
          background="white"
          _hover={{ borderColor: 'primary.1200' }}
          _focus={{ borderColor: 'primary.1200', boxShadow: 'none' }}
        />
      </InputGroup>
      {errors.group_name && (
        <Text color="red.500" fontSize="xs" mt={1}>
          {errors.group_name.message}
        </Text>
      )}
    </FormControl>
  );
};

export const DeviceGroupForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();

  const { data: heartbeat, isLoading: heartbeatLoading } = useGetHeartbeat();

  const prefix: string = heartbeat?.tenant?.prefix ?? '';

  const createDeviceGroup = useCreateDeviceGroup();
  const updateDeviceGroup = useUpdateDeviceGroup();

  const { deviceGroupFormMethods } = useDeviceGroupForm();
  const { handleSubmit, reset } = deviceGroupFormMethods;

  const id = searchParams.get('id') ?? '';
  const type = searchParams.get('type');
  const isUpdateMode = type === 'updateDeviceGroup';

  const { data: groupDetail } = useGetDeviceGroupById(
    isUpdateMode ? parseInt(id, 10) : null,
  );

  useEffect(() => {
    if (!isUpdateMode) {
      reset({ group_name: '', password: '' });
      return;
    }
    if (groupDetail) {
      // Strip existing prefix when editing
      const rawName = groupDetail.group_name.includes('-')
        ? groupDetail.group_name.split('-').slice(1).join('-')
        : groupDetail.group_name;
      reset({ group_name: rawName, password: '' });
    }
  }, [isUpdateMode, groupDetail, reset]);

  const onModalClose = () => {
    modalClose();
    reset();
  };

  const onSubmit = async (data: DeviceGroupFormValues) => {
    const fullName = prefix ? `${prefix}-${data.group_name}` : data.group_name;

    if (isUpdateMode && groupDetail) {
      await updateDeviceGroup.mutateAsync({
        id: groupDetail.device_group_id,
        data: { group_name: fullName, password: data.password },
      });
    } else {
      await createDeviceGroup.mutateAsync({
        group_name: fullName,
        password: data.password,
        tenant_id: heartbeat?.tenant?.tenant_id,
      });
    }
    onModalClose();
  };

  return (
    <FormProvider methods={deviceGroupFormMethods}>
      <AddModal
        isOpen={shouldOpen('addDeviceGroup') || shouldOpen('updateDeviceGroup')}
        onClose={onModalClose}
        title={isUpdateMode ? 'Edit Device Group' : 'Add Device Group'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdateMode ? 'Save Changes' : 'Add Device Group'}
        isLoading={createDeviceGroup.isPending || updateDeviceGroup.isPending}
        childBodyPaddingX={6}
        childBodyPaddingY={4}
      >
        <Flex>
          <SimpleGrid columns={2} columnGap={4} rowGap={4} width="100%">
            {heartbeatLoading ? (
              <Skeleton height="48px" borderRadius="12px" />
            ) : (
              <PrefixedUsernameField prefix={prefix} />
            )}

            <TextFieldInput
              name="password"
              label="Device Group Password"
              isRequired
              type="text"
              maxLength={48}
              placeholder="Enter Device Group Password"
              tooltip="8–48 characters. Must include A–Z, a–z, and a special character."
            />
          </SimpleGrid>
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
