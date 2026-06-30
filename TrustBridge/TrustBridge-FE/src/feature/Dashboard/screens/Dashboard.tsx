import { Box, Flex, Grid, SimpleGrid, Text } from '@chakra-ui/react';
import { useGetDashboardStats } from '../service/Dashboard';
import { DoughnutChart } from '../components/Charts/DoughnutChart';
import { LineChart } from '../components/Charts/LineChart';
import { DeviceListTable } from '../components/DeviceListTable';
import { RecentActivity } from '../components/RecentActivity';
import { useNavigate } from 'react-router-dom';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';

export const Dashboard = () => {
  const { data: stats } = useGetDashboardStats();
  const navigate = useNavigate();

  return (
    <Box>
      <Text variant="lg_medium" mb={6}>
        Dashboard
      </Text>

      {/* Device Stats Cards */}
      <SimpleGrid columns={{ base: 2, lg: 5 }} spacing={4} mb={8}>
        {/* New Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderLeft="4px solid"
          borderLeftColor="blue.100"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow="0 1px 3px rgba(0,0,0,0.06)"
          onClick={() => navigate(PAGE_ROUTES.DEVICE_ENROLLMENT)}
        >
          <Flex align="center" gap={1.5} mb={2.5}>
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="blue.100"
              flexShrink={0}
            />
            <Text
              fontSize="10.5px"
              fontWeight="600"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="primary.1900"
            >
              New Devices
            </Text>
          </Flex>
          <Text fontSize="30px" fontWeight="700" color="#1a1a1a" lineHeight="1">
            {stats?.new_devices ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Awaiting enrollment
          </Text>
        </Box>

        {/* Claimed Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderLeft="4px solid"
          borderLeftColor="orange.1300"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow="0 1px 3px rgba(0,0,0,0.06)"
          onClick={() => navigate(PAGE_ROUTES.AUTHENTICATED_DEVICES)}
        >
          <Flex align="center" gap={1.5} mb={2.5}>
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="orange.1300"
              flexShrink={0}
            />
            <Text
              fontSize="10.5px"
              fontWeight="600"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="primary.1900"
            >
              Claimed Devices
            </Text>
          </Flex>
          <Text fontSize="30px" fontWeight="700" color="#1a1a1a" lineHeight="1">
            {stats?.claimed_devices ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Pending activation
          </Text>
        </Box>

        {/* Active Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderLeft="4px solid"
          borderLeftColor="brand.1600"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow="0 1px 3px rgba(0,0,0,0.06)"
          onClick={() => navigate(PAGE_ROUTES.ACTIVE_DEVICES)}
        >
          <Flex align="center" gap={1.5} mb={2.5}>
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="brand.1600"
              flexShrink={0}
            />
            <Text
              fontSize="10.5px"
              fontWeight="600"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="primary.1900"
            >
              Active Devices
            </Text>
          </Flex>
          <Text fontSize="30px" fontWeight="700" color="#1a1a1a" lineHeight="1">
            {stats?.active_devices ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Online &amp; authenticated
          </Text>
        </Box>

        {/* Inactive Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderLeft="4px solid"
          borderLeftColor="error.550"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow="0 1px 3px rgba(0,0,0,0.06)"
          onClick={() => navigate(PAGE_ROUTES.INACTIVE_DEVICES)}
        >
          <Flex align="center" gap={1.5} mb={2.5}>
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="error.550"
              flexShrink={0}
            />
            <Text
              fontSize="10.5px"
              fontWeight="600"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="primary.1900"
            >
              Inactive Devices
            </Text>
          </Flex>
          <Text fontSize="30px" fontWeight="700" color="#1a1a1a" lineHeight="1">
            {stats?.inactive_devices ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Inactive Devices
          </Text>
        </Box>

        {/* Rejected Devices — mirrors the same card on the Devices page so
            the two counts always agree. Uses `rejected_devices` (count of
            devices currently in `rejected` status) rather than the previous
            `failed_authentications` (which counted failed-auth LOG entries,
            a different number and often 0). */}
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderLeft="4px solid"
          borderLeftColor="red.400"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow="0 1px 3px rgba(0,0,0,0.06)"
          onClick={() => navigate(PAGE_ROUTES.REJECTED_DEVICES)}
        >
          <Flex align="center" gap={1.5} mb={2.5}>
            <Box
              w="7px"
              h="7px"
              borderRadius="full"
              bg="red.400"
              flexShrink={0}
            />
            <Text
              fontSize="10.5px"
              fontWeight="600"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="primary.1900"
            >
              Rejected Devices
            </Text>
          </Flex>
          <Text fontSize="30px" fontWeight="700" color="#1a1a1a" lineHeight="1">
            {stats?.rejected_devices ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Failed authentication
          </Text>
        </Box>
      </SimpleGrid>

      {/* Charts Row */}
      <Grid
        templateColumns={{
          base: '1fr',
          lg: '1fr 1fr',
        }}
        gap={6}
        mb={8}
      >
        <Box
          bg="white"
          borderRadius="xl"
          border="1px solid"
          borderColor="primary.1200"
          p={4}
        >
          <DoughnutChart />
        </Box>

        <Box
          bg="white"
          borderRadius="xl"
          border="1px solid"
          borderColor="primary.1200"
          p={4}
        >
          <LineChart />
        </Box>
      </Grid>

      {/* Recent Devices and Activity - 75% / 25% */}
      <Grid
        templateColumns={{
          base: '1fr',
          lg: '3fr 1fr',
        }}
        gap={6}
      >
        <Box
          bg="white"
          borderRadius="xl"
          border="1px solid"
          borderColor="primary.1200"
          p={4}
          overflowX="auto"
        >
          <DeviceListTable />
        </Box>

        <Box
          bg="white"
          borderRadius="xl"
          border="1px solid"
          borderColor="primary.1200"
          p={4}
          minW="0"
        >
          <RecentActivity />
        </Box>
      </Grid>
    </Box>
  );
};
