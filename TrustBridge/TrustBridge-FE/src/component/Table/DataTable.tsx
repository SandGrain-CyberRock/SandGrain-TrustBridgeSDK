import {
  Box,
  Table as ChakraTable,
  TableContainer,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Checkbox,
  Flex,
  Text,
} from '@chakra-ui/react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { TableHeader, type TableHeaderProps } from './TableHeader';
import type { TableFooterProps } from './TableFooter';
import TableFooter from './TableFooter';
import { useEffect, useState } from 'react';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  showCheckbox?: boolean;
  headerProps?: TableHeaderProps;
  footerProps?: TableFooterProps;
  onSelectionChange?: (rows: T[]) => void;
  noBorder?: boolean;
  emptyStateText?: string;
}

export const DataTable = <T,>({
  data,
  columns,
  showCheckbox = false,
  headerProps,
  footerProps,
  onSelectionChange,
  noBorder = false,
  emptyStateText = 'No records available',
}: DataTableProps<T>) => {
  'use no memo';
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const checkboxColumn: ColumnDef<T> = {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        isChecked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        size="lg"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        isChecked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        size="lg"
      />
    ),
  };

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: showCheckbox ? [checkboxColumn, ...columns] : columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    if (!onSelectionChange) return;

    const selectedRows = table
      .getSelectedRowModel()
      .rows.map((row) => row.original);

    onSelectionChange(selectedRows);
  }, [rowSelection, onSelectionChange, table]);

  return (
    <Box w="full">
      {headerProps && <TableHeader {...headerProps} />}

      {/* Table Body */}
      <Box overflowX="auto" mt={noBorder ? 0 : 4}>
        <TableContainer
          border={noBorder ? undefined : '1px solid'}
          borderColor={noBorder ? undefined : 'primary.100'}
          borderRadius={noBorder ? undefined : 'md'}
        >
          <ChakraTable variant="simple" size="md">
            <Thead bg="gray.25" borderBottom="1px solid" borderColor="gray.100">
              {table.getHeaderGroups().map((headerGroup) => (
                <Tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <Th
                      key={header.id}
                      py={3}
                      px={5}
                      textTransform="uppercase"
                      fontSize="11px"
                      fontWeight="600"
                      letterSpacing="0.05em"
                      color="gray.400"
                      whiteSpace="nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </Th>
                  ))}
                </Tr>
              ))}
            </Thead>

            <Tbody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <Tr
                    key={row.id}
                    _hover={{ bg: 'gray.25' }}
                    transition="background 0.1s"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <Td
                        key={cell.id}
                        py={3.5}
                        px={5}
                        fontSize="13.5px"
                        color="#374151"
                        borderColor="gray.100"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Td>
                    ))}
                  </Tr>
                ))
              ) : (
                <Tr>
                  <Td
                    colSpan={columns.length + (showCheckbox ? 1 : 0)}
                    borderBottom="none"
                  >
                    <Flex
                      direction="column"
                      align="center"
                      justify="center"
                      py={14}
                      gap={3}
                      color="gray.400"
                    >
                      <Box
                        w="52px"
                        h="52px"
                        bg="gray.50"
                        border="1px solid"
                        borderColor="gray.100"
                        borderRadius="14px"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <rect x="2" y="7" width="20" height="14" rx="2" />
                          <path d="M16 7V5a2 2 0 0 0-4 0v2" />
                        </svg>
                      </Box>
                      <Text fontSize="13.5px" color="gray.400">
                        {emptyStateText}
                      </Text>
                    </Flex>
                  </Td>
                </Tr>
              )}
            </Tbody>
          </ChakraTable>
        </TableContainer>
      </Box>

      {footerProps && footerProps.totalCount > 0 && (
        <TableFooter {...footerProps} />
      )}
    </Box>
  );
};
