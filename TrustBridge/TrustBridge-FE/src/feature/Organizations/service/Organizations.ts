import { generatePath } from 'react-router-dom';
import type {
  AddOrganizationsType,
  OrganizationsResponse,
  UpdateOrganizationsType,
} from '../types/Organizations.types';
import { ORGANIZATIONS_API } from '../api';
import { httpClient } from '../../../lib/Axios';
import type { ErrorResponse, SuccessResponse } from '../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../../hooks/useNotification';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { invalidateActivityLog } from '../../Dashboard/service/Dashboard';

const getOrganizations = () => {
  return httpClient.get<SuccessResponse<OrganizationsResponse[]>>(
    generatePath(ORGANIZATIONS_API.GET_ORGANIZATIONS),
  );
};

const useGetOrganizations = () => {
  return useQuery({
    queryKey: [ORGANIZATIONS_API.GET_ORGANIZATIONS],
    queryFn: getOrganizations,
    select: ({ data }) => data.data,
  });
};

const addOrganizations = (data: AddOrganizationsType) => {
  const payload = {
    ou_name: data.name,
    ou_description: data.description,
  };
  return httpClient.post<SuccessResponse<OrganizationsResponse>>(
    generatePath(ORGANIZATIONS_API.ADD_ORGANIZATIONS),
    payload,
  );
};

const useAddOrganizations = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [ORGANIZATIONS_API.ADD_ORGANIZATIONS],
    mutationFn: addOrganizations,
    onSuccess: (response) => {
      const { data } = response;

      successNotification(data.message);
      queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_API.GET_ORGANIZATIONS],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};

const organizationsById = (id: string) =>
  httpClient.get<SuccessResponse<OrganizationsResponse>>(
    generatePath(ORGANIZATIONS_API.GET_ORGANIZATION_BY_ID, { id }),
  );

const useGetOrganizationById = (id: string, enabled: boolean) => {
  return useQuery({
    queryKey: [ORGANIZATIONS_API.GET_ORGANIZATION_BY_ID, id],
    queryFn: () => organizationsById(id),
    select: ({ data }) => data.data,
    enabled,
  });
};

const updateOrganization = ({
  data,
  id,
}: {
  data: UpdateOrganizationsType;
  id: string;
}) => {
  return httpClient.patch(
    generatePath(ORGANIZATIONS_API.UPDATE_ORGANIZATIONS, { id }),
    data,
  );
};

const useUpdateOrganization = () => {
  const { successNotification, errorNotification } = useNotification();
  const queryClient = useQueryClient();
  const { searchParams } = useModalSearchParams();

  const id = searchParams.get('id') || '';

  return useMutation({
    mutationKey: [ORGANIZATIONS_API.UPDATE_ORGANIZATIONS, id],
    mutationFn: updateOrganization,

    onSuccess: (response) => {
      const { data } = response;

      successNotification(data.message);

      queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_API.UPDATE_ORGANIZATIONS, id],
      });
      queryClient.invalidateQueries({
        queryKey: [ORGANIZATIONS_API.GET_ORGANIZATIONS],
      });
      invalidateActivityLog(queryClient);
    },
    onError: (error: ErrorResponse) => {
      errorNotification(error?.response?.data?.message);
    },
  });
};
export {
  useGetOrganizations,
  useAddOrganizations,
  useGetOrganizationById,
  useUpdateOrganization,
};
