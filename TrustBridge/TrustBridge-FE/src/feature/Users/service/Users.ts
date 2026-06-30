import { USERS_API } from '../api';
import { httpClient } from '../../../lib/Axios';
import type {
  AddUserType,
  UpdateUserPayload,
  UsersType,
} from '../types/UsersType';
import type { ErrorResponse, SuccessResponse } from '../../../lib/types';
import { generatePath } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../hooks/useNotification';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { invalidateActivityLog } from '../../Dashboard/service/Dashboard';

interface GetUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
  organization_id?: string;
}

interface PaginatedUsersResponse {
  users: UsersType[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const getUsers = (params?: GetUsersParams) => {
  return httpClient.get<SuccessResponse<PaginatedUsersResponse>>(
    USERS_API.GET_USERS,
    { params },
  );
};

const useGetUsers = (params?: GetUsersParams) => {
  return useQuery({
    queryKey: [USERS_API.GET_USERS, params],
    queryFn: () => getUsers(params),
    select: ({ data }) => data.data,
    placeholderData: (previousData) => previousData,
  });
};

const addUsers = (data: AddUserType) => {
  const payload = {
    ou_id: data.organizationId,
    name: data.name,
    company_title: data.companyTitle,
    username: data.username,
    email: data.email,
    role_id: data.role,
  };
  return httpClient.post<
    SuccessResponse<UsersType & { generatedPassword: string }>
  >(generatePath(USERS_API.ADD_USERS), payload);
};

const useAddUser = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [USERS_API.ADD_USERS],
    mutationFn: addUsers,

    onSuccess: (response) => {
      const { data } = response;

      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [USERS_API.GET_USERS] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const usersById = (id: string) =>
  httpClient.get<SuccessResponse<UsersType>>(
    generatePath(USERS_API.GET_USER_BY_ID, { id }),
  );
const useGetUserById = (id: string, enabled: boolean) => {
  return useQuery({
    queryKey: [USERS_API.GET_USER_BY_ID, id],
    queryFn: () => usersById(id),
    select: ({ data }) => data.data,
    enabled,
  });
};

const updateUsers = ({ data, id }: { data: UpdateUserPayload; id: string }) => {
  return httpClient.patch(generatePath(USERS_API.UPDATE_USER, { id }), data);
};

const useUpdateUser = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  const { searchParams } = useModalSearchParams();

  const id = searchParams.get('id') || '';

  return useMutation({
    mutationKey: [USERS_API.UPDATE_USER, id],
    mutationFn: updateUsers,

    onSuccess: (response) => {
      const { data } = response;

      successNotification(data.message);

      queryClient.invalidateQueries({ queryKey: [USERS_API.UPDATE_USER, id] });
      queryClient.invalidateQueries({ queryKey: [USERS_API.GET_USERS] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
const deleteUser = (id: string) => {
  return httpClient.delete<SuccessResponse<null>>(
    generatePath(USERS_API.DELETE_USER, { id }),
  );
};

const useDeleteUser = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [USERS_API.DELETE_USER],
    mutationFn: deleteUser,
    onSuccess: (response) => {
      const { data } = response;
      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [USERS_API.GET_USERS],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

export const exportUsers = (
  format: 'xlsx' | 'csv' | 'json' = 'xlsx',
  params?: GetUsersParams,
) => {
  return httpClient.get(USERS_API.EXPORT, {
    params: { format, ...params },
    responseType: 'blob',
  });
};

interface ResetPasswordResponse {
  username: string;
  email: string;
  generatedPassword: string;
}

const adminResetPassword = (id: string) => {
  return httpClient.post<SuccessResponse<ResetPasswordResponse>>(
    generatePath(USERS_API.ADMIN_RESET_PASSWORD, { id }),
  );
};

const useAdminResetPassword = () => {
  const { errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [USERS_API.ADMIN_RESET_PASSWORD],
    mutationFn: (id: string) => adminResetPassword(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [USERS_API.GET_USERS] });
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

export {
  useGetUsers,
  useAddUser,
  useUpdateUser,
  useGetUserById,
  useDeleteUser,
  useAdminResetPassword,
};
