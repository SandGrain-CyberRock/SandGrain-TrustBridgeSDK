import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  HStack,
  Select,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from '@chakra-ui/react';
import { useGetTracingLogs } from '../../Dashboard/service/Dashboard';
import type { TraceLog } from '../../Dashboard/types/DashboardTypes';
import {
  PAGE_SIZE,
  PROCESS_TYPES,
  STATUSES,
  COLUMNS,
  STATUS_COLORS,
} from '../constant';
import { formatJson, formatTime } from '../helpers';

export const TracingLogs = () => {
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<(number | undefined)[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [processType, setProcessType] = useState('');
  const [status, setStatus] = useState('');

  const { data, isLoading, isFetching, error } = useGetTracingLogs({
    limit: PAGE_SIZE,
    cursor,
    process_type: processType || undefined,
    status: status || undefined,
  });

  const logs: TraceLog[] = data?.data ?? [];

  const resetPagination = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const handleProcessTypeChange = (value: string) => {
    setProcessType(value);
    resetPagination();
  };

  const handleStatusChange = (value: string) => {
    setStatus(value);
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

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <Flex align="center" justify="space-between" mb={6}>
        <Box>
          <Text fontSize="xl" fontWeight="700" color="gray.800">
            Tracing Logs
          </Text>
          <Text fontSize="13px" color="gray.500" mt={0.5}>
            {logs.length} events on this page
          </Text>
        </Box>

        <HStack gap={3}>
          <Select
            size="sm"
            placeholder="All Process Types"
            value={processType}
            onChange={(e) => handleProcessTypeChange(e.target.value)}
            bg="white"
            w="180px"
          >
            {PROCESS_TYPES.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>

          <Select
            size="sm"
            placeholder="All Statuses"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            bg="white"
            w="160px"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </HStack>
      </Flex>

      <Divider mb={4} />

      {error && (
        <Text color="red.500" fontSize="13px" mb={4}>
          Failed to load logs: {error.message}
        </Text>
      )}

      {isInitialLoad ? (
        <Center py={16}>
          <Spinner size="lg" color="blue.500" />
        </Center>
      ) : logs.length === 0 ? (
        <Center py={16}>
          <Text color="gray.400" fontSize="14px">
            No trace logs found.
          </Text>
        </Center>
      ) : (
        <Box
          bg="white"
          border="1px solid"
          borderColor="gray.100"
          borderRadius="md"
          overflow="hidden"
        >
          <Box overflowX="auto">
            <Table size="sm" minW="900px">
              <Thead bg="gray.25">
                <Tr>
                  <Th w="20px" px={2} />
                  {COLUMNS.map((c) => (
                    <Th
                      key={c.label}
                      fontSize="10.5px"
                      whiteSpace="nowrap"
                      w={c.w}
                    >
                      {c.label}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log) => {
                  const colors = STATUS_COLORS[log.status] ?? {
                    bg: '#EEF2F6',
                    color: '#334155',
                  };
                  const hasRequest = !!log.request_data;
                  const hasResponse = !!log.response_data;
                  const hasPayload = hasRequest || hasResponse || !!log.message;
                  const isOpen = expandedId === log.id;

                  return (
                    <>
                      <Tr
                        key={log.id}
                        cursor={hasPayload ? 'pointer' : 'default'}
                        onClick={() =>
                          hasPayload && setExpandedId(isOpen ? null : log.id)
                        }
                        _hover={{ bg: 'gray.25' }}
                      >
                        <Td px={2} fontSize="12px" color="gray.400">
                          {hasPayload ? (isOpen ? '▾' : '▸') : ''}
                        </Td>
                        <Td
                          fontSize="12px"
                          color="gray.500"
                          whiteSpace="nowrap"
                        >
                          {formatTime(log.local_timestamp)}
                        </Td>
                        <Td
                          fontSize="12px"
                          fontFamily="mono"
                          whiteSpace="nowrap"
                        >
                          {log.leaf_id ?? log.edge_node_id ?? '—'}
                        </Td>
                        <Td
                          fontSize="12px"
                          color="gray.600"
                          whiteSpace="nowrap"
                        >
                          {log.event_scope ?? '—'}
                        </Td>
                        <Td
                          fontSize="12px"
                          color="gray.600"
                          whiteSpace="nowrap"
                          textTransform="capitalize"
                        >
                          {log.process_type.replace(/_/g, ' ')}
                        </Td>
                        <Td fontSize="12px" fontWeight="500">
                          {log.step}
                        </Td>
                        <Td whiteSpace="nowrap">
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
                          fontSize="12px"
                          color="gray.500"
                          whiteSpace="nowrap"
                          isNumeric
                        >
                          {log.duration_ms != null
                            ? `${log.duration_ms}ms`
                            : '—'}
                        </Td>
                        <Td
                          fontSize="12px"
                          color="gray.500"
                          whiteSpace="nowrap"
                          isNumeric
                        >
                          #{log.attempt_number}
                        </Td>
                      </Tr>

                      {isOpen && (
                        <Tr key={`${log.id}-detail`}>
                          <Td colSpan={9} bg="gray.25" px={6} py={3}>
                            {log.message && (
                              <Text fontSize="12px" color="gray.700" mb={2}>
                                {log.message}
                              </Text>
                            )}
                            <Flex gap={4} wrap="wrap">
                              {hasRequest && (
                                <Box flex="1" minW="260px">
                                  <Text
                                    fontSize="10px"
                                    fontWeight="700"
                                    color="gray.400"
                                    mb={1}
                                  >
                                    REQUEST
                                  </Text>
                                  <Box
                                    as="pre"
                                    fontSize="11px"
                                    bg="white"
                                    border="1px solid"
                                    borderColor="gray.100"
                                    borderRadius="md"
                                    p={2}
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
                                    color="gray.400"
                                    mb={1}
                                  >
                                    RESPONSE
                                  </Text>
                                  <Box
                                    as="pre"
                                    fontSize="11px"
                                    bg="white"
                                    border="1px solid"
                                    borderColor="gray.100"
                                    borderRadius="md"
                                    p={2}
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
                    </>
                  );
                })}
              </Tbody>
            </Table>
          </Box>

          <Flex
            justify="center"
            align="center"
            gap={3}
            py={4}
            borderTop="1px solid"
            borderColor="gray.100"
          >
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
        </Box>
      )}
    </Box>
  );
};
