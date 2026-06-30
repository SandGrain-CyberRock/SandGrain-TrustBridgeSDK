import { generatePath } from 'react-router-dom';
import { httpClient } from '../../../../lib/Axios';
import type { SuccessResponse, ErrorResponse } from '../../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../../hooks/useNotification';
import { TAG_API } from '../api';
import { invalidateActivityLog } from '../../../Dashboard/service/Dashboard';
import type {
  TagResponse,
  CreateTagPayload,
  UpdateTagPayload,
} from '../types/Tag.types';

const getTags = () =>
  httpClient.get<SuccessResponse<TagResponse[]>>(generatePath(TAG_API.GET_ALL));

export const useGetTags = () =>
  useQuery({
    queryKey: [TAG_API.GET_ALL],
    queryFn: getTags,
    select: ({ data }) => data.data,
  });

const getTagById = (id: string) =>
  httpClient.get<SuccessResponse<TagResponse>>(
    generatePath(TAG_API.GET_BY_ID, { id }),
  );

export const useGetTagById = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: [TAG_API.GET_BY_ID, id],
    queryFn: () => getTagById(id),
    select: ({ data }) => data.data,
    enabled,
  });

const createTag = (payload: CreateTagPayload) =>
  httpClient.post<SuccessResponse<TagResponse>>(TAG_API.CREATE, payload);

export const useCreateTag = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [TAG_API.CREATE],
    mutationFn: createTag,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [TAG_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const updateTag = ({ id, data }: { id: string; data: UpdateTagPayload }) =>
  httpClient.patch<SuccessResponse<TagResponse>>(
    generatePath(TAG_API.UPDATE, { id }),
    data,
  );

export const useUpdateTag = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [TAG_API.UPDATE],
    mutationFn: updateTag,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [TAG_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};

const deleteTag = (id: string) =>
  httpClient.delete<SuccessResponse<null>>(
    generatePath(TAG_API.DELETE, { id }),
  );

export const useDeleteTag = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: [TAG_API.DELETE],
    mutationFn: deleteTag,
    onSuccess: ({ data }) => {
      successNotification(data.message);
      queryClient.invalidateQueries({ queryKey: [TAG_API.GET_ALL] });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) =>
      errorNotification(error?.response?.data?.message),
  });
};
