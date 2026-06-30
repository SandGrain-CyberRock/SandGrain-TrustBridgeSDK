import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { Device } from '../types/AllDeviceType';
import { EyeOpen, Edit, Trash } from '../../../assets/svgs';
import { DataTable } from '../../../component/Table/DataTable';
import {
  useGetDevices,
  useDeleteDevice,
  useUpdateDevice,
} from '../service/Devices';
import { HStack, IconButton, Tooltip, useDisclosure } from '@chakra-ui/react';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';
import { StatusToggle } from '../../../component/StatusToggle/StatusToggle';
import { LifecycleModal } from './LifecycleModal';

const deviceColumns: ColumnDef<Device>[] = [
  {
    header: 'Device ID',
    accessorKey: 'device_id',
  },
  {
    header: 'Device Name',
    accessorKey: 'device_name',
    cell: ({ getValue }) => {
      const name = getValue<string>();
      return (
        <span style={{ fontWeight: 600, color: '#1a1a1a', fontSize: '13.5px' }}>
          {name}
        </span>
      );
    },
  },
  {
    header: 'Device Type',
    accessorKey: 'device_type',
  },
  {
    header: 'Group',
    accessorKey: 'device_group_id',
    cell: ({ row }) => row.original?.deviceGroup?.group_name || '-',
  },
  {
    header: 'Profile',
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
];

interface AllDeviceTableProps {
  search: string;
  page: number;
  limit: number;
  status?: string;
  device_group_id?: number;
  profile_id?: number;
  is_active?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
  onSelectionChange?: (devices: Device[]) => void;
}

export const AllDeviceTable = ({
  search,
  page,
  limit,
  status,
  device_group_id,
  profile_id,
  is_active,
  onPageChange,
  onPageSizeChange,
  onSelectionChange,
}: AllDeviceTableProps) => {
  const { data } = useGetDevices({
    page,
    limit,
    search,
    status,
    device_group_id,
    profile_id,
    is_active,
  });
  const deleteDevice = useDeleteDevice();
  const { mutate: updateDevice, isPending: isUpdating } = useUpdateDevice();
  const { modalOpen } = useModalSearchParams();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [lifecycleDevice, setLifecycleDevice] = useState<Device | null>(null);

  const canUpdate = usePermission(PERMISSIONS.DEVICE_UPDATE);
  const canDelete = usePermission(PERMISSIONS.DEVICE_DELETE);

  const devices = data?.data || [];
  const total = data?.total || 0;

  const handleViewDetails = (device: Device) => {
    modalOpen(String(device.device_id), 'viewDeviceDetails');
  };

  const handleEdit = (device: Device) => {
    modalOpen(String(device.device_id), 'updateDevice');
  };

  const handleDeleteClick = (device: Device) => {
    setDeviceToDelete(device);
    onOpen();
  };

  const handleConfirmDelete = () => {
    if (deviceToDelete) {
      deleteDevice.mutate(deviceToDelete.device_id);
      setDeviceToDelete(null);
    }
  };

  const activeStatusColumn: ColumnDef<Device> = {
    header: 'Active',
    cell: ({ row: { original } }) => (
      <StatusToggle
        id={String(original.device_id)}
        currentStatus={original.is_active ? 'ACTIVE' : 'INACTIVE'}
        isLoading={isUpdating}
        onToggle={({ id, nextStatus }) =>
          updateDevice({
            id: Number(id),
            data: { is_active: nextStatus === 'ACTIVE' },
          })
        }
      />
    ),
  };

  const actionsColumn: ColumnDef<Device> = {
    header: 'Actions',
    cell: ({ row }: { row: { original: Device } }) => {
      const isAuthenticated = row.original.status === 'authenticated';
      return (
        <HStack spacing={1}>
          <Tooltip label="View" hasArrow placement="top" openDelay={300}>
            <IconButton
              aria-label="View"
              icon={<EyeOpen />}
              size="sm"
              variant="ghost"
              w="30px"
              h="30px"
              minW="30px"
              borderRadius="6px"
              border="1px solid"
              borderColor="gray.100"
              color="gray.400"
              bg="transparent"
              _hover={{
                bg: 'gray.50',
                color: 'gray.600',
                borderColor: 'gray.200',
              }}
              onClick={() => handleViewDetails(row.original)}
            />
          </Tooltip>
          {canUpdate && isAuthenticated && (
            <Tooltip label="Lifecycle" hasArrow placement="top" openDelay={300}>
              <IconButton
                aria-label="Lifecycle"
                icon={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                }
                size="sm"
                variant="ghost"
                w="30px"
                h="30px"
                minW="30px"
                borderRadius="6px"
                border="1px solid"
                borderColor="orange.200"
                color="#c9922a"
                bg="transparent"
                _hover={{
                  bg: '#FFF8EC',
                  color: '#b07d20',
                  borderColor: '#c9922a',
                }}
                onClick={() => setLifecycleDevice(row.original)}
              />
            </Tooltip>
          )}
          {canUpdate && (
            <Tooltip label="Edit" hasArrow placement="top" openDelay={300}>
              <IconButton
                aria-label="Edit"
                icon={<Edit />}
                size="sm"
                variant="ghost"
                w="30px"
                h="30px"
                minW="30px"
                borderRadius="6px"
                border="1px solid"
                borderColor="gray.100"
                color="gray.400"
                bg="transparent"
                _hover={{
                  bg: 'gray.50',
                  color: 'gray.600',
                  borderColor: 'gray.200',
                }}
                onClick={() => handleEdit(row.original)}
              />
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip label="Delete" hasArrow placement="top" openDelay={300}>
              <IconButton
                aria-label="Delete"
                icon={<Trash />}
                size="sm"
                variant="ghost"
                w="30px"
                h="30px"
                minW="30px"
                borderRadius="6px"
                border="1px solid"
                borderColor="gray.100"
                color="gray.400"
                bg="transparent"
                _hover={{
                  bg: 'red.50',
                  color: 'red.500',
                  borderColor: 'red.200',
                }}
                onClick={() => handleDeleteClick(row.original)}
              />
            </Tooltip>
          )}
        </HStack>
      );
    },
  };

  const columnsWithActions: ColumnDef<Device>[] = [
    ...deviceColumns,
    ...(canUpdate ? [activeStatusColumn] : []),
    ...(canUpdate || canDelete ? [actionsColumn] : []),
  ];

  return (
    <>
      <DataTable
        data={devices}
        columns={columnsWithActions}
        showCheckbox={false}
        noBorder={true}
        emptyStateText="No devices available"
        onSelectionChange={onSelectionChange}
        footerProps={{
          currentPage: page,
          pageSize: limit,
          totalCount: total,
          onPageChange,
          onPageSizeChange,
        }}
      />
      <ConfirmDialog
        isOpen={isOpen}
        onClose={onClose}
        onConfirm={handleConfirmDelete}
        title="Delete Device"
        message={`Are you sure you want to delete "${deviceToDelete?.device_name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={deleteDevice.isPending}
        colorScheme="red"
      />
      <LifecycleModal
        device={lifecycleDevice}
        isOpen={lifecycleDevice !== null}
        onClose={() => setLifecycleDevice(null)}
      />
    </>
  );
};
