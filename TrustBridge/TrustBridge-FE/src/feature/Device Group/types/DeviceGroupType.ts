export type DeviceGroup = {
  device_group_id: number;
  group_id: string;
  group_name: string;
  password: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CreateDeviceGroupPayload = {
  group_name: string;
  password: string;
  tenant_id?: string;
};

export type UpdateDeviceGroupPayload = {
  group_id?: string;
  group_name?: string;
  password?: string;
  status?: string;
};

export type DeviceGroupFormValues = {
  group_name: string;
  password: string;
};
