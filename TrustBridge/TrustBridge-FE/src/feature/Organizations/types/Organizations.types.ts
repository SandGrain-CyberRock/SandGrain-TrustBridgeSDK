export type Tenant = {
  tenant_id: string;
  ou_id: number;
  tenant_status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
};

export type OrganizationsResponse = {
  ou_id: number;
  ou_name: string;
  ou_description: string;
  ou_status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
  tenants: Tenant[];
};

export type AddOrganizationsType = {
  name: string;
  description: string;
};

export type UpdateOrganizationsType = {
  ou_name?: string;
  ou_description?: string;
  ou_status?: 'ACTIVE' | 'INACTIVE';
};
