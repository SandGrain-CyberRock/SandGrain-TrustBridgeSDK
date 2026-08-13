import { useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Spacer,
  Text,
} from '@chakra-ui/react';
import { Add, Frame, Search } from '../../../assets/svgs';
import { AllDeviceTable } from '../components/AllDeviceTable';
import { AllDeviceForm } from '../components/AllDeviceForm';
import { ImportDeviceModal } from '../components/ImportDeviceModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { useDebounce } from '../../../hooks/useDebounce';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { exportDevices, useGetDeviceStatusCounts } from '../service/Devices';
import { ExportMenu } from '../../../component/ExportMenu/ExportMenu';
import { useMoveDevices } from '../hooks/useMoveDevices';
import { checkMark } from '../../../assets/images';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';
import { ViewDeviceForm } from '../components/ViewDeviceForm';
import { BulkLifecycleModal } from '../components/BulkLifecycleModal';
import { BulkAuthenticateModal } from '../components/BulkAuthenticateModal';
import { useGetDeviceGroups } from '../../Device Group/service/DeviceGroup';
import { useGetDeviceProfiles } from '../../Device Profile/service/DeviceProfile';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';

const AUTH_STATUSES = [
  { label: 'Idle', value: 'idle' },
  { label: 'Rejected', value: 'rejected' },
];

interface DevicesProps {
  filterStatus?: string;
  isActive?: boolean;
}

