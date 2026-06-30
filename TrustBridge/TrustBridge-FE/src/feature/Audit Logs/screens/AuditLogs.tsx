import { useState } from 'react';
import {
  Box,
  Badge,
  Divider,
  Flex,
  Select,
  Spinner,
  Text,
  Center,
  Button,
  HStack,
} from '@chakra-ui/react';
import { useGetSystemActivities } from '../../Dashboard/service/Dashboard';
import type { SystemActivity } from '../../Dashboard/types/DashboardTypes';

const PAGE_SIZE = 20;

const SEVERITY_COLORS: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  success: { bg: '#E8F6ED', color: '#0C5928', border: '#0C5928' },
  error: { bg: '#FDECEC', color: '#832525', border: '#832525' },
  warning: { bg: '#FBF0CE', color: '#54432C', border: '#54432C' },
  info: { bg: '#B0E6FA', color: '#004964', border: '#004964' },
};

const SEVERITY_LABELS: Record<string, string> = {
  success: 'Success',
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

const ENTITY_LABELS: Record<string, string> = {
  device: 'Device',
  device_group: 'Device Group',
  user: 'User',
  organization: 'Organization',
  role: 'Role',
  permission: 'Permission',
  device_profile: 'Device Profile',
  category: 'Category',
  sub_category: 'Sub Category',
  tag: 'Tag',
  profile_param: 'Profile Param',
  system: 'System',
};

const ACTIVITY_LABELS: Record<string, string> = {
  // Device
  device_created: 'Device Created',
  device_authenticated: 'Authenticated',
  device_auth_in_progress: 'Auth In Progress',
  device_failed: 'Auth Failed',
  device_approved: 'Approved',
  device_rejected: 'Rejected',
  device_deleted: 'Deleted',
  // Device Group
  device_group_created: 'Group Created',
  device_group_updated: 'Group Updated',
  device_group_deleted: 'Group Deleted',
  device_group_password_changed: 'Password Changed',
  // User
  user_created: 'User Created',
  user_updated: 'User Updated',
  user_deleted: 'User Deleted',
  // Organization
  organization_created: 'Org Created',
  organization_updated: 'Org Updated',
  organization_deleted: 'Org Deleted',
  // Role
  role_created: 'Role Created',
  role_updated: 'Role Updated',
  role_deleted: 'Role Deleted',
  // Permission
  permission_created: 'Permission Created',
  permission_updated: 'Permission Updated',
  permission_deleted: 'Permission Deleted',
  // Device Profile
  device_profile_created: 'Profile Created',
  device_profile_updated: 'Profile Updated',
  device_profile_deleted: 'Profile Deleted',
  // Category
  category_created: 'Category Created',
  category_updated: 'Category Updated',
  category_deleted: 'Category Deleted',
  // Sub Category
  sub_category_created: 'Sub-Category Created',
  sub_category_updated: 'Sub-Category Updated',
  sub_category_deleted: 'Sub-Category Deleted',
  // Tag
  tag_created: 'Tag Created',
  tag_updated: 'Tag Updated',
  tag_deleted: 'Tag Deleted',
  // Profile Param
  profile_param_created: 'Param Created',
  profile_param_updated: 'Param Updated',
  profile_param_deleted: 'Param Deleted',
};

const formatDateTime = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

function ActivityRow({ activity }: { activity: SystemActivity }) {
  const colors = SEVERITY_COLORS[activity.severity] ?? SEVERITY_COLORS.info;
  const entityLabel =
    ENTITY_LABELS[activity.entity_type] ?? activity.entity_type;
  const activityLabel =
    ACTIVITY_LABELS[activity.activity_type] ?? activity.activity_type;

  const entityName =
    activity.device?.device_name ||
    activity.deviceGroup?.group_name ||
    (activity.entity_id ? `#${activity.entity_id}` : '—');

  return (
    <Box
      borderLeft="3px solid"
      borderLeftColor={colors.border}
      bg="white"
      borderRadius="md"
      px={4}
      py={3}
      mb={2}
      boxShadow="sm"
    >
      <Flex align="flex-start" gap={4} wrap="wrap">
        {/* Left: severity + type */}
        <Flex direction="column" gap={1} minW="130px">
          <Badge
            px={2}
            py={0.5}
            borderRadius="md"
            bg={colors.bg}
            color={colors.color}
            fontSize="10px"
            fontWeight="700"
            textTransform="uppercase"
            width="fit-content"
          >
            {SEVERITY_LABELS[activity.severity] ?? activity.severity}
          </Badge>
          <Text fontSize="11px" color="gray.400" fontWeight="500">
            {activityLabel}
          </Text>
        </Flex>

        {/* Middle: title + description */}
        <Box flex="1" minW="200px">
          <Text
            fontSize="13px"
            fontWeight="600"
            color="gray.700"
            lineHeight="1.4"
          >
            {activity.title}
          </Text>
          {activity.description && (
            <Text fontSize="12px" color="gray.500" mt={0.5} lineHeight="1.4">
              {activity.description}
            </Text>
          )}
        </Box>

        {/* Right: entity + when */}
        <Flex direction="column" alignItems="flex-end" gap={1} flexShrink={0}>
          <Flex align="center" gap={1}>
            <Text fontSize="11px" color="gray.400">
              {entityLabel}:
            </Text>
            <Text fontSize="11px" color="gray.600" fontWeight="600">
              {entityName}
            </Text>
          </Flex>
          <Text fontSize="11px" color="gray.400">
            {formatDateTime(activity.created_at)}
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}

export const AuditLogs = () => {
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isFetching } = useGetSystemActivities({
    limit: PAGE_SIZE,
    offset,
  });

  const activities = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Client-side filter (severity + entity_type)
  const filtered = activities.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (entityFilter && a.entity_type !== entityFilter) return false;
    return true;
  });

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      {/* Header */}
      <Flex align="center" justify="space-between" mb={6}>
        <Box>
          <Text fontSize="xl" fontWeight="700" color="gray.800">
            Activity Logs
          </Text>
          <Text fontSize="13px" color="gray.500" mt={0.5}>
            {total} total events
          </Text>
        </Box>

        {/* Filters */}
        <HStack gap={3}>
          <Select
            aria-label="Filter by severity"
            size="sm"
            placeholder="All Severities"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            bg="white"
            borderRadius="md"
            w="160px"
          >
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>

          <Select
            aria-label="Filter by entities"
            size="sm"
            placeholder="All Entities"
            value={entityFilter}
            onChange={(e) => {
              setEntityFilter(e.target.value);
              setPage(1);
            }}
            bg="white"
            borderRadius="md"
            w="160px"
          >
            <option value="device">Device</option>
            <option value="device_group">Device Group</option>
            <option value="user">User</option>
            <option value="organization">Organization</option>
            <option value="role">Role</option>
            <option value="permission">Permission</option>
            <option value="device_profile">Device Profile</option>
            <option value="category">Category</option>
            <option value="sub_category">Sub Category</option>
            <option value="tag">Tag</option>
            <option value="profile_param">Profile Param</option>
          </Select>
        </HStack>
      </Flex>

      <Divider mb={4} />

      {/* Column headers */}
      <Flex px={4} pb={2} gap={4}>
        <Text
          fontSize="11px"
          fontWeight="700"
          color="gray.1600"
          textTransform="uppercase"
          minW="130px"
        >
          Severity / Type
        </Text>
        <Text
          fontSize="11px"
          fontWeight="700"
          color="gray.1600"
          textTransform="uppercase"
          flex="1"
        >
          Event
        </Text>
        <Text
          fontSize="11px"
          fontWeight="700"
          color="gray.1600"
          textTransform="uppercase"
        >
          Where / When
        </Text>
      </Flex>

      {/* Activities */}
      {isLoading ? (
        <Center py={16}>
          <Spinner size="lg" color="blue.500" />
        </Center>
      ) : filtered.length === 0 ? (
        <Center py={16}>
          <Text color="gray.400" fontSize="14px">
            No activity found.
          </Text>
        </Center>
      ) : (
        <Box>
          {filtered.map((activity) => (
            <ActivityRow key={activity.activity_id} activity={activity} />
          ))}
        </Box>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Flex justify="center" align="center" gap={3} mt={6}>
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === 1 || isFetching}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Text fontSize="13px" color="gray.600">
            Page {page} of {totalPages}
          </Text>
          <Button
            size="sm"
            variant="outline"
            isDisabled={page === totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </Flex>
      )}
    </Box>
  );
};
