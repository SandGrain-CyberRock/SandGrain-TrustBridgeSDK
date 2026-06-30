import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
} from '@chakra-ui/react';
import { ArrowDown } from '../../assets/svgs';
import { useInitInfo } from '../../feature/Auth/services/InitInfo.service';
import { TokenService } from '../../utils/TokenService';

import { PAGE_ROUTES } from '../../constant/PageRoutes';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export const Navbar = () => {
  const { data: initInfo } = useInitInfo();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    TokenService.logout();
    queryClient.clear();
    navigate(PAGE_ROUTES.AUTH.LOGIN);
  };

  const handleSettings = () => {
    navigate(PAGE_ROUTES.PROFILE);
  };

  return (
    <Flex
      as="nav"
      w="100%"
      pr={'24px'}
      py={'11px'}
      pl={'24px'}
      align="center"
      justify="flex-end"
      position="sticky"
      top={0}
      zIndex={10}
      bg={'white'}
      h="58px"
    >
      <HStack spacing={3}>
        <Menu>
          <MenuButton>
            <HStack spacing={2.5} cursor="pointer">
              <Box
                borderRadius="full"
                overflow="hidden"
                w="36px"
                h="36px"
                bg="gray.100"
                flexShrink={0}
              >
                <Flex
                  w="100%"
                  h="100%"
                  align="center"
                  justify="center"
                  bg="brand.600"
                  color="white"
                  fontSize="14px"
                  fontWeight="600"
                >
                  {(initInfo?.name || initInfo?.username || '')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </Flex>
              </Box>
              <VStack spacing={0} align="flex-start">
                <Text
                  fontSize="13px"
                  fontWeight="600"
                  color="#1a1a1a"
                  lineHeight="1.25"
                >
                  {initInfo?.name || initInfo?.username || ''}
                </Text>
                <Text fontSize="11px" color="#6b7280" lineHeight="1.25">
                  {initInfo?.email ?? ''}
                </Text>
              </VStack>
              <Box color="gray.300">
                <ArrowDown />
              </Box>
            </HStack>
          </MenuButton>
          <MenuList
            minW="180px"
            py={1}
            px={2}
            shadow="md"
            border="1px solid"
            borderColor="gray.100"
          >
            <MenuItem
              onClick={handleSettings}
              fontSize="sm"
              py={2}
              borderRadius="md"
              _hover={{ bg: 'gray.50' }}
              _focus={{ bg: 'gray.50' }}
            >
              Profile Settings
            </MenuItem>
            <MenuDivider my={1} />
            <MenuItem
              onClick={handleLogout}
              fontSize="sm"
              py={2}
              borderRadius="md"
              color="red.500"
              _hover={{ bg: 'red.50' }}
              _focus={{ bg: 'red.50' }}
            >
              Logout
            </MenuItem>
          </MenuList>
        </Menu>
      </HStack>
    </Flex>
  );
};
