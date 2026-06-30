import { Grid, GridItem, useBreakpointValue } from '@chakra-ui/react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

import { Sidebar } from '../Sidebar';
import { Navbar } from './Navbar';
import { LayoutContext } from '../../context/LayoutContext';
import { useInitInfo } from '../../feature/Auth/services/InitInfo.service';
import { PAGE_ROUTES } from '../../constant/PageRoutes';

export const Layout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const { data: initInfo } = useInitInfo();

  // Redirect to setup wizard if system needs initialization (TrustAdmin only)
  useEffect(() => {
    if (initInfo?.needsInitialization) {
      navigate(PAGE_ROUTES.AUTH.SETUP, { replace: true });
    } else if (initInfo?.mustChangePassword) {
      navigate(PAGE_ROUTES.AUTH.CHANGE_PASSWORD, { replace: true });
    }
  }, [initInfo?.needsInitialization, initInfo?.mustChangePassword, navigate]);

  const sidebarWidth =
    useBreakpointValue({
      base: isCollapsed ? 80 : 280,
      md: isCollapsed ? 100 : 280,
      lg: isCollapsed ? 100 : 280,
      '2xl': isCollapsed ? 100 : 280,
    }) ?? 280;

  return (
    <LayoutContext.Provider value={{ sidebarWidth, isCollapsed }}>
      <Grid
        templateColumns={`${sidebarWidth}px 1fr`}
        h="100vh"
        w="100%"
        overflow="hidden"
      >
        <GridItem>
          <Sidebar onToggle={() => setIsCollapsed((p) => !p)} />
        </GridItem>

        <GridItem bg="gray.25" overflow="hidden">
          <Grid templateRows="auto 1fr" h="100%">
            <GridItem
              position="sticky"
              top="0"
              zIndex={10}
              bg="white"
              borderBottom="1px solid"
              borderColor="gray.200"
            >
              <Navbar />
            </GridItem>

            <GridItem
              overflow="auto"
              scrollBehavior="smooth"
              sx={{
                '&::-webkit-scrollbar': { display: 'none' },
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
              p={4}
            >
              <Outlet />
            </GridItem>
          </Grid>
        </GridItem>
      </Grid>
    </LayoutContext.Provider>
  );
};
