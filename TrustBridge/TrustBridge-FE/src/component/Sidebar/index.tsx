import { useState } from 'react';
import {
  Box,
  Collapse as ChakraCollapse,
  Flex,
  HStack,
  IconButton,
  Spacer,
  Text,
  VStack,
} from '@chakra-ui/react';

import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { ArrowDown, Collapse } from '../../assets/svgs';
import { IconsList } from '../../constant/Icons';
import { useLayoutContext } from '../../context/LayoutContext';
import { allRoutes } from '../../routes/Routes';

import type { IconKey, SidebarProps } from './Sidebar.types';
import type { Route } from '../../routes/Routes.type';
import { TokenService } from '../../utils/TokenService';
import { useQueryClient } from '@tanstack/react-query';
import { PAGE_ROUTES } from '../../constant/PageRoutes';
import { useInitInfo } from '../../feature/Auth/services/InitInfo.service';

export const Sidebar = ({ onToggle }: SidebarProps) => {
  const { sidebarWidth, isCollapsed } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: initAPI } = useInitInfo();

  const permissions = initAPI?.permissions || [];

  const hasPermission = (routePermissions?: string[]) => {
    if (!routePermissions) return true;
    return routePermissions.every((perm) => permissions.includes(perm));
  };

  const isSubMenuActive = (children?: Route[]) => {
    if (!children) return false;
    return children.some((child) => child.route === location.pathname);
  };

  const sectionRoutes = allRoutes.filter((r) => r.children);
  const logoutRoute = allRoutes.find((r) => !r.children && !r.sectionHeading);

  const filteredSectionRoutes = sectionRoutes.filter((section) => {
    return section.children?.some((child) => {
      if (child.children) {
        return child.children.some(
          (sub) => sub.isVisible && hasPermission(sub.permissions),
        );
      }
      return child.isVisible && hasPermission(child.permissions);
    });
  });

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      filteredSectionRoutes.forEach((section) => {
        section.children?.forEach((child) => {
          if (child.children && child.name && isSubMenuActive(child.children)) {
            initial[child.name] = true;
          }
        });
      });
      return initial;
    },
  );

  const toggleMenu = (name: string) => {
    setExpandedMenus((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleLogout = () => {
    TokenService.logout();
    queryClient.clear();
    navigate(PAGE_ROUTES.AUTH.LOGIN);
  };

  const hasVisibleChildren = (child: Route) => {
    return (
      child.children &&
      child.children.some(
        (sub) => sub.isVisible && hasPermission(sub.permissions),
      )
    );
  };

  return (
    <Flex
      direction="column"
      bg="secondary.900"
      color="white"
      w={`${sidebarWidth}px`}
      h="100vh"
      transition="width 0.25s ease"
      overflow="hidden"
    >
      {/* Header */}

      <Flex
        align="center"
        justify={isCollapsed ? 'center' : 'space-between'}
        px={'18px'}
        py={'16px'}
        borderBottom="1px solid"
        borderColor="#3a3a3a"
        position="sticky"
        zIndex={5}
        bg="secondary.900"
      >
        {!isCollapsed && (
          <HStack spacing={2}>
            {/* <TrustBridge /> */}
            <Text
              fontSize="20px"
              fontWeight="700"
              letterSpacing="0.02em"
              color="white"
            >
              Trust
              <Text as="span" color="#c9922a" fontWeight="700">
                Bridge
              </Text>
            </Text>
          </HStack>
        )}

        <IconButton
          pl={'15px'}
          aria-label="Toggle Sidebar"
          icon={
            <Box
              transform={isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'}
              fontSize="md"
            >
              <Collapse />
            </Box>
          }
          onClick={onToggle}
          size="sm"
          variant="unstyled"
          flexShrink={0}
        />
      </Flex>
      {/* Routes */}
      <VStack
        align="stretch"
        spacing={0}
        mt={2}
        px={2}
        flex={1}
        overflow="auto"
        scrollBehavior="smooth"
        sx={{
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {filteredSectionRoutes.map((route) => (
          <Box key={route.sectionHeading}>
            {!isCollapsed && route.sectionHeading && (
              <Text
                fontSize="10px"
                fontWeight="600"
                letterSpacing="0.1em"
                color="#A1A1A3"
                textTransform="uppercase"
                mt={4}
                mb={1}
                px={3}
              >
                {route.sectionHeading}
              </Text>
            )}

            {route.children
              ?.filter((c) => c.isVisible)
              ?.filter((c) => {
                if (c.children) return hasVisibleChildren(c);
                return hasPermission(c.permissions);
              })
              .map((child) => {
                const Icon = child.icon
                  ? IconsList[child.icon as IconKey]
                  : null;

                // Menu item with sub-menu
                if (child.children && hasVisibleChildren(child)) {
                  const isExpanded = !!expandedMenus[child.name!];
                  const isActive = isSubMenuActive(child.children);

                  return (
                    <Box key={child.name}>
                      <Flex
                        align="center"
                        justify={isCollapsed ? 'center' : 'space-between'}
                        px={isCollapsed ? 0 : 3}
                        py={2.5}
                        my={0.5}
                        borderRadius="6px"
                        bg={isActive ? '#54432C' : 'transparent'}
                        _hover={{
                          bg: isActive ? '' : '#5C5B5F',
                        }}
                        cursor="pointer"
                        onClick={() => toggleMenu(child.name!)}
                        tabIndex={0}
                        role="button"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleMenu(child.name!);
                          }
                        }}
                      >
                        <Flex align="center">
                          {Icon && <Icon />}
                          {!isCollapsed && (
                            <Text
                              ml={2.5}
                              fontSize="14px"
                              fontWeight={isActive ? '500' : '400'}
                              color={isActive ? '#FFFFFF' : '#E7E7E8'}
                              _groupHover={{ color: 'white' }}
                            >
                              {child.name}
                            </Text>
                          )}
                        </Flex>
                        {!isCollapsed && (
                          <Box
                            transform={
                              isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                            }
                            transition="transform 0.2s"
                            color={isActive ? '#FFFFFF' : '#666666'}
                          >
                            <ArrowDown />
                          </Box>
                        )}
                      </Flex>

                      {!isCollapsed && (
                        <ChakraCollapse in={isExpanded} animateOpacity>
                          <VStack align="stretch" spacing={0} pl={0}>
                            {child.children
                              .filter((sub) => sub.isVisible)
                              .filter((sub) => hasPermission(sub.permissions))
                              .map((sub) => (
                                <NavLink key={sub.route} to={sub.route!}>
                                  {({ isActive }) => (
                                    <Flex
                                      align="center"
                                      px={3}
                                      py={2}
                                      my={0.5}
                                      borderRadius="6px"
                                      bg={isActive ? '#5C5B5F' : 'transparent'}
                                      _hover={{
                                        bg: '#5C5B5F',
                                      }}
                                    >
                                      <Text
                                        fontSize="13px"
                                        pl={6}
                                        fontWeight={isActive ? '500' : '400'}
                                        color={isActive ? '#FFFFFF' : '#cccccc'}
                                      >
                                        {sub.name}
                                      </Text>
                                    </Flex>
                                  )}
                                </NavLink>
                              ))}
                          </VStack>
                        </ChakraCollapse>
                      )}
                    </Box>
                  );
                }

                // Regular menu item (no sub-menu)
                return (
                  <NavLink key={child.route} to={child.route!}>
                    {({ isActive }) => (
                      <Flex
                        align="center"
                        justify={isCollapsed ? 'center' : 'flex-start'}
                        px={isCollapsed ? 0 : 3}
                        py={2.5}
                        my={0.5}
                        borderRadius="6px"
                        bg={isActive ? '#54432C' : 'transparent'}
                        _hover={{
                          bg: isActive ? '' : '#5C5B5F',
                        }}
                      >
                        {Icon && <Icon />}
                        {!isCollapsed && (
                          <Text
                            ml={2.5}
                            fontSize="14px"
                            fontWeight={isActive ? '500' : '400'}
                            color={isActive ? '#FFFFFF' : '#E7E7E8'}
                          >
                            {child.name}
                          </Text>
                        )}
                      </Flex>
                    )}
                  </NavLink>
                );
              })}
          </Box>
        ))}

        <Spacer />

        {/* Logout */}

        <Box
          position="sticky"
          bottom={0}
          bg="secondary.900"
          pt={2}
          pb={4}
          borderTop="1px solid"
          borderColor="#3a3a3a"
        >
          {logoutRoute && (
            <Flex
              align="center"
              justify={isCollapsed ? 'center' : 'flex-start'}
              px={isCollapsed ? 0 : 3}
              py={2.5}
              borderRadius="6px"
              bg="#54432C"
              cursor="pointer"
              onClick={handleLogout}
              // _hover={{ bg: '#b8821f' }}
              transition="background 0.13s"
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLogout();
                }
              }}
            >
              <IconsList.logout />
              {!isCollapsed && (
                <Text ml={2.5} fontSize="14px" fontWeight="500" color="white">
                  {logoutRoute.name}
                </Text>
              )}
            </Flex>
          )}
        </Box>
      </VStack>
    </Flex>
  );
};
