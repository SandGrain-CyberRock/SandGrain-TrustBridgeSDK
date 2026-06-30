export type Device = {
  deviceId: string;
  serialNumber: string;
  type: string;
  deviceGroup: { group_name: string } | null;
  deviceProfile: { profile_id: number; profile_name: string } | null;
  lastSeen: string;
  authEvents: number;
  status: string;
  is_active: boolean;
};
