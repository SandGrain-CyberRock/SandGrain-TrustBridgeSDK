import { useCallback, useState } from 'react';
import type { ModuleType, Permission } from '../types/PermissionsType';
import {
  getSelectedPermissionsFromModules,
  hasModulePermission,
} from '../utils/TransformPermission';

interface UsePermissionsReturn {
  modules: ModuleType[];
  setModules: React.Dispatch<React.SetStateAction<ModuleType[]>>;
  getSelectedPermissions: () => Permission[];
  hasPermission: (module: string, action: string) => boolean;
}

export const usePermissions = (
  initialModules: ModuleType[] = [],
): UsePermissionsReturn => {
  const [modules, setModules] = useState<ModuleType[]>(initialModules);

  const getSelectedPermissions = useCallback(
    (): Permission[] => getSelectedPermissionsFromModules(modules),
    [modules],
  );

  const hasPermission = useCallback(
    (moduleName: string, action: string): boolean =>
      hasModulePermission(modules, moduleName, action),
    [modules],
  );

  return {
    modules,
    setModules,
    getSelectedPermissions,
    hasPermission,
  };
};
