export type DeviceProfileResponse = {
  profile_id: number;
  profile_name: string;
  category_id: number | null;
  sub_category_id: number | null;
  status: 'ACTIVE' | 'INACTIVE';
  is_default: boolean;
  category: { category_id: number; category_name: string } | null;
  subCategory: { sub_category_id: number; sub_category_name: string } | null;
  tags: { tag_id: number; tag_name: string }[];
  mqtt_server: string | null;
  mqtt_username: string | null;
  mqtt_password: string | null;
  qos_level: string | null;
  tls_type: string | null;
  claim_type: string | null;
  auth_frequency: number | null;
  max_failed_auth_attempts: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateDeviceProfilePayload = {
  profile_name: string;
  category_id?: number;
  sub_category_id?: number;
  tag_ids?: number[];
  status?: string;
  is_default?: boolean;
  // Profile Params fields in device profile table
  mqtt_server?: string;
  mqtt_username?: string;
  mqtt_password?: string;
  qos_level?: string;
  tls_type?: string;
  claim_type?: string;
  auth_frequency?: number;
  max_failed_auth_attempts?: number;
};

export type UpdateDeviceProfilePayload = Partial<CreateDeviceProfilePayload>;

export type DeviceProfileFormValues = {
  profile_name: string;
  category_id: string;
  sub_category_id: string;
  tag_ids: number[];
  status?: string;
  is_default: boolean;
  // Profile Params - hidden in UI but stored in DB
  mqtt_server: string;
  mqtt_username: string;
  mqtt_password: string;
  qos_level: string;
  tls_type: string;
  claim_type: string;
  auth_frequency: string;
  max_failed_auth_attempts: string;
};

export type DeviceProfileListResponse = {
  data: DeviceProfileResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
