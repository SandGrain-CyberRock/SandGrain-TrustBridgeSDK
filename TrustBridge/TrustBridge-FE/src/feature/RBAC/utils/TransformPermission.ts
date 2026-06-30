import type {
  ModuleType,
  PermissionsType,
  RolesandPermissionsResponse,
  RolesApiResponse,
  Permission,
  RolePermissionItem,
  PermissionAction,
  ApiPermissionAction,
} from '../types/PermissionsType';

// Action mapping utilities
const ACTION_MAP: Record<ApiPermissionAction, PermissionAction> = {
  retrieve: 'read',
  create: 'create',
  update: 'update',
  delete: 'delete',
};

const REVERSE_ACTION_MAP: Record<PermissionAction, ApiPermissionAction> = {
  read: 'retrieve',
  create: 'create',
  update: 'update',
  delete: 'delete',
};

export const mapApiActionToPermission = (action: string): PermissionAction =>
  ACTION_MAP[action as ApiPermissionAction] || (action as PermissionAction);

export const mapPermissionToApiAction = (
  action: PermissionAction,
): ApiPermissionAction => REVERSE_ACTION_MAP[action];

// Create empty permissions object
const createEmptyPermissions = (): PermissionsType => ({
  create: false,
  read: false,
  update: false,
  delete: false,
});

// Check if all permissions in an object are true
export const areAllPermissionsChecked = (
  permissions: PermissionsType,
): boolean => Object.values(permissions).every(Boolean);

// Calculate parent permissions based on all children
const calculateParentPermissions = (
  subModules: Array<{ permissions: PermissionsType }>,
): PermissionsType => {
  if (subModules.length === 0) return createEmptyPermissions();

  return {
    create: subModules.every((sub) => sub.permissions.create),
    read: subModules.every((sub) => sub.permissions.read),
    update: subModules.every((sub) => sub.permissions.update),
    delete: subModules.every((sub) => sub.permissions.delete),
  };
};

// Transform single role to module
export const transformRoleToModule = (
  role: RolesandPermissionsResponse,
): ModuleType => {
  const subModulesMap = new Map<string, PermissionsType>();

  role.rolePermissions.forEach(({ permission }) => {
    const subModuleName = permission.module;

    if (!subModulesMap.has(subModuleName)) {
      subModulesMap.set(subModuleName, createEmptyPermissions());
    }

    const permissionKey = mapApiActionToPermission(permission.action);
    subModulesMap.get(subModuleName)![permissionKey] = true;
  });

  const subModules = Array.from(subModulesMap.entries()).map(
    ([name, permissions]) => ({
      name,
      permissions,
    }),
  );

  return {
    name: role.label,
    expanded: false,
    permissions: calculateParentPermissions(subModules),
    subModules,
  };
};

// Transform multiple roles to modules
export const transformRolesToModules = (
  roles: RolesandPermissionsResponse[],
): ModuleType[] => roles.map(transformRoleToModule);

// Transform API response to modules
export const transformApiDataToModules = (
  apiData: RolesApiResponse,
): ModuleType[] => transformRolesToModules(apiData.data);

// Convert modules to API format
export const modulesToApiFormat = (
  modules: ModuleType[],
  roleId: number,
): RolePermissionItem[] => {
  const rolePermissions: RolePermissionItem[] = [];
  let permissionId = 1;

  modules.forEach((module) => {
    const moduleName = module.name.toLowerCase().replace(/\s+/g, '_');

    module.subModules.forEach((subModule) => {
      (
        Object.entries(subModule.permissions) as [PermissionAction, boolean][]
      ).forEach(([action, isChecked]) => {
        if (isChecked) {
          rolePermissions.push({
            role_id: roleId,
            permission_id: permissionId,
            permission: {
              id: permissionId,
              key: `${moduleName}:${mapPermissionToApiAction(action)}`,
              module: moduleName,
              action: mapPermissionToApiAction(action),
              description: subModule.name,
              created_at: new Date().toISOString(),
            },
          });
          permissionId++;
        }
      });
    });
  });

  return rolePermissions;
};

// Get selected permissions from modules
export const getSelectedPermissionsFromModules = (
  modules: ModuleType[],
): Permission[] => {
  const permissions: Permission[] = [];
  let permissionId = 1;

  modules.forEach((module) => {
    const moduleName = module.name.toLowerCase().replace(/\s+/g, '_');

    module.subModules.forEach((subModule) => {
      (
        Object.entries(subModule.permissions) as [PermissionAction, boolean][]
      ).forEach(([action, isChecked]) => {
        if (isChecked) {
          permissions.push({
            id: permissionId++,
            key: `${moduleName}:${mapPermissionToApiAction(action)}`,
            module: moduleName,
            action: mapPermissionToApiAction(action),
            description: '',
            created_at: '',
          });
        }
      });
    });
  });

  return permissions;
};

// Check if module has specific permission
export const hasModulePermission = (
  modules: ModuleType[],
  moduleName: string,
  action: string,
): boolean => {
  const module = modules.find(
    (m) =>
      m.name.toLowerCase().replace(/\s+/g, '_') === moduleName.toLowerCase(),
  );

  if (!module) return false;

  const permissionKey = mapApiActionToPermission(action);
  return module.permissions[permissionKey];
};
