import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../lib/Axios';
import { ROLES_AND_PERMISSIONS_API } from '../api';
import type { ErrorResponse, SuccesRolesResponse } from '../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Permission,
  RolesandPermissionsResponse,
} from '../types/PermissionsType';
import type { CreateRoleType } from '../types/CreateRoleType';
import { useNotification } from '../../../hooks/useNotification';
import { invalidateActivityLog } from '../../Dashboard/service/Dashboard';

type UpdateRolePayload = Partial<{
  name: string;
  label: string;
  description: string;
  permission_ids: number[];
  icon: string;
  icon_color: string;
  status: string;
}>;

interface GetRolesParams {
  search?: string;
  status?: string;
  module?: string;
}

const getRolesandPermissions = (params?: GetRolesParams) => {
  return httpClient.get<SuccesRolesResponse<RolesandPermissionsResponse[]>>(
    generatePath(ROLES_AND_PERMISSIONS_API.GET_ROLES),
    { params },
  );
};

const useGetRolesandPermissions = (params?: GetRolesParams) => {
  return useQuery({
    queryKey: [ROLES_AND_PERMISSIONS_API.GET_ROLES, params],
    queryFn: () => getRolesandPermissions(params),
    select: ({ data }) => data.data,
    placeholderData: (previousData) => previousData,
  });
};

const getPermissions = () => {
  return httpClient.get<SuccesRolesResponse<[Permission]>>(
    generatePath(ROLES_AND_PERMISSIONS_API.GET_PERMISSIONS),
  );
};

const useGetPermissions = () => {
  return useQuery({
    queryKey: [ROLES_AND_PERMISSIONS_API.GET_PERMISSIONS],
    queryFn: getPermissions,
    select: ({ data }) => data.data,
  });
};

const addRolesandPermissions = (data: CreateRoleType) => {
  const payload = {
    name: data.roleName,
    label: data.label,
    description: data.description,
    permission_ids: data.permission_ids || [],
    icon: data.icon || 'user-cog',
    icon_color: data.icon_color || '#FF5500',
  };

  return httpClient.post<SuccesRolesResponse<null>>(
    generatePath(ROLES_AND_PERMISSIONS_API.CREATE_ROLE),
    payload,
  );
};

const useAddRolesandPermissions = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [ROLES_AND_PERMISSIONS_API.CREATE_ROLE],
    mutationFn: addRolesandPermissions,

    onSuccess: (response) => {
      const { data } = response;

      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [ROLES_AND_PERMISSIONS_API.GET_ROLES],
      });
      invalidateActivityLog(queryClient);
    },

    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const updateRole = ({ id, data }: { id: string; data: UpdateRolePayload }) => {
  return httpClient.patch<SuccesRolesResponse<RolesandPermissionsResponse>>(
    generatePath(ROLES_AND_PERMISSIONS_API.UPDATE_ROLE, { id }),
    data,
  );
};

const useUpdateRole = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRole,
    onSuccess: (response) => {
      successNotification(response.data.message);
      queryClient.invalidateQueries({
        queryKey: [ROLES_AND_PERMISSIONS_API.GET_ROLES],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const deleteRole = (id: string) => {
  return httpClient.delete<SuccesRolesResponse<null>>(
    generatePath(ROLES_AND_PERMISSIONS_API.DELETE_ROLE, { id }),
  );
};

const useDeleteRole = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRole,
    onSuccess: (response) => {
      successNotification(response.data.message);
      queryClient.invalidateQueries({
        queryKey: [ROLES_AND_PERMISSIONS_API.GET_ROLES],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

export {
  useGetRolesandPermissions,
  useAddRolesandPermissions,
  useGetPermissions,
  useUpdateRole,
  useDeleteRole,
};
