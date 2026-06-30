import { HStack, IconButton, Text } from '@chakra-ui/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { CategoryResponse } from '../types/Category.types';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { Edit, Trash } from '../../../../assets/svgs';

export const useCategoryColumns = (): Array<ColumnDef<CategoryResponse>> => {
  const { modalOpen } = useModalSearchParams();

  return [
    {
      id: 'category_id',
      header: 'ID',
      accessorKey: 'category_id',
    },
    {
      id: 'category_name',
      header: 'Category Name',
      accessorKey: 'category_name',
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
            onClick={() =>
              modalOpen(String(row.original.category_id), 'updateCategory')
            }
          />
          <IconButton
            aria-label="Delete"
            icon={<Trash />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() =>
              modalOpen(String(row.original.category_id), 'deleteCategory')
            }
          />
        </HStack>
      ),
    },
  ];
};
