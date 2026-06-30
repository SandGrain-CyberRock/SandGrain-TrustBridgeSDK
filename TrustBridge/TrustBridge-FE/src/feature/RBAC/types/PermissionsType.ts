export type PermissionAction = 'create' | 'read' | 'update' | 'delete';
export type ApiPermissionAction = 'create' | 'retrieve' | 'update' | 'delete';

export type PermissionsType = Record<PermissionAction, boolean>;

export type Permission = {
  id: number;
  key: string;
  module: string;
  action: ApiPermissionAction;
  description: string;
  created_at: string;
};

export type RolePermissionItem = {
  role_id: number;
  permission_id: number;
  permission: Permission;
};

export type RolesandPermissionsResponse = {
  id: number;
  name: string;
  label: string;
  icon: string;
  icon_color: string;
  description: string;
  status: string;
  created_at: string;
  rolePermissions: RolePermissionItem[];
};

export type RolesApiResponse = {
  data: RolesandPermissionsResponse[];
};

export type SubModule = {
  name: string;
  permissions: PermissionsType;
};

export type ModuleType = {
  name: string;
  expanded: boolean;
  permissions: PermissionsType;
  subModules: SubModule[];
};
