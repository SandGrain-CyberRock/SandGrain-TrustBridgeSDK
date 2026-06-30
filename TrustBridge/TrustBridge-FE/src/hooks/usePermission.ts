import { useInitInfo } from '../feature/Auth/services/InitInfo.service';

export const usePermission = (permissions: string) => {
  const { data: initAPI } = useInitInfo();
  return initAPI?.permissions && initAPI.permissions.includes(permissions);
};
