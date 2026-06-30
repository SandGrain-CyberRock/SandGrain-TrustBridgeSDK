import { HStack, IconButton, Text } from '@chakra-ui/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { TagResponse } from '../types/Tag.types';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { Edit, Trash } from '../../../../assets/svgs';

export const useTagColumns = (): Array<ColumnDef<TagResponse>> => {
  const { modalOpen } = useModalSearchParams();

  return [
    {
      id: 'tag_id',
      header: 'ID',
      accessorKey: 'tag_id',
    },
    {
      id: 'tag_name',
      header: 'Tag Name',
      accessorKey: 'tag_name',
    },
    {
      id: 'created_at',
      header: 'Created At',
      accessorKey: 'created_at',
      cell: ({ getValue }) => (
        <Text>{new Date(String(getValue())).toLocaleDateString()}</Text>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <HStack justify="start" spacing={2}>
          <IconButton
            aria-label="Edit"
            icon={<Edit />}
            size="sm"
            variant="ghost"
            onClick={() => modalOpen(String(row.original.tag_id), 'updateTag')}
          />
          <IconButton
            aria-label="Delete"
            icon={<Trash />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() => modalOpen(String(row.original.tag_id), 'deleteTag')}
          />
        </HStack>
      ),
    },
  ];
};
