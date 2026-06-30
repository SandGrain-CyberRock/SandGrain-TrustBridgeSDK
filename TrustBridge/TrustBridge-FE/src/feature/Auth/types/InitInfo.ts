export type InitInfo = {
  user_id: number;
  username: string;
  name: string | null;
  email: string;
  ou_id: number;
  org: {
    ou_id: number;
    ou_name: string;
  };
  tenant_ids: string[];
  roles: string[];
  permissions: string[];
  credentialsConfigured: boolean;
  needsInitialization: boolean;
  mustChangePassword: boolean;
};
