import {
  Badge,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Select,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useGetDeviceGroups } from '../../Device Group/service/DeviceGroup';
import { useGetDeviceProfiles } from '../../Device Profile/service/DeviceProfile';

export interface DeviceFilters {
  status?: string;
  device_group_id?: number;
  profile_id?: number;
  is_active?: boolean;
}

interface DeviceFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filters: DeviceFilters;
  onApply: (filters: DeviceFilters) => void;
  onReset: () => void;
}

export const DeviceFilterDrawer = ({
  isOpen,
  onClose,
  filters,
  onApply,
  onReset,
}: DeviceFilterDrawerProps) => {
  const { data: groupsData } = useGetDeviceGroups({ limit: 100 });
  const { data: profilesData } = useGetDeviceProfiles({ limit: 100 });

  const groups = groupsData?.data || [];
  const profiles = profilesData?.data || [];

  const activeCount = [
    filters.device_group_id,
    filters.profile_id,
    filters.is_active !== undefined,
  ].filter(Boolean).length;

  const handleChange = (key: keyof DeviceFilters, value: string) => {
    if (key === 'device_group_id' || key === 'profile_id') {
      onApply({ ...filters, [key]: value ? Number(value) : undefined });
    } else if (key === 'is_active') {
      onApply({
        ...filters,
        is_active: value === '' ? undefined : value === 'true',
      });
    } else {
      onApply({ ...filters, [key]: value || undefined });
    }
  };

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="sm">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <HStack>
            <Text>Filters</Text>
            {activeCount > 0 && (
              <Badge bg="#007CAA" color="#FEFFFF" borderRadius="full" px={2}>
                {activeCount}
              </Badge>
            )}
          </HStack>
        </DrawerHeader>

        <DrawerBody>
          <VStack align="stretch" spacing={5} pt={2}>
            {/* Active / Inactive */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                color="gray.500"
                mb={2}
                textTransform="uppercase"
              >
                Active Status
              </Text>
              <Select
                placeholder="All"
                fontSize="sm"
                borderRadius="lg"
                value={
                  filters.is_active === undefined
                    ? ''
                    : String(filters.is_active)
                }
                onChange={(e) => handleChange('is_active', e.target.value)}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Box>

            {/* Device Group */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                color="gray.500"
                mb={2}
                textTransform="uppercase"
              >
                Device Group
              </Text>
              <Select
                placeholder="All groups"
                fontSize="sm"
                borderRadius="lg"
                value={filters.device_group_id ?? ''}
                onChange={(e) =>
                  handleChange('device_group_id', e.target.value)
                }
              >
                {groups.map((g) => (
                  <option key={g.device_group_id} value={g.device_group_id}>
                    {g.group_name}
                  </option>
                ))}
              </Select>
            </Box>

            {/* Device Profile */}
            <Box>
              <Text
                fontSize="xs"
                fontWeight="semibold"
                color="gray.500"
                mb={2}
                textTransform="uppercase"
              >
                Device Profile
              </Text>
              <Select
                placeholder="All profiles"
                fontSize="sm"
                borderRadius="lg"
                value={filters.profile_id ?? ''}
                onChange={(e) => handleChange('profile_id', e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>
                    {p.profile_name}
                  </option>
                ))}
              </Select>
            </Box>
          </VStack>
        </DrawerBody>

        <DrawerFooter borderTopWidth="1px" gap={3}>
          <Button variant="outline" onClick={onReset} size="sm">
            Reset All
          </Button>
          <Button onClick={onClose} size="sm">
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
