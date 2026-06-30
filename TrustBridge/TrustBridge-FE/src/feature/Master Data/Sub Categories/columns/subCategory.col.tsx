import { HStack, IconButton, Text } from '@chakra-ui/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { SubCategoryResponse } from '../types/SubCategory.types';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { Edit, Trash } from '../../../../assets/svgs';

export const useSubCategoryColumns = (): Array<
  ColumnDef<SubCategoryResponse>
> => {
  const { modalOpen } = useModalSearchParams();

  return [
    {
      id: 'sub_category_id',
      header: 'ID',
      accessorKey: 'sub_category_id',
    },
    {
      id: 'sub_category_name',
      header: 'Sub-Category Name',
      accessorKey: 'sub_category_name',
    },
    {
      id: 'category',
      header: 'Category',
      accessorKey: 'category',
      cell: ({ row }) => (
        <Text>{row.original.category?.category_name ?? '-'}</Text>
      ),
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
              modalOpen(
                String(row.original.sub_category_id),
                'updateSubCategory',
              )
            }
          />
          <IconButton
            aria-label="Delete"
            icon={<Trash />}
            size="sm"
            variant="ghost"
            colorScheme="red"
            onClick={() =>
              modalOpen(
                String(row.original.sub_category_id),
                'deleteSubCategory',
              )
            }
          />
        </HStack>
      ),
    },
  ];
};
