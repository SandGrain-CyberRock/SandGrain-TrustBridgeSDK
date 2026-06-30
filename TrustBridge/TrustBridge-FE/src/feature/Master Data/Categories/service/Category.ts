import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../../lib/Axios';
import type { SuccessResponse, ErrorResponse } from '../../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../hooks/useNotification';
import { CATEGORY_API } from '../api';
import { invalidateActivityLog } from '../../../Dashboard/service/Dashboard';
import type {
  CategoryResponse,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../types/Category.types';

const getCategories = () =>
  httpClient.get<SuccessResponse<CategoryResponse[]>>(
    generatePath(CATEGORY_API.GET_ALL),
  );

export const useGetCategories = () =>
  useQuery({
    queryKey: [CATEGORY_API.GET_ALL],
    queryFn: getCategories,
    select: ({ data }) => data.data,
  });

const getCategoryById = (id: string) =>
  httpClient.get<SuccessResponse<CategoryResponse>>(
    generatePath(CATEGORY_API.GET_BY_ID, { id }),
  );

export const useGetCategoryById = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [CATEGORY_API.GET_BY_ID, id],
    queryFn: () => getCategoryById(id),
    select: ({ data }) => data.data,
    enabled,
  });

const createCategory = (payload: CreateCategoryPayload) =>
  httpClient.post<SuccessResponse<CategoryResponse>>(
    CATEGORY_API.CREATE,
    payload,
  );

export const useCreateCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [CATEGORY_API.CREATE],
    mutationFn: createCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const updateCategory = ({
  id,
  data,
}: {
  id: string;
  data: UpdateCategoryPayload;
}) =>
  httpClient.patch<SuccessResponse<CategoryResponse>>(
    generatePath(CATEGORY_API.UPDATE, { id }),
    data,
  );

export const useUpdateCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [CATEGORY_API.UPDATE],
    mutationFn: updateCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const deleteCategory = (id: string) =>
  httpClient.delete<SuccessResponse<null>>(
    generatePath(CATEGORY_API.DELETE, { id }),
  );

export const useDeleteCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [CATEGORY_API.DELETE],
    mutationFn: deleteCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};
