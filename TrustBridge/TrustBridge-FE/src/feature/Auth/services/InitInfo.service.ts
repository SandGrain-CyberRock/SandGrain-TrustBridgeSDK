import { useQuery } from '@tanstack/react-query';
import { httpClient } from '../../../lib/Axios';
import { TokenService } from '../../../utils/TokenService';
import { ACCESS_TOKEN_KEY } from '../../../constant/TokenConstant';
import { AUTH_API_ENDPOINT } from '../api';
import type { InitInfo } from '../types/InitInfo';
import type { SuccessResponse } from '../../../lib/types';

const initInfo = async () => {
  return httpClient.get<SuccessResponse<InitInfo>>(AUTH_API_ENDPOINT.INIT);
};

export const useInitInfo = () => {
  const token = TokenService.getToken(ACCESS_TOKEN_KEY);
  const isAuthenticated = !!token && !TokenService.isTokenExpired(token);

  return useQuery({
    queryKey: [AUTH_API_ENDPOINT.INIT],
    queryFn: initInfo,
    select: ({ data }) => data.data,
    enabled: isAuthenticated,
  });
};
