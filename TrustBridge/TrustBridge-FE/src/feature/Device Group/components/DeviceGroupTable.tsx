import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { DeviceGroup } from '../types/DeviceGroupType';
import { Edit, Trash } from '../../../assets/svgs';
import { DataTable } from '../../../component/Table/DataTable';
import {
  useGetDeviceGroups,
  useDeleteDeviceGroup,
  useUpdateDeviceGroup,
} from '../service/DeviceGroup';
import { IconButton, useDisclosure, HStack } from '@chakra-ui/react';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { usePermission } from '../../../hooks/usePermission';
import { PERMISSIONS } from '../../../constant/Permission';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';
import { remove } from '../../../assets/images';
import { StatusToggle } from '../../../component/StatusToggle/StatusToggle';

const deviceGroupColumns: ColumnDef<DeviceGroup>[] = [
  {
    header: 'Device Group ID',
    accessorKey: 'device_group_id',
  },
  {
    header: 'Device Group Name',
    accessorKey: 'group_name',
  },
];

interface DeviceGroupTableProps {
  search: string;
  page: number;
  limit: number;
  status?: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (limit: number) => void;
}

export const DeviceGroupTable = ({
  search,
  page,
  limit,
  status,
  onPageChange,
  onPageSizeChange,
}: DeviceGroupTableProps) => {
  const { data } = useGetDeviceGroups({ page, limit, search, status });
  const deleteDeviceGroup = useDeleteDeviceGroup();
  const { mutate: updateDeviceGroup, isPending: isUpdating } =
    useUpdateDeviceGroup();
  const { modalOpen } = useModalSearchParams();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [groupToDelete, setGroupToDelete] = useState<DeviceGroup | null>(null);

  const canUpdate = usePermission(PERMISSIONS.DEVICE_GROUP_UPDATE);
  const canDelete = usePermission(PERMISSIONS.DEVICE_GROUP_DELETE);

  const deviceGroups = data?.data || [];
  const total = data?.total || 0;

  const handleEdit = (group: DeviceGroup) => {
    modalOpen(String(group.device_group_id), 'updateDeviceGroup');
  };

  const handleDeleteClick = (group: DeviceGroup) => {
    setGroupToDelete(group);
    onOpen();
  };

  const handleConfirmDelete = () => {
    if (groupToDelete) {
      deleteDeviceGroup.mutate(groupToDelete.device_group_id);
      setGroupToDelete(null);
    }
  };

  const activeStatusColumn: ColumnDef<DeviceGroup> = {
    header: 'Active',
    cell: ({ row: { original } }) => (
      <StatusToggle
        id={String(original.device_group_id)}
        currentStatus={original.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
        isLoading={isUpdating}
        onToggle={({ id, nextStatus }) =>
          updateDeviceGroup({ id: Number(id), data: { status: nextStatus } })
        }
      />
    ),
  };

  const columnsWithActions: ColumnDef<DeviceGroup>[] = [
    ...deviceGroupColumns,
    ...(canUpdate ? [activeStatusColumn] : []),
    ...(canUpdate || canDelete
      ? [
          {
            header: 'Actions',
            cell: ({ row }: { row: { original: DeviceGroup } }) => (
              <HStack justify="start">
                {canUpdate && (
                  <IconButton
                    icon={<Edit />}
                    variant="ghost"
                    size="sm"
                    aria-label="View/Edit"
                    onClick={() => handleEdit(row.original)}
                  />
                )}
                {canDelete && (
                  <IconButton
                    icon={<Trash />}
                    variant="ghost"
                    size="sm"
                    aria-label="Delete"
                    colorScheme="red"
                    onClick={() => handleDeleteClick(row.original)}
                  />
                )}
              </HStack>
            ),
          } as ColumnDef<DeviceGroup>,
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        data={deviceGroups}
        columns={columnsWithActions}
        showCheckbox={false}
        emptyStateText="No device groups available"
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
        title="Delete Group ?"
        message={'Are you sure you want to delete this group?'}
        confirmText="Yes, I am sure"
        cancelText="No"
        isLoading={deleteDeviceGroup.isPending}
        colorScheme="red"
        icon={remove}
      />
    </>
  );
};
