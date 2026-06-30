import { QueryClient } from '@tanstack/react-query';

const QueryProvider = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 30 * 1000,
    },
  },
});

export { QueryProvider };
