import { Fragment, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  HStack,
  Select,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import {
  useDownloadTracingLogs,
  useGetTracingLogs,
} from '../../Dashboard/service/Dashboard';
import type { TraceLog } from '../../Dashboard/types/DashboardTypes';
import {
  PAGE_SIZE,
  PROCESS_TYPES,
  STATUSES,
  COLUMNS,
  STATUS_COLORS,
} from '../constant';
import { formatJson, formatTime } from '../helpers';
import { Add } from '../../../assets/svgs';
import { EmptyIcon } from '../components/EmptyIcon';
import { DateRangeFilter } from '../components/DateRangeFilter';

export const TracingLogs = () => {
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(number | undefined)[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [eventScope, setEventScope] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data, isLoading, isFetching, error } = useGetTracingLogs({
    limit: PAGE_SIZE,
    cursor,
    eventScope: eventScope || undefined,
    status: status || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const { mutate: downloadLogs, isPending: isDownloading } =
    useDownloadTracingLogs();

  const logs: TraceLog[] = data?.data ?? [];

  const resetPagination = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const handleEventScopeChange = (value: string) => {
    setEventScope(value);
    resetPagination();
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
    resetPagination();
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    resetPagination();
  };

  const hasActiveFilters = !!(eventScope || status || fromDate || toDate);

  const clearFilters = () => {
    setEventScope('');
    setStatus('');
    setFromDate('');
    setToDate('');
    resetPagination();
  };

  const goNext = () => {
    if (!data?.hasMore || data.nextCursor == null) return;
    setCursorStack((stack) => [...stack, cursor]);
    setCursor(data.nextCursor);
  };

  const goPrevious = () => {
    if (cursorStack.length === 0) return;
    const prevStack = [...cursorStack];
    const prevCursor = prevStack.pop();
    setCursorStack(prevStack);
    setCursor(prevCursor);
  };

  const isInitialLoad = isLoading && logs.length === 0;
  const canGoPrevious = cursorStack.length > 0;
  const canGoNext = !!data?.hasMore;
  const colSpan = COLUMNS.length + 1;

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <Flex align="center" justify="space-between" mb={6} wrap="wrap" gap={3}>
        <Box>
          <Text fontSize="xl" fontWeight="700" color="gray.800">
            Tracing Logs
          </Text>
          <Text fontSize="13px" color="gray.500" mt={0.5}>
            {logs.length} event{logs.length === 1 ? '' : 's'} on this page
          </Text>
        </Box>

        <HStack gap={3} wrap="wrap">
          <Select
            size="sm"
            placeholder="Event scope"
            value={eventScope}
            onChange={(e) => handleEventScopeChange(e.target.value)}
            bg="white"
            borderColor="gray.200"
            w="170px"
          >
            {PROCESS_TYPES.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>

          <Select
            size="sm"
            placeholder="All statuses"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            bg="white"
            borderColor="gray.200"
            w="150px"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>

          <DateRangeFilter
            fromDate={fromDate}
            toDate={toDate}
            onChange={handleDateRangeChange}
          />

          {hasActiveFilters && (
            <Button
              size="sm"
              variant="ghost"
              color="gray.500"
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}

          <Button
            variant="primary"
            px="24px"
            py="10px"
            leftIcon={<Add color="white" />}
            onClick={() =>
              downloadLogs({ eventScope, status, fromDate, toDate })
            }
            isLoading={isDownloading}
            loadingText="Preparing…"
          >
            <Text variant="sm_normal">Download all</Text>
          </Button>
        </HStack>
      </Flex>

      <Divider mb={4} borderColor="gray.100" />

      {error && (
        <Box
          bg="red.50"
          border="1px solid"
          borderColor="red.100"
          borderRadius="md"
          px={4}
          py={3}
          mb={4}
        >
          <Text color="red.600" fontSize="13px">
            Failed to load logs: {error.message}
          </Text>
        </Box>
      )}

      <Box overflowX="auto">
        <TableContainer
          border="1px solid"
          borderColor="primary.100"
          borderRadius="md"
          bg="white"
        >
          <Table variant="simple" size="md" minW="920px">
            <Thead bg="gray.25" borderBottom="1px solid" borderColor="gray.100">
              <Tr>
                <Th w="32px" px={2} />
                {COLUMNS.map((c) => (
                  <Th
                    key={c.label}
                    py={3}
                    px={5}
                    textTransform="uppercase"
                    fontSize="11px"
                    fontWeight="600"
                    letterSpacing="0.05em"
                    color="gray.400"
                    whiteSpace="nowrap"
                    w={c.w}
                  >
                    {c.label}
                  </Th>
                ))}
              </Tr>
            </Thead>

            <Tbody>
              {isInitialLoad ? (
                <Tr>
                  <Td colSpan={colSpan} borderBottom="none">
                    <Flex justify="center" align="center" py={16}>
                      <Spinner size="lg" color="blue.500" />
                    </Flex>
                  </Td>
                </Tr>
              ) : logs.length === 0 ? (
                <Tr>
                  <Td colSpan={colSpan} borderBottom="none">
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
                        <EmptyIcon />
                      </Box>
                      <Text fontSize="13.5px" color="gray.400">
                        {hasActiveFilters
                          ? 'No trace logs match these filters.'
                          : 'No trace logs found.'}
                      </Text>
                      {hasActiveFilters && (
                        <Button
                          size="xs"
                          variant="ghost"
                          color="blue.500"
                          onClick={clearFilters}
                        >
                          Clear filters
                        </Button>
                      )}
                    </Flex>
                  </Td>
                </Tr>
              ) : (
                logs.map((log) => {
                  const colors = STATUS_COLORS[log.status] ?? {
                    bg: '#EEF2F6',
                    color: '#334155',
                  };
                  const hasRequest = !!log.request_data;
                  const hasResponse = !!log.response_data;
                  const hasPayload = hasRequest || hasResponse || !!log.message;
                  const isOpen = expandedId === log.id;

                  return (
                    <Fragment key={log.id}>
                      <Tr
                        cursor={hasPayload ? 'pointer' : 'default'}
                        onClick={() =>
                          hasPayload && setExpandedId(isOpen ? null : log.id)
                        }
                        _hover={{ bg: 'gray.25' }}
                        transition="background 0.1s"
                      >
                        <Td
                          py={3.5}
                          px={2}
                          fontSize="12px"
                          color="gray.400"
                          borderColor="gray.100"
                        >
                          {hasPayload ? (isOpen ? '▾' : '▸') : ''}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          color="#374151"
                          whiteSpace="nowrap"
                          borderColor="gray.100"
                        >
                          {formatTime(log.local_timestamp)}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          fontFamily="mono"
                          whiteSpace="nowrap"
                          borderColor="gray.100"
                        >
                          {log.leaf_id ?? log.edge_node_id ?? '—'}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          color="#374151"
                          whiteSpace="nowrap"
                          borderColor="gray.100"
                        >
                          {log.event_scope ?? '—'}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          color="#374151"
                          whiteSpace="nowrap"
                          textTransform="capitalize"
                          borderColor="gray.100"
                        >
                          {log.process_type.replace(/_/g, ' ')}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          fontWeight="500"
                          color="#374151"
                          borderColor="gray.100"
                        >
                          {log.step}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          whiteSpace="nowrap"
                          borderColor="gray.100"
                        >
                          <Badge
                            px={2}
                            py={0.5}
                            borderRadius="md"
                            bg={colors.bg}
                            color={colors.color}
                            fontSize="10px"
                            fontWeight="700"
                            textTransform="uppercase"
                            whiteSpace="nowrap"
                          >
                            {log.status}
                          </Badge>
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          color="gray.500"
                          whiteSpace="nowrap"
                          isNumeric
                          borderColor="gray.100"
                        >
                          {log.duration_ms != null
                            ? `${log.duration_ms}ms`
                            : '—'}
                        </Td>
                        <Td
                          py={3.5}
                          px={5}
                          fontSize="13.5px"
                          color="gray.500"
                          whiteSpace="nowrap"
                          isNumeric
                          borderColor="gray.100"
                        >
                          #{log.attempt_number}
                        </Td>
                      </Tr>

                      {isOpen && (
                        <Tr>
                          <Td
                            colSpan={colSpan}
                            bg="gray.25"
                            px={6}
                            py={4}
                            borderColor="gray.100"
                          >
                            {log.message && (
                              <Text fontSize="12.5px" color="gray.700" mb={3}>
                                {log.message}
                              </Text>
                            )}
                            <Flex gap={4} wrap="wrap">
                              {hasRequest && (
                                <Box flex="1" minW="260px">
                                  <Text
                                    fontSize="10px"
                                    fontWeight="700"
                                    letterSpacing="0.05em"
                                    color="gray.400"
                                    mb={1.5}
                                  >
                                    REQUEST
                                  </Text>
                                  <Box
                                    as="pre"
                                    fontSize="11.5px"
                                    bg="white"
                                    border="1px solid"
                                    borderColor="gray.100"
                                    borderRadius="md"
                                    p={3}
                                    overflowX="auto"
                                    whiteSpace="pre-wrap"
                                  >
                                    {formatJson(log.request_data)}
                                  </Box>
                                </Box>
                              )}
                              {hasResponse && (
                                <Box flex="1" minW="260px">
                                  <Text
                                    fontSize="10px"
                                    fontWeight="700"
                                    letterSpacing="0.05em"
                                    color="gray.400"
                                    mb={1.5}
                                  >
                                    RESPONSE
                                  </Text>
                                  <Box
                                    as="pre"
                                    fontSize="11.5px"
                                    bg="white"
                                    border="1px solid"
                                    borderColor="gray.100"
                                    borderRadius="md"
                                    p={3}
                                    overflowX="auto"
                                    whiteSpace="pre-wrap"
                                  >
                                    {formatJson(log.response_data)}
                                  </Box>
                                </Box>
                              )}
                            </Flex>
                          </Td>
                        </Tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </Tbody>
          </Table>
        </TableContainer>
      </Box>

      {logs.length > 0 && (
        <Flex justify="center" align="center" gap={3} py={4}>
          <Button
            size="sm"
            variant="outline"
            isDisabled={!canGoPrevious || isFetching}
            onClick={goPrevious}
          >
            Previous
          </Button>
          {isFetching && <Spinner size="sm" color="blue.500" />}
          <Button
            size="sm"
            variant="outline"
            isDisabled={!canGoNext || isFetching}
            onClick={goNext}
          >
            Next
          </Button>
        </Flex>
      )}
    </Box>
  );
};