export const Devices = ({ filterStatus, isActive }: DevicesProps) => {
  const { modalOpen } = useModalSearchParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBulkLifecycleOpen, setIsBulkLifecycleOpen] = useState(false);
  const [isBulkAuthOpen, setIsBulkAuthOpen] = useState(false);
  const navigate = useNavigate();

  const searchTerm = searchParams.get('search') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const deviceGroupId = searchParams.get('device_group_id') || '';
  const profileId = searchParams.get('profile_id') || '';
  const statusFilter = searchParams.get('status') || '';

  const debouncedSearch = useDebounce(searchTerm, 500);

  const canCreate = usePermission(PERMISSIONS.DEVICE_CREATE);
  const canRetrieve = usePermission(PERMISSIONS.DEVICE_RETRIEVE);

  const { data: statusCounts, refetch: refetchStatusCounts } =
    useGetDeviceStatusCounts();
  const { data: groupsData } = useGetDeviceGroups({ limit: 100 });
  const { data: profilesData } = useGetDeviceProfiles({ limit: 100 });

  const groups = groupsData?.data || [];
  const profiles = profilesData?.data || [];

  const { executeMove, closeModal, isOpen, isLoading } = useMoveDevices();

  const isClaimedView = filterStatus === 'claimed';
  const isActiveView = filterStatus === 'authenticated' && isActive === true;
  const isInactiveView = filterStatus === 'authenticated' && isActive === false;
  const isRejectedView = filterStatus === 'rejected';

  const activeTab = isClaimedView
    ? 'claimed'
    : isActiveView
      ? 'active'
      : isInactiveView
        ? 'inactive'
        : isRejectedView
          ? 'rejected'
          : 'new';

  const title = isClaimedView
    ? 'Claimed Devices'
    : isActiveView
      ? 'Active Devices'
      : isInactiveView
        ? 'Inactive Devices'
        : isRejectedView
          ? 'Rejected Devices'
          : 'New Devices';

  const description = isClaimedView
    ? 'Devices claimed by a tenant, pending activation'
    : isActiveView
      ? 'Authenticated devices that are currently active'
      : isInactiveView
        ? 'Authenticated devices that are currently inactive'
        : isRejectedView
          ? 'Devices that failed authentication'
          : 'Devices registered and awaiting enrollment';

  const handleFilterChange = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handleSearchChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('search', value);
    } else {
      newParams.delete('search');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const handlePageChange = (newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', String(newPage));
    setSearchParams(newParams);
  };

  const handlePageSizeChange = (newLimit: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('limit', String(newLimit));
    newParams.set('page', '1');
    setSearchParams(newParams);
  };

  const openAddDeviceModal = () => {
    modalOpen('', 'addDevice');
  };

  return (
    <>
      {/* Page Header */}
      <Flex justify="space-between" align="center" mb={5}>
        <Box>
          <Text
            fontSize="21px"
            fontWeight="700"
            color="#1a1a1a"
            lineHeight="1.2"
          >
            {title}
          </Text>
          <Text fontSize="13px" color="#6b7280" mt={1}>
            {description}
          </Text>
        </Box>

        {canCreate && (
          <HStack spacing={2}>
            <Button
              variant="primary"
              px="20px"
              py="9px"
              h="auto"
              fontSize="13.5px"
              fontWeight="500"
              leftIcon={<Add color="white" />}
              onClick={openAddDeviceModal}
            >
              Register Device
            </Button>
            <Button
              variant="secondary"
              px="20px"
              py="9px"
              h="auto"
              fontSize="13.5px"
              fontWeight="500"
              leftIcon={<Frame />}
              onClick={() => setIsImportOpen(true)}
            >
              Import Device
            </Button>
          </HStack>
        )}
      </Flex>

      {/* Stat Cards */}
      <SimpleGrid columns={{ base: 2, lg: 5 }} spacing={4} mb={4}>
        {/* New Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor={activeTab === 'new' ? '#c9922a' : 'gray.100'}
          borderLeft="4px solid"
          borderLeftColor="blue.100"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s, border-color 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow={
            activeTab === 'new'
              ? '0 0 0 2px #EDAE49'
              : '0 1px 3px rgba(0,0,0,0.06)'
          }
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
            {statusCounts?.idle ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Awaiting enrollment
          </Text>
        </Box>

        {/* Claimed Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor={activeTab === 'claimed' ? '#c9922a' : 'gray.100'}
          borderLeft="4px solid"
          borderLeftColor="orange.1300"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s, border-color 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow={
            activeTab === 'claimed'
              ? '0 0 0 2px #EDAE49'
              : '0 1px 3px rgba(0,0,0,0.06)'
          }
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
            {statusCounts?.claimed ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Pending activation
          </Text>
        </Box>

        {/* Active Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderLeft="4px solid"
          borderLeftColor="brand.1600"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s, border-color 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          borderColor={activeTab === 'active' ? '#c9922a' : 'gray.100'}
          boxShadow={
            activeTab === 'active'
              ? '0 0 0 2px #EDAE49'
              : '0 1px 3px rgba(0,0,0,0.06)'
          }
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
            {statusCounts?.active ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Online &amp; authenticated
          </Text>
        </Box>

        {/* Inactive Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor={activeTab === 'inactive' ? '#c9922a' : 'gray.100'}
          borderLeft="4px solid"
          borderLeftColor="error.550"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s, border-color 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow={
            activeTab === 'inactive'
              ? '0 0 0 2px #EDAE49'
              : '0 1px 3px rgba(0,0,0,0.06)'
          }
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
            {statusCounts?.inactive ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Inactive Devices
          </Text>
        </Box>

        {/* Rejected Devices */}
        <Box
          bg="white"
          border="1px solid"
          borderColor={activeTab === 'rejected' ? '#c9922a' : 'gray.100'}
          borderLeft="4px solid"
          borderLeftColor="red.400"
          borderRadius="md"
          p={5}
          cursor="pointer"
          transition="box-shadow 0.15s, border-color 0.15s"
          _hover={{ boxShadow: '0 4px 14px rgba(0,0,0,0.09)' }}
          boxShadow={
            activeTab === 'rejected'
              ? '0 0 0 2px #EDAE49'
              : '0 1px 3px rgba(0,0,0,0.06)'
          }
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
            {statusCounts?.rejected ?? 0}
          </Text>
          <Text fontSize="11.5px" color="primary.1900" mt={1.5}>
            Failed authentication
          </Text>
        </Box>
      </SimpleGrid>

      {/* Tab Strip — connects flush to table panel below */}
      <Flex
        bg="white"
        border="1px solid"
        borderColor="gray.100"
        borderBottom="none"
        borderTopRadius="md"
        px={2}
        boxShadow="0 1px 3px rgba(0,0,0,0.06)"
      >
        {/* New Devices tab */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={2}
          px={4}
          py={3.5}
          fontSize="13.5px"
          fontWeight={activeTab === 'new' ? '600' : '500'}
          color={activeTab === 'new' ? 'orange.2500' : 'gray.400'}
          borderBottom="2px solid"
          borderBottomColor={
            activeTab === 'new' ? 'orange.2500' : 'transparent'
          }
          mb="-1px"
          cursor="pointer"
          transition="color 0.13s, border-color 0.13s"
          _hover={{ color: activeTab === 'new' ? 'orange.2500' : 'gray.600' }}
          onClick={() => navigate(PAGE_ROUTES.DEVICE_ENROLLMENT)}
          whiteSpace="nowrap"
        >
          New Devices
          <Box
            as="span"
            fontSize="11px"
            fontWeight="600"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="blue.2100"
            color="blue.100"
          >
            {statusCounts?.idle ?? 0}
          </Box>
        </Box>

        {/* Claimed Devices tab */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={2}
          px={4}
          py={3.5}
          fontSize="13.5px"
          fontWeight={activeTab === 'claimed' ? '600' : '500'}
          color={activeTab === 'claimed' ? 'orange.2500' : 'gray.400'}
          borderBottom="2px solid"
          borderBottomColor={
            activeTab === 'claimed' ? 'orange.2500' : 'transparent'
          }
          mb="-1px"
          cursor="pointer"
          transition="color 0.13s, border-color 0.13s"
          _hover={{
            color: activeTab === 'claimed' ? 'orange.2500' : 'gray.600',
          }}
          onClick={() => navigate(PAGE_ROUTES.AUTHENTICATED_DEVICES)}
          whiteSpace="nowrap"
        >
          Claimed Devices
          <Box
            as="span"
            fontSize="11px"
            fontWeight="600"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="orange.1700"
            color="orange.1300"
          >
            {statusCounts?.claimed ?? 0}
          </Box>
        </Box>

        {/* Active Devices tab */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={2}
          px={4}
          py={3.5}
          fontSize="13.5px"
          fontWeight={activeTab === 'active' ? '600' : '500'}
          color={activeTab === 'active' ? 'orange.2500' : 'gray.400'}
          borderBottom="2px solid"
          borderBottomColor={
            activeTab === 'active' ? 'orange.2500' : 'transparent'
          }
          mb="-1px"
          cursor="pointer"
          transition="color 0.13s, border-color 0.13s"
          _hover={{
            color: activeTab === 'active' ? 'orange.2500' : 'gray.600',
          }}
          onClick={() => navigate(PAGE_ROUTES.ACTIVE_DEVICES)}
          whiteSpace="nowrap"
        >
          Active Devices
          <Box
            as="span"
            fontSize="11px"
            fontWeight="600"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="primary.1100"
            color="brand.1600"
          >
            {statusCounts?.active ?? 0}
          </Box>
        </Box>

        {/* Inactive Devices tab */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={2}
          px={4}
          py={3.5}
          fontSize="13.5px"
          fontWeight={activeTab === 'inactive' ? '600' : '500'}
          color={activeTab === 'inactive' ? 'orange.2500' : 'gray.400'}
          borderBottom="2px solid"
          borderBottomColor={
            activeTab === 'inactive' ? 'orange.2500' : 'transparent'
          }
          mb="-1px"
          cursor="pointer"
          transition="color 0.13s, border-color 0.13s"
          _hover={{
            color: activeTab === 'inactive' ? 'orange.2500' : 'gray.600',
          }}
          onClick={() => navigate(PAGE_ROUTES.INACTIVE_DEVICES)}
          whiteSpace="nowrap"
        >
          Inactive Devices
          <Box
            as="span"
            fontSize="11px"
            fontWeight="600"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="error.1700"
            color="error.550"
          >
            {statusCounts?.inactive ?? 0}
          </Box>
        </Box>

        {/* Rejected Devices tab */}
        <Box
          as="button"
          display="flex"
          alignItems="center"
          gap={2}
          px={4}
          py={3.5}
          fontSize="13.5px"
          fontWeight={activeTab === 'rejected' ? '600' : '500'}
          color={activeTab === 'rejected' ? 'orange.2500' : 'gray.400'}
          borderBottom="2px solid"
          borderBottomColor={
            activeTab === 'rejected' ? 'orange.2500' : 'transparent'
          }
          mb="-1px"
          cursor="pointer"
          transition="color 0.13s, border-color 0.13s"
          _hover={{
            color: activeTab === 'rejected' ? 'orange.2500' : 'gray.600',
          }}
          onClick={() => navigate(PAGE_ROUTES.REJECTED_DEVICES)}
          whiteSpace="nowrap"
        >
          Rejected Devices
          <Box
            as="span"
            fontSize="11px"
            fontWeight="600"
            px={1.5}
            py={0.5}
            borderRadius="full"
            bg="red.50"
            color="red.500"
          >
            {statusCounts?.rejected ?? 0}
          </Box>
        </Box>
      </Flex>

      {/* Table Panel — connects flush to tab strip above */}
      <Box
        bg="white"
        border="1px solid"
        borderColor="gray.100"
        borderTop="none"
        borderBottomRadius="md"
        boxShadow="0 1px 3px rgba(0,0,0,0.06)"
      >
        {/* Toolbar */}
        <Flex
          align="center"
          flexWrap="wrap"
          gap={2.5}
          px={4}
          py={3.5}
          borderBottom="1px solid"
          borderColor="gray.100"
        >
          <InputGroup bg="gray.25" borderRadius="md" minW="280px" maxW="320px">
            <InputLeftElement pointerEvents="none" h="full">
              <Search />
            </InputLeftElement>
            <Input
              placeholder="Search by Device ID, Name, or Token…"
              fontSize="13px"
              borderRadius="md"
              border="1px solid"
              borderColor="gray.100"
              bg="gray.25"
              _placeholder={{ color: 'gray.300' }}
              _focus={{
                borderColor: '#c9922a',
                bg: 'white',
                boxShadow: 'none',
              }}
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </InputGroup>

          <Select
            aria-label="Filter by groups"
            placeholder="All groups"
            fontSize="13px"
            borderRadius="md"
            maxW="175px"
            bg="gray.25"
            borderColor="gray.100"
            _focus={{ borderColor: '#c9922a' }}
            value={deviceGroupId}
            onChange={(e) =>
              handleFilterChange('device_group_id', e.target.value)
            }
          >
            <option value="0">Unassigned</option>
            {groups.map((g) => (
              <option key={g.device_group_id} value={g.device_group_id}>
                {g.group_name}
              </option>
            ))}
          </Select>

          <Select
            aria-label="Filter by profiles"
            placeholder="All profiles"
            fontSize="13px"
            borderRadius="md"
            maxW="175px"
            bg="gray.25"
            borderColor="gray.100"
            _focus={{ borderColor: '#c9922a' }}
            value={profileId}
            onChange={(e) => handleFilterChange('profile_id', e.target.value)}
          >
            <option value="0">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.profile_id} value={p.profile_id}>
                {p.profile_name}
              </option>
            ))}
          </Select>

          {activeTab === 'new' && (
            <Select
              aria-label="Filter by status"
              placeholder="All status"
              fontSize="13px"
              borderRadius="md"
              maxW="155px"
              bg="gray.25"
              borderColor="gray.100"
              _focus={{ borderColor: '#c9922a' }}
              value={statusFilter}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              {AUTH_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}

          {activeTab === 'new' && canCreate && (
            <Button
              size="sm"
              px="16px"
              py="8px"
              h="auto"
              fontSize="13px"
              fontWeight="500"
              bg="orange.2500"
              color="white"
              // _hover={{ bg: '#b07d20' }}
              onClick={() => setIsBulkAuthOpen(true)}
            >
              Bulk Authenticate
            </Button>
          )}

          {isClaimedView && canCreate && (
            <Button
              size="sm"
              px="16px"
              py="8px"
              h="auto"
              fontSize="13px"
              fontWeight="500"
              bg="orange.2500"
              color="white"
              // _hover={{ bg: '#b07d20' }}
              onClick={async () => {
                await refetchStatusCounts();
                setIsBulkLifecycleOpen(true);
              }}
            >
              Move to Lifecycle
            </Button>
          )}

          <Spacer />

          <ExportMenu
            onExport={exportDevices}
            exportOptions={{
              search: debouncedSearch || undefined,
              status: filterStatus || undefined,
              device_group_id: deviceGroupId
                ? Number(deviceGroupId)
                : undefined,
              profile_id: profileId ? Number(profileId) : undefined,
            }}
            filename="devices-export"
            canExport={canRetrieve}
          />
        </Flex>

        {/* Table */}
        <AllDeviceTable
          search={debouncedSearch}
          page={page}
          limit={limit}
          status={filterStatus}
          is_active={isActive}
          device_group_id={deviceGroupId ? Number(deviceGroupId) : undefined}
          profile_id={profileId ? Number(profileId) : undefined}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </Box>

      <AllDeviceForm />
      <ViewDeviceForm />
      <BulkAuthenticateModal
        isOpen={isBulkAuthOpen}
        onClose={() => setIsBulkAuthOpen(false)}
        idleCount={statusCounts?.idle ?? 0}
        filters={{
          statuses: statusFilter ? [statusFilter] : undefined,
          device_group_id: deviceGroupId ? Number(deviceGroupId) : undefined,
          profile_id: profileId ? Number(profileId) : undefined,
        }}
      />
      <BulkLifecycleModal
        isOpen={isBulkLifecycleOpen}
        onClose={() => setIsBulkLifecycleOpen(false)}
        claimedCount={statusCounts?.claimed ?? 0}
      />
      <ImportDeviceModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
      <ConfirmDialog
        isOpen={isOpen}
        onClose={closeModal}
        onConfirm={executeMove}
        title="Move Devices ?"
        message={'Are you sure you want to move the selected devices?'}
        confirmText="Yes, I am sure"
        cancelText="No"
        isLoading={isLoading}
        colorScheme="red"
        icon={checkMark}
      />
    </>
  );
};
