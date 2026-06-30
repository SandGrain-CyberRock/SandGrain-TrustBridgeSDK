import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  VStack,
} from '@chakra-ui/react';
import { PERMISSIONS } from '../../../constant/Permission';
import { Add, Export, Filter, Search } from '../../../assets/svgs';
import { usePermission } from '../../../hooks/usePermission';

import { useGetOrganizations } from '../service/Organizations';
import { DataTable } from '../../../component/Table/DataTable';
import { useOrganizationsColumns } from '../columns/org.col';
import { OrganizationsForm } from '../components/OrganizationsForm';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';

export const Organizations = () => {
  const { modalOpen } = useModalSearchParams();
  const organizationsColumns = useOrganizationsColumns();
  const { data: organizationsData } = useGetOrganizations();

  const openAddOrganizationModal = () => {
    modalOpen('', 'addOrganizations');
  };

  return (
    <>
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
              Organization List
            </Text>
            <Text variant="sm_normal" color="gray.1600">
              Complete list of organizations in the system
            </Text>
          </VStack>
          <VStack align="end" spacing={4}>
            <HStack>
              {usePermission(PERMISSIONS.ORGANIZATIONS_CREATE) && (
                <Button
                  variant="primary"
                  px="24px"
                  py="10px"
                  leftIcon={<Add color="white" />}
                  onClick={openAddOrganizationModal}
                >
                  <Text variant="sm_normal">Add Organization</Text>
                </Button>
              )}
            </HStack>
          </VStack>
        </Flex>

        <Flex justify="space-between" mt={4}>
          <Box display={{ base: 'none', md: 'block' }} w={'250px'}>
            <InputGroup bg="gray.25" borderRadius="xl">
              <InputLeftElement pointerEvents="none">
                <Search />
              </InputLeftElement>
              <Input
                placeholder="Search Organizations..."
                fontSize="xs"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
              />
            </InputGroup>
          </Box>
          <Box>
            <HStack spacing={4}>
              <Button variant="outline" px={'3'} leftIcon={<Filter />}>
                <Text variant="sm_normal" color="primary.1600">
                  Filter
                </Text>
              </Button>
              <Button variant="outline" px={'3'} leftIcon={<Export />}>
                <Text variant="sm_normal" color="primary.1600">
                  Export
                </Text>
              </Button>
            </HStack>
            {/* <ExportMenu
              onExport={exportOrganizations}
              exportOptions={{ search: debouncedSearch }}
              filename="organization-export"
              canExport={canRetrieve}
            /> */}
          </Box>
        </Flex>
        <DataTable
          data={organizationsData ?? []}
          columns={organizationsColumns}
          showCheckbox={false}
          emptyStateText="No organizations available"
        />
        <OrganizationsForm />
      </Box>
    </>
  );
};
