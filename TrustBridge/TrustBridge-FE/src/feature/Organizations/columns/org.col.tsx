import type { ColumnDef } from '@tanstack/react-table';
import type { OrganizationsResponse } from '../types/Organizations.types';
import { HStack, IconButton, Text } from '@chakra-ui/react';
import { Edit, EyeOpen } from '../../../assets/svgs';
import { StatusToggle } from '../../../component/StatusToggle/StatusToggle';
import { useUpdateOrganization } from '../service/Organizations';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';

export const useOrganizationsColumns = (): Array<
  ColumnDef<OrganizationsResponse>
> => {
  const { mutate, isPending } = useUpdateOrganization();
  const { modalOpen } = useModalSearchParams();

  const handleEdit = (group: OrganizationsResponse) => {
    modalOpen(String(group.ou_id), 'updateOrganizations');
  };

  const handleView = (org: OrganizationsResponse) => {
    modalOpen(String(org.ou_id), 'viewOrganizations');
  };

  return [
    {
      header: 'Organization ID',
      accessorKey: 'ou_id',
      cell: ({ getValue }: { getValue: () => unknown }) => (
        <Text textAlign="center">{getValue() as number}</Text>
      ),
    },
    {
      header: 'Organization Name',
      accessorKey: 'ou_name',
    },
    {
      header: 'Description',
      accessorKey: 'ou_description',
    },
    {
      header: 'Status',
      accessorKey: 'ou_status',
      cell: ({ row: { original } }) => (
        <StatusToggle
          id={original.ou_id.toString()}
          currentStatus={original.ou_status}
          isLoading={isPending}
          onToggle={({ id, nextStatus }) =>
            mutate({
              id,
              data: {
                ou_status: nextStatus,
              },
            })
          }
        />
      ),
    },

    {
      header: 'Actions',
      cell: ({ row }) => (
        <HStack justify="start">
          <IconButton
            icon={<EyeOpen />}
            variant="ghost"
            size="sm"
            aria-label="View/Edit"
            onClick={() => handleView(row.original)}
          />
          <IconButton
            icon={<Edit />}
            variant="ghost"
            size="sm"
            aria-label="Edit"
            onClick={() => handleEdit(row.original)}
          />
        </HStack>
      ),
    },
  ];
};
