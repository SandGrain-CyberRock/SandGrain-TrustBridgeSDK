import { useEffect, useRef, useMemo } from 'react';
import { Flex, SimpleGrid } from '@chakra-ui/react';
import {
  FormProvider,
  SelectInput,
  TextFieldInput,
} from '../../../component/Form';
import { MultiSelectInput } from '../../../component/Form/Input/MultiSelectInput';
import { CheckboxFieldInput } from '../../../component/Form/Input/CheckBoxField';
import { AddModal } from '../../../component/Modal/AddModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useCreateProfileForm } from '../hooks/createProfileForm';
import {
  useCreateDeviceProfile,
  useGetDeviceProfileById,
  useUpdateDeviceProfile,
} from '../service/DeviceProfile';
import { useGetCategories } from '../../Master Data/Categories/service/Category';
import { useGetSubCategories } from '../../Master Data/Sub Categories/service/SubCategory';
import { useGetTags } from '../../Master Data/Tags/service/Tag';
import type { DeviceProfileFormValues } from '../types/DeviceProfile.types';

export const CreateProfileForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const id = searchParams.get('id') ?? '';
  const isUpdate = searchParams.get('type') === 'updateProfile';

  const { createProfileFormMethods } = useCreateProfileForm();
  const { handleSubmit, reset, watch, setValue } = createProfileFormMethods;

  const selectedCategoryId = watch('category_id');
  const isFirstRender = useRef(true);

  const { data: profileData } = useGetDeviceProfileById(id, !!id && isUpdate);
  const { data: categories } = useGetCategories();
  const { data: subCategories } = useGetSubCategories(
    selectedCategoryId || undefined,
  );
  const { data: tags } = useGetTags();

  const createProfile = useCreateDeviceProfile();
  const updateProfile = useUpdateDeviceProfile();

  const categoryOptions =
    categories?.map((c) => ({
      label: c.category_name,
      value: String(c.category_id),
    })) ?? [];

  const subCategoryOptions =
    subCategories?.map((sc) => ({
      label: sc.sub_category_name,
      value: String(sc.sub_category_id),
    })) ?? [];

  const tagOptions =
    tags?.map((t) => ({
      label: t.tag_name,
      value: t.tag_id,
    })) ?? [];

  // Profile Params - disabled with default values
  const qosLevelOptions = useMemo(() => [{ value: '1', label: '1' }], []);

  const tlsTypeOptions = useMemo(
    () => [{ value: 'TLS 1.3', label: 'TLS 1.3' }],
    [],
  );

  const claimTypeOptions = useMemo(
    () => [{ value: 'auto', label: 'auto' }],
    [],
  );

  // Reset sub_category_id when category changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setValue('sub_category_id', '');
  }, [selectedCategoryId, setValue]);

  useEffect(() => {
    isFirstRender.current = true;
    if (!isUpdate) {
      reset({
        profile_name: '',
        category_id: '',
        sub_category_id: '',
        tag_ids: [],
        status: 'ACTIVE',
        is_default: false,
        // Profile Params - stored in DB
        mqtt_server: '',
        mqtt_username: '',
        mqtt_password: '',
        qos_level: '1',
        tls_type: 'TLS 1.3',
        claim_type: 'auto',
        auth_frequency: '',
        max_failed_auth_attempts: '',
      });
    } else if (profileData) {
      reset({
        profile_name: profileData.profile_name,
        category_id: profileData.category_id
          ? String(profileData.category_id)
          : '',
        sub_category_id: profileData.sub_category_id
          ? String(profileData.sub_category_id)
          : '',
        tag_ids: profileData.tags.map((t) => t.tag_id),
        status: profileData.status,
        is_default: profileData.is_default ?? false,
        // Profile Params
        mqtt_server: profileData.mqtt_server ?? '',
        mqtt_username: profileData.mqtt_username ?? '',
        mqtt_password: profileData.mqtt_password ?? '',
        qos_level: profileData.qos_level ?? '1',
        tls_type: profileData.tls_type ?? 'TLS 1.3',
        claim_type: profileData.claim_type ?? 'auto',
        auth_frequency:
          profileData.auth_frequency != null
            ? String(profileData.auth_frequency)
            : '',
        max_failed_auth_attempts:
          profileData.max_failed_auth_attempts != null
            ? String(profileData.max_failed_auth_attempts)
            : '',
      });
    }
  }, [isUpdate, profileData, reset]);

  const onSubmit = async (data: DeviceProfileFormValues) => {
    const payload = {
      profile_name: data.profile_name,
      category_id: data.category_id ? Number(data.category_id) : undefined,
      sub_category_id: data.sub_category_id
        ? Number(data.sub_category_id)
        : undefined,
      tag_ids: data.tag_ids,
      status: data.status,
      is_default: data.is_default,
      // Profile Params - stored in device profile table
      mqtt_server: data.mqtt_server || undefined,
      mqtt_username: data.mqtt_username || undefined,
      mqtt_password: data.mqtt_password || undefined,
      qos_level: data.qos_level || '1',
      tls_type: data.tls_type || 'TLS 1.2',
      claim_type: data.claim_type || 'auto',
      auth_frequency: data.auth_frequency
        ? parseInt(data.auth_frequency, 10)
        : undefined,
      max_failed_auth_attempts: data.max_failed_auth_attempts
        ? parseInt(data.max_failed_auth_attempts, 10)
        : undefined,
    };

    if (isUpdate && id) {
      await updateProfile.mutateAsync({ id, data: payload });
    } else {
      await createProfile.mutateAsync(payload);
    }
    reset();
    modalClose();
  };

  return (
    <FormProvider methods={createProfileFormMethods}>
      <AddModal
        isOpen={shouldOpen('createProfile') || shouldOpen('updateProfile')}
        onClose={modalClose}
        title={isUpdate ? 'Edit Profile' : 'Create Profile'}
        onSubmit={handleSubmit(onSubmit)}
        submitButtonLabel={isUpdate ? 'Save Changes' : 'Create'}
        isLoading={createProfile.isPending || updateProfile.isPending}
      >
        <Flex direction="column" gap={4}>
          <SimpleGrid columns={2} columnGap={6} rowGap={4} width="100%">
            <TextFieldInput
              name="profile_name"
              label="Profile Name"
              isRequired
              placeholder="Enter Profile Name"
              maxLength={100}
            />
            <SelectInput
              name="category_id"
              label="Category"
              isSearchable
              isClearable
              selectOption={categoryOptions}
              isRequired
              placeholder="Select Category"
            />
            <SelectInput
              name="sub_category_id"
              label="Sub Category"
              isSearchable
              isClearable
              selectOption={subCategoryOptions}
              placeholder="Select Sub Category"
              isDisabled={!selectedCategoryId}
              isRequired
            />
          </SimpleGrid>

          {/* Profile Params - disabled (stored in DB) */}
          <SimpleGrid columns={2} columnGap={6} rowGap={4} width="100%">
            <SelectInput
              name="qos_level"
              label="QoS Level"
              selectOption={qosLevelOptions}
              isDisabled
            />
            <SelectInput
              name="tls_type"
              label="TLS Type"
              selectOption={tlsTypeOptions}
              isDisabled
            />
            <SelectInput
              name="claim_type"
              label="Claim Type"
              selectOption={claimTypeOptions}
              isDisabled
            />

            <TextFieldInput
              name="auth_frequency"
              label="Auth Frequency (seconds)"
              placeholder="Enter Auth Frequency"
              type="number"
            />
            <TextFieldInput
              name="max_failed_auth_attempts"
              label="Max Failed Auth Attempts"
              placeholder="Enter Max Failed Attempts"
              type="number"
            />
          </SimpleGrid>

          <MultiSelectInput
            name="tag_ids"
            label="Tags"
            options={tagOptions}
            placeholder="Select Tags"
          />
          <CheckboxFieldInput
            name="is_default"
            label="Set as default profile (automatically assigned to devices with no profile selected)"
          />
        </Flex>
      </AddModal>
    </FormProvider>
  );
};
