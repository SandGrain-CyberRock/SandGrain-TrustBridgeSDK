import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../constant/TokenConstant';
import Cookie from 'js-cookie';

interface TokenDetails {
  name?: string;
  role?: string;
  [key: string]: string | number | undefined;
}

const getToken = (
  token_name:
    | typeof ACCESS_TOKEN_KEY
    | typeof REFRESH_TOKEN_KEY = ACCESS_TOKEN_KEY,
): string | undefined => {
  return Cookie.get(token_name);
};

const setToken = ({
  key,
  value,
}: {
  key: typeof ACCESS_TOKEN_KEY | typeof REFRESH_TOKEN_KEY;
  value: string;
}) => {
  Cookie.set(key, value);
};
const getTokenDetails = (token_data?: string): TokenDetails => {
  try {
    const token = token_data || getToken();
    if (!token) return {};

    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return {};
    }

    const decodedPayload = JSON.parse(
      window.atob(tokenParts[1]),
    ) as TokenDetails;

    return decodedPayload;
  } catch {
    return {};
  }
};

const isTokenExpired = (token: string): boolean => {
  const details = TokenService.getTokenDetails(token);
  if (!details.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return Number(details.exp) < now;
};

const logout = (): void => {
  Cookie.remove(ACCESS_TOKEN_KEY);
  Cookie.remove(REFRESH_TOKEN_KEY);
  localStorage.setItem('logout', Date.now().toString());
};

const TokenService = {
  getToken,
  setToken,
  getTokenDetails,
  logout,
  isTokenExpired,
};

export { TokenService };
