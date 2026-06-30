import { ACCESS_TOKEN_KEY } from '../constant/TokenConstant';
import { TokenService } from '../utils/TokenService';

export const useIsAuthenticated = () => {
  const token = TokenService.getToken(ACCESS_TOKEN_KEY);
  if (!token) return false;
  return !TokenService.isTokenExpired(token);
};
