import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../../lib/Axios';
import type { SuccessResponse, ErrorResponse } from '../../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../hooks/useNotification';
import { SUB_CATEGORY_API } from '../api';
import { invalidateActivityLog } from '../../../Dashboard/service/Dashboard';
import type {
  SubCategoryResponse,
  CreateSubCategoryPayload,
  UpdateSubCategoryPayload,
} from '../types/SubCategory.types';

const getSubCategories = (categoryId?: string) =>
  httpClient.get<SuccessResponse<SubCategoryResponse[]>>(
    SUB_CATEGORY_API.GET_ALL + (categoryId ? `?category_id=${categoryId}` : ''),
  );

export const useGetSubCategories = (categoryId?: string) =>
  useQuery({
    queryKey: [SUB_CATEGORY_API.GET_ALL, categoryId],
    queryFn: () => getSubCategories(categoryId),
    select: ({ data }) => data.data,
  });

const getSubCategoryById = (id: string) =>
  httpClient.get<SuccessResponse<SubCategoryResponse>>(
    generatePath(SUB_CATEGORY_API.GET_BY_ID, { id }),
  );

export const useGetSubCategoryById = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [SUB_CATEGORY_API.GET_BY_ID, id],
    queryFn: () => getSubCategoryById(id),
    select: ({ data }) => data.data,
    enabled,
  });

const createSubCategory = (payload: CreateSubCategoryPayload) =>
  httpClient.post<SuccessResponse<SubCategoryResponse>>(
    SUB_CATEGORY_API.CREATE,
    payload,
  );

export const useCreateSubCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [SUB_CATEGORY_API.CREATE],
    mutationFn: createSubCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [SUB_CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const updateSubCategory = ({
  id,
  data,
}: {
  id: string;
  data: UpdateSubCategoryPayload;
}) =>
  httpClient.patch<SuccessResponse<SubCategoryResponse>>(
    generatePath(SUB_CATEGORY_API.UPDATE, { id }),
    data,
  );

export const useUpdateSubCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [SUB_CATEGORY_API.UPDATE],
    mutationFn: updateSubCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [SUB_CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const deleteSubCategory = (id: string) =>
  httpClient.delete<SuccessResponse<null>>(
    generatePath(SUB_CATEGORY_API.DELETE, { id }),
  );

export const useDeleteSubCategory = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [SUB_CATEGORY_API.DELETE],
    mutationFn: deleteSubCategory,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [SUB_CATEGORY_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};
