import { ChakraProvider } from '@chakra-ui/react';
import { QueryProvider } from './ReactQueryProvider';
import theme from '../theme';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

const GlobalProvider = ({ children }: { children: React.ReactElement }) => {
  return (
    <BrowserRouter>
      <ChakraProvider
        theme={theme}
        toastOptions={{
          defaultOptions: {
            position: 'top-right',
            isClosable: true,
            duration: 2000,
          },
        }}
      >
        <QueryClientProvider client={QueryProvider}>
          {children}
        </QueryClientProvider>
      </ChakraProvider>
    </BrowserRouter>
  );
};

export default GlobalProvider;
