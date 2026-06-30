import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Add, Search } from '../../../assets/svgs';
import { DeviceGroupTable } from '../components/DeviceGroupTable';
import { DeviceGroupForm } from '../components/DeviceGroupForm';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { useDebounce } from '../../../hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';

export const DeviceGroup = () => {
  const { modalOpen } = useModalSearchParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  const debouncedSearch = useDebounce(searchTerm, 500);

  const canCreate = usePermission(PERMISSIONS.DEVICE_GROUP_CREATE);

  const handleStatusChange = (value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set('status', value);
    } else {
      newParams.delete('status');
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

  const openAddGroupModal = () => {
    modalOpen('', 'addDeviceGroup');
  };

  return (
    <Box
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      p={6}
      bg="white"
      position="relative"
      _hover={{ boxShadow: 'md' }}
      transition="all 0.2s"
    >
      <Flex justify="space-between">
        <VStack align="start">
          <Text variant="xl_medium" color={'primary.1700'}>
            Device Groups
          </Text>
          <Text variant="sm_normal" color="gray.1600">
            Manage and organize devices into groups
          </Text>
        </VStack>

        <HStack>
          {canCreate && (
            <Button
              variant="primary"
              px="24px"
              py="10px"
              leftIcon={<Add color="white" />}
              onClick={openAddGroupModal}
            >
              <Text variant="sm_normal">Add Device Group</Text>
            </Button>
          )}
        </HStack>
      </Flex>

      <Flex justify="space-between" mt={4}>
        <HStack>
          <Box w={'250px'}>
            <InputGroup bg="gray.25" borderRadius="xl">
              <InputLeftElement pointerEvents="none">
                <Search />
              </InputLeftElement>
              <Input
                placeholder="Search by Device Group Name..."
                fontSize="xs"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </InputGroup>
          </Box>
          <Select
            placeholder="All status"
            aria-label="Filter By Status"
            fontSize="sm"
            borderRadius="xl"
            w="160px"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
          >
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </HStack>
      </Flex>

      <DeviceGroupTable
        search={debouncedSearch}
        page={page}
        limit={limit}
        status={statusFilter || undefined}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
      <DeviceGroupForm />
    </Box>
  );
};
