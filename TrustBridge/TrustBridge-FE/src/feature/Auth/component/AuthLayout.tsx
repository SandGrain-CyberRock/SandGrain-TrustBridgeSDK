import type { ReactNode } from 'react';
import { Box, Flex, Image, Text } from '@chakra-ui/react';
import { LoginImage } from '../../../assets/images';

export const AuthLayout = ({ children }: { children: ReactNode }) => {
  return (
    <Flex h="100vh" overflow="hidden">
      <Box
        flex="1"
        m="6"
        bgGradient="linear(to-b,rgba(51, 190, 242, 0.5), rgba(186, 218, 248, 0.54),rgba(237, 206, 133, 1))"
        borderRadius="20px"
        display="flex"
        flexDirection="column"
        alignItems="flex-start"
        justifyContent="flex-start"
        textAlign="left"
        py="10"
        gap="4"
      >
        <Flex flex="1" alignItems="center" justifyContent="center" w="100%">
          <Image
            src={LoginImage}
            alt="Login Image"
            objectFit="contain"
            maxW={{ md: '300px', lg: '500px' }}
            w="70%"
            maxH="60vh"
          />
        </Flex>

        <Flex direction="column" px="12" mb="6">
          <Text fontSize="20px" fontWeight="700" letterSpacing="0.02em">
            Trust
            <Text as="span" color="#c9922a" fontWeight="700">
              Bridge
            </Text>
          </Text>
          <Text variant="lgg_normal" mt={'2'}>
            Faster, stronger, future-ready – bridging you to the highest
            assurance, today and beyond.
          </Text>
        </Flex>
      </Box>

      <Box flex="1" display="flex" alignItems="center" justifyContent="center">
        {children}
      </Box>

      <Text
        position="fixed"
        bottom={4}
        right={6}
        fontSize="lg"
        color="gray.400"
        zIndex={9999}
        pointerEvents="none"
      >
        v 0.4
      </Text>
    </Flex>
  );
};
