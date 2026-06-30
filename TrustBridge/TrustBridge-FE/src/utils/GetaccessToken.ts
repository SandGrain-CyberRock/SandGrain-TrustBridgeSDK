import axios from 'axios';
import { API_URL } from '../constant/ApiConstant';
import type { SuccessResponse } from '../lib/types';

// Use a plain axios instance (no interceptors) to avoid triggering the 401 retry loop
const plainAxios = axios.create({ baseURL: API_URL });

type TokenType = {
  access_token: string;
};

export const refreshAuthToken = async (
  refreshToken: string,
): Promise<string> => {
  try {
    const response = await plainAxios.post<SuccessResponse<TokenType>>(
      API_URL,
      {
        refresh_token: refreshToken,
      },
    );

    const newAccessToken = response.data.data.access_token;

    if (!newAccessToken) {
      throw new Error('No access token returned from refresh');
    }

    return newAccessToken;
  } catch {
    throw new Error('Failed to refresh access token');
  }
};
