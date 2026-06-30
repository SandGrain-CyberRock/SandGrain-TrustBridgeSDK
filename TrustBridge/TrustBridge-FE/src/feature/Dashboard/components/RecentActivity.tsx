import { Box, HStack, Spacer, Text, Spinner, Center } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { ActivityCard } from './ActivityCard';
import { useGetRecentActivities } from '../service/Dashboard';
import type { IconNamesType } from '../../../component/Icon';
import { PAGE_ROUTES } from '../../../constant/PageRoutes';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';

const getIconForSeverity = (
  severity: string,
  activityIcon?: string,
): IconNamesType => {
  // Use activity-specific icon if provided
  if (activityIcon) {
    return activityIcon as IconNamesType;
  }

  // Fallback to severity-based icon
  switch (severity) {
    case 'success':
      return 'TickSquare';
    case 'error':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'cpu';
  }
};

const getBgColorForSeverity = (severity: string): string | undefined => {
  switch (severity) {
    case 'error':
      return 'error.1600';
    case 'warning':
      return 'error.1600';
    case 'info':
      return 'blue.1100';
    default:
      return undefined;
  }
};

const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} sec ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
};

export const RecentActivity = () => {
  const { data: activities, isLoading } = useGetRecentActivities({ limit: 5 });
  const canViewAuditLogs = usePermission(PERMISSIONS.DEVICE_RETRIEVE);

  return (
    <>
      <HStack py={'6'}>
        <Text variant="lgg_bold">Recent Activity</Text>
        <Spacer />
        {canViewAuditLogs && (
          <Text
            as={Link}
            to={PAGE_ROUTES.AUDIT_LOGS}
            textDecoration="underline"
            cursor="pointer"
            textColor={'blue.2200'}
            _hover={{ color: 'blue.900' }}
          >
            View All
          </Text>
        )}
      </HStack>

      <Box
        maxH="440px"
        overflowY="auto"
        tabIndex={0}
        role="region"
        sx={{
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {isLoading ? (
          <Center py={8}>
            <Spinner size="lg" />
          </Center>
        ) : activities && activities.length > 0 ? (
          activities.map((activity) => (
            <ActivityCard
              key={activity.activity_id}
              iconName={getIconForSeverity(activity.severity, activity.icon)}
              title={activity.title}
              timestamp={formatTimeAgo(activity.created_at)}
              bgColor={getBgColorForSeverity(activity.severity)}
            />
          ))
        ) : (
          <Center py={8}>
            <Text color="gray.500">No recent activity</Text>
          </Center>
        )}
      </Box>
    </>
  );
};
