import axios, { AxiosError } from 'axios';
import moment from 'moment';
import { API_URL } from '../constant/ApiConstant';
import { TokenService } from '../utils/TokenService';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../constant/TokenConstant';
import { refreshAuthToken } from '../utils/GetaccessToken';

// Extend AxiosRequestConfig to track retried requests
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

const httpClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

httpClient.interceptors.request.use(
  (config) => {
    const accessToken = TokenService.getToken();

    if (config.headers) {
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }

      config.headers['X-Time'] = moment().format();
      config.headers['X-Timezone'] =
        Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

httpClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest = error.config;
    const isLoginRequest = originalRequest?.url?.includes('/login');

    if (
      error.response?.status === 401 &&
      !isLoginRequest &&
      !originalRequest?._retry
    ) {
      originalRequest!._retry = true;

      const refreshToken = TokenService.getToken(REFRESH_TOKEN_KEY);

      if (!refreshToken || TokenService.isTokenExpired(refreshToken)) {
        TokenService.logout();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const newToken = await refreshAuthToken(refreshToken);
        TokenService.setToken({ key: ACCESS_TOKEN_KEY, value: newToken });
        if (originalRequest && originalRequest.headers) {
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        }

        return httpClient.request(originalRequest!);
      } catch (e) {
        TokenService.logout();
        window.location.href = '/login';
        return Promise.reject(e);
      }
    }

    return Promise.reject(error);
  },
);

export { httpClient };
