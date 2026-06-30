export type AddUserType = {
  name: string;
  username: string;
  email: string;
  companyTitle: string;
  role: number;
  organizationId: number;
};

export type RoleType = {
  id?: number;
  name: string;
  label: string;
  icon: string;
  icon_color: string;
  description: string;
  created_at: string;
};

export type UserRolesType = {
  user_id: number;
  role_id: number;
  role: RoleType;
};

export type OrgType = {
  ou_id: number;
  ou_name: string;
  ou_description: string;
  ou_status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
};

export type UsersType = {
  user_id: number;
  ou_id: number;
  name: string | null;
  company_title: string | null;
  username: string;
  email: string;
  user_status: 'ACTIVE' | 'INACTIVE';
  failed_logins: number;
  acc_locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  org: OrgType;
  userRoles: UserRolesType[];
};

export type UpdateUserPayload = {
  name?: string;
  company_title?: string;
  user_status?: 'ACTIVE' | 'INACTIVE';
  role_id?: number;
};
