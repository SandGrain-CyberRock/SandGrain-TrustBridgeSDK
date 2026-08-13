export type Device = {
  device_id: number;
  device_name: string;
  device_serial?: string;
  token_id: string;
  device_type: string;
  device_group_id: number;
  tenant_id: string;
  profile_id?: number;
  batch_no?: string;
  deviceProfile?: { profile_id: number; profile_name: string };
  status: string;
  is_active: boolean;
  status_message?: string;
  is_approved?: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
  failed_auth_attempts?: number;
  created_at: string;
  updated_at: string;
  deviceGroup: {
    device_group_id: number;
    group_name: string;
    created_at: string;
    updated_at: string;
  };
  deleted_at?: string | null;
};

export type CreateDevicePayload = {
  device_name: string;
  device_serial?: string;
  token_id: string;
  device_type?: string;
  device_group_id: number;
  tenant_id: string;
  profile_id?: number;
  batch_no?: string;
};

export type UpdateDevicePayload = {
  device_name?: string;
  device_serial?: string;
  token_id?: string;
  device_type?: string;
  device_group_id?: number;
  tenant_id?: string;
  profile_id?: number;
  batch_no?: string;
  status?: string;
  is_active?: boolean;
  is_approved?: boolean;
};

export type DeviceFormValues = {
  device_name: string;
  device_serial?: string;
  token_id: string;
  device_group_id: string;
  tenant_id?: string;
  profile_id: string;
  batch_no?: string;
};

// Legacy type for backward compatibility
export type AllDevice = Device;

export type AllDeviceRegisterModal = DeviceFormValues;
