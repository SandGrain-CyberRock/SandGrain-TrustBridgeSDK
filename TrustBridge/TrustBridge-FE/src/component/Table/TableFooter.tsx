import { Flex, Text, Select, HStack } from '@chakra-ui/react';
import Pagination from 'rc-pagination';
import './pagination.css';
import { Arrowleft, ArrowRight } from '../../assets/svgs';

export interface TableFooterProps {
  totalCount: number;
  pageSize?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

const TableFooter = ({
  totalCount,
  pageSize = 10,
  currentPage = 1,
  onPageChange,
  onPageSizeChange,
}: TableFooterProps) => {
  return (
    <Flex justify="space-between" align="center" mt={4} flexWrap="wrap" gap={2}>
      <HStack>
        <Text variant="sm_normal">Rows per page:</Text>
        <Select
          aria-label="Page Size"
          w="70px"
          value={pageSize}
          h="36px"
          bg={'gray.25'}
          fontSize="14px"
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
        >
          {[5, 10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </Select>
      </HStack>

      <Pagination
        current={currentPage}
        pageSize={pageSize}
        total={totalCount}
        onChange={(page) => onPageChange?.(page)}
        itemRender={(_, type, element) => {
          if (type === 'prev') return <Arrowleft />;
          if (type === 'next') return <ArrowRight />;
          return element;
        }}
      />

      <Text variant="sm_normal">
        Showing{' '}
        <Text as="span" fontWeight="bold">
          {totalCount > 0 &&
            `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalCount)}`}
        </Text>{' '}
        entries out of {totalCount}
      </Text>
    </Flex>
  );
};

export default TableFooter;
