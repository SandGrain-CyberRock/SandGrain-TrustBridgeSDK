import { DataTable } from '../../../component/Table/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type { Device } from '../types/DeviceType';
import { useGetRecentDevices } from '../service/Dashboard';
import { Spinner, Center, Text } from '@chakra-ui/react';

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

const deviceColumns: ColumnDef<Device>[] = [
  {
    header: 'Device Name',
    accessorKey: 'deviceId',
  },
  {
    header: 'Device Group',
    accessorKey: 'deviceGroup',
    cell: ({ row }) => row.original.deviceGroup?.group_name || '-',
  },
  {
    header: 'Device Profile',
    accessorKey: 'deviceProfile',
    cell: ({ row }) => row.original.deviceProfile?.profile_name || '-',
  },
  {
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row }) => {
      const status = row.original.status;
      const isActive = row.original.is_active;

      // Map authenticated + is_active to display label
      let label = status;
      if (status === 'authenticated') {
        label = isActive ? 'active' : 'inactive';
      }

      const getStatusStyle = () => {
        if (label === 'active')
          return { text: '#004964', bg: '#B0E6FA', border: '#004964' };
        if (label === 'inactive')
          return { text: '#333237', bg: '#EBEBEB', border: '#333237' };
        if (label === 'claimed')
          return { text: '#0C5928', bg: '#E8F6ED', border: '#0C5928' };
        if (label === 'rejected')
          return { text: '#832525', bg: '#FDECEC', border: '#832525' };
        if (label === 'idle')
          return { text: '#54432C', bg: '#FBF0CE', border: '#54432C' };
        return { text: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' };
      };
      const s = getStatusStyle();
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: s.text,
            backgroundColor: s.bg,
            border: `1px solid ${s.border}`,
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 500,
            textTransform: 'capitalize',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: s.text,
              flexShrink: 0,
            }}
          />
          {label}
        </span>
      );
    },
  },
  {
    header: 'Last Seen',
    accessorKey: 'lastSeen',
  },
];

export const DeviceListTable = () => {
  const { data: recentDevices, isLoading } = useGetRecentDevices({ limit: 5 });

  // Map API response to table format
  const deviceData: Device[] =
    recentDevices?.map((device) => ({
      deviceId: device.device_name || `TB-${device.device_id}`,
      serialNumber: `SN-${String(device.device_id).padStart(6, '0')}`,
      type: device.deviceGroup?.group_name || 'Unknown',
      deviceGroup: device.deviceGroup
        ? { group_name: device.deviceGroup.group_name }
        : null,
      deviceProfile: device.deviceProfile,
      lastSeen: formatTimeAgo(device.created_at),
      authEvents: 0,
      status: (device.status as Device['status']) || 'idle',
      is_active: device.is_active,
    })) || [];

  if (isLoading) {
    return (
      <Center py={8}>
        <Spinner size="lg" />
      </Center>
    );
  }

  if (!recentDevices || recentDevices.length === 0) {
    return (
      <Center py={8}>
        <Text color="gray.500">No devices found</Text>
      </Center>
    );
  }

  return (
    <DataTable
      data={deviceData}
      columns={deviceColumns}
      showCheckbox={false}
      emptyStateText="No recent devices"
    />
  );
};
