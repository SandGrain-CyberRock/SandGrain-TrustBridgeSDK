import type { DeviceProfileFormValues } from '../types/DeviceProfile.types';

export const createProfileDefaultValue: DeviceProfileFormValues = {
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
  tls_type: 'TLS 1.2',
  claim_type: 'auto',
  auth_frequency: '',
  max_failed_auth_attempts: '',
};
