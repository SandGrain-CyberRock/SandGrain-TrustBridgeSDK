import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Grid,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

import { ViewModal } from '../../../component/Modal/ViewModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetDeviceById,
  useGetDeviceLogs,
  useCheckDeviceConnectivity,
  invalidateDeviceQueries,
} from '../service/Devices';
import type { DeviceLog } from '../service/Devices';

// ─── TrustBridge step labels ───────────────────────────────────────────────
const STEP_LABELS: Record<string, string> = {
  init: 'Initialisation',
  run_auth_init: 'Authentication Triggered',
  profile_check: 'Profile Check',
  device_group: 'Device Group',
  request_cw: 'Request Challenge Word',
  compute_rw: 'Chip: Compute RW',
  request_rw: 'Request Response Word',
  reply_rw: 'Submit Response Word',
  auth_result: 'Auth Result',
  claim_token: 'Claim Token',
  compute_fw_verification: 'Chip: FW Verification',
  fw_verification_cloud: 'Cloud: Record FW Verification',
  compute_installation: 'Chip: Installation CW/RW',
  installation_cloud: 'Cloud: Installation Auth',
};

// ─── Gateway step labels ───────────────────────────────────────────────────
const GW_STEP_LABELS: Record<string, string> = {
  'gw:1/6': 'Auth Request Received',
  'gw:2/6': 'Challenge Word Generated',
  'gw:3/6': 'CW Sent to Device',
  'gw:4/6': 'CW Echo + RW Received',
  'gw:5/6': 'RW Sent to Cloud',
  'gw:6/6': 'RW Verified',
  'gw:retry': 'Retrying',
  'gw:failed': 'All Retries Exhausted',
  'gw:cw_fail': 'CW Echo Mismatch',
  'gw:err_mgt': 'Error Management',
  'gw:gw:failed': 'Server Rejected RW',
};

// ─── Process metadata ─────────────────────────────────────────────────────────
const PROCESS_META: Record<
  string,
  { label: string; color: string; bg: string; dot: string }
> = {
  authentication: {
    label: 'Authentication',
    color: '#1565C0',
    bg: '#E3F2FD',
    dot: '#00AEEF',
  },
  fw_verification: {
    label: 'FW Verification',
    color: '#6A0DAD',
    bg: '#F3E8FF',
    dot: '#9B59B6',
  },
  installation: {
    label: 'Installation',
    color: '#B7500A',
    bg: '#FFF0E0',
    dot: '#E67E22',
  },
};

// ─── Status styles ─────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<
  string,
  { bg: string; color: string; label: string; dot: string }
> = {
  success: {
    bg: '#E8F6ED',
    color: '#2E8B57',
    label: 'Success',
    dot: '#45B46D',
  },
  failed: { bg: '#FDEAEA', color: '#C0392B', label: 'Failed', dot: '#EF4343' },
  in_progress: {
    bg: '#FFF3CD',
    color: '#856404',
    label: 'In Progress',
    dot: '#DCBB57',
  },
  info: { bg: '#E3F2FD', color: '#1565C0', label: 'Info', dot: '#00AEEF' },
  pending: { bg: '#F5F5F5', color: '#666', label: 'Pending', dot: '#AAAAAA' },
};

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getGroupOverallStatus(logs: DeviceLog[]): string {
  const terminalSteps = [
    'auth_result',
    'claim_token',
    'fw_verification_cloud',
    'installation_cloud',
  ];
  // Check success FIRST — intermediate gw:err_mgt logs keep status='in_progress'
  // forever (append-only DB). If auth already succeeded we must not let those
  // stale in_progress entries override the final result.
  const isSuccess =
    logs.some(
      (l) => l.status === 'success' && terminalSteps.includes(l.step),
    ) ||
    logs.some(
      (l) =>
        l.status === 'success' &&
        (l.step === 'run_auth_init' ||
          l.step === 'gw:6/6' ||
          l.step === 'gw:err_mgt'),
    );
  if (isSuccess) return 'success';
  if (logs.some((l) => l.status === 'failed')) return 'failed';
  if (logs.some((l) => l.status === 'in_progress')) return 'in_progress';
  return 'info';
}

function isGwStep(step: string): boolean {
  return step.startsWith('gw:');
}

// ─── LogStep (TrustBridge steps) ──────────────────────────────────────────────
function LogStep({ log, isLast }: { log: DeviceLog; isLast: boolean }) {
  const style = STATUS_STYLE[log.status] ?? STATUS_STYLE.pending;
  const label = STEP_LABELS[log.step] ?? log.step;

  return (
    <Flex gap={3} align="flex-start">
      <Flex direction="column" align="center" pt="2px" flexShrink={0}>
        <Box
          w="10px"
          h="10px"
          borderRadius="full"
          bg={style.dot}
          flexShrink={0}
          mt="4px"
        />
        {!isLast && <Box w="2px" bg="gray.200" flex="1" minH="28px" mt="2px" />}
      </Flex>

      <Box flex="1" pb={isLast ? 2 : 5}>
        <Flex align="center" justify="space-between" gap={2} mb="2px">
          <Text fontSize="13px" fontWeight="600" color="gray.700">
            {label}
          </Text>
          <Text fontSize="11px" color="gray.400" flexShrink={0}>
            {formatTime(log.created_at)}
          </Text>
        </Flex>

        <Flex align="center" gap={2} mb="4px">
          <Badge
            px={1.5}
            py={0.5}
            borderRadius="sm"
            bg={style.bg}
            color={style.color}
            fontSize="10px"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="0.5px"
          >
            {style.label}
          </Badge>
          {log.duration_ms != null && (
            <Text fontSize="11px" color="gray.400">
              {log.duration_ms < 1000
                ? `${log.duration_ms}ms`
                : `${(log.duration_ms / 1000).toFixed(1)}s`}
            </Text>
          )}
        </Flex>

        <Text fontSize="12px" color="gray.500" lineHeight="1.5">
          {log.message}
        </Text>
      </Box>
    </Flex>
  );
}

// ─── GwLogStep (compact gateway step) ────────────────────────────────────────
function GwLogStep({ log, isLast }: { log: DeviceLog; isLast: boolean }) {
  const style = STATUS_STYLE[log.status] ?? STATUS_STYLE.pending;
  const label = GW_STEP_LABELS[log.step] ?? log.step.replace('gw:', '');

  return (
    <Flex gap={2} align="flex-start">
      <Flex direction="column" align="center" pt="2px" flexShrink={0}>
        <Box
          w="7px"
          h="7px"
          borderRadius="full"
          bg={style.dot}
          flexShrink={0}
          mt="3px"
        />
        {!isLast && <Box w="1px" bg="gray.200" flex="1" minH="20px" mt="2px" />}
      </Flex>
      <Box flex="1" pb={isLast ? 1 : 3}>
        <Flex align="center" justify="space-between" gap={2} mb="1px">
          <Text fontSize="12px" fontWeight="600" color="gray.700">
            {label}
          </Text>
          <Text fontSize="10px" color="gray.400" flexShrink={0}>
            {formatTime(log.created_at)}
          </Text>
        </Flex>
        <Badge
          px={1.5}
          py={0.5}
          borderRadius="sm"
          bg={style.bg}
          color={style.color}
          fontSize="9px"
          fontWeight="700"
          textTransform="uppercase"
          letterSpacing="0.5px"
        >
          {style.label}
        </Badge>
        {log.message && (
          <Text fontSize="11px" color="gray.500" lineHeight="1.4" mt="2px">
            {log.message}
          </Text>
        )}
      </Box>
    </Flex>
  );
}

// ─── RunBlock (one accordion per user trigger) ────────────────────────────────
function RunBlock({
  runNumber,
  processType,
  logs,
}: {
  runNumber: number;
  processType: string;
  logs: DeviceLog[];
}) {
  const overallStatus = getGroupOverallStatus(logs);
  const style = STATUS_STYLE[overallStatus] ?? STATUS_STYLE.pending;
  const firstLog = logs[0];
  const processMeta = PROCESS_META[processType] ?? {
    label: processType,
    color: '#333',
    bg: '#F5F5F5',
    dot: '#AAA',
  };

  const initLog = logs.find(
    (l) => l.step === 'init' || l.step === 'run_auth_init',
  );
  const modeMatch = initLog?.message.match(/[—-]\s+(.+)$/);
  const modeName = modeMatch?.[1];

  const sortedLogs = [...logs].sort((a, b) => a.log_id - b.log_id);
  const tbLogs = sortedLogs.filter((l) => !isGwStep(l.step));
  const gwLogs = sortedLogs.filter((l) => isGwStep(l.step));

  return (
    <AccordionItem
      border="1px solid"
      borderColor="gray.200"
      borderRadius="md"
      mb={2}
      overflow="hidden"
    >
      <AccordionButton bg="gray.50" _hover={{ bg: 'gray.100' }} px={4} py={3}>
        <Flex flex="1" align="center" gap={2} flexWrap="wrap">
          <Box
            w="9px"
            h="9px"
            borderRadius="full"
            bg={style.dot}
            flexShrink={0}
          />
          <Text fontSize="13px" fontWeight="700" color="gray.800">
            Attempt {runNumber}
          </Text>
          <Badge
            px={1.5}
            py={0.5}
            borderRadius="sm"
            bg={style.bg}
            color={style.color}
            fontSize="10px"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="0.5px"
            flexShrink={0}
          >
            {style.label}
          </Badge>
          <Badge
            px={1.5}
            py={0.5}
            borderRadius="sm"
            bg={processMeta.bg}
            color={processMeta.color}
            fontSize="10px"
            fontWeight="600"
            textTransform="none"
            flexShrink={0}
          >
            {processMeta.label}
          </Badge>
          {modeName && (
            <Badge
              px={1.5}
              py={0.5}
              borderRadius="sm"
              bg="gray.100"
              color="gray.600"
              fontSize="10px"
              fontWeight="600"
              textTransform="none"
              flexShrink={0}
            >
              {modeName}
            </Badge>
          )}
          {firstLog && (
            <Text fontSize="11px" color="gray.400">
              {formatDate(firstLog.created_at)}
            </Text>
          )}
          {overallStatus === 'in_progress' && (
            <Spinner size="xs" color="orange.400" />
          )}
        </Flex>
        <AccordionIcon />
      </AccordionButton>

      <AccordionPanel px={4} py={4} bg="white">
        {/* ── TrustBridge Flow ──────────────────────────────── */}
        {tbLogs.length > 0 && (
          <Box mb={gwLogs.length > 0 ? 5 : 0}>
            <Flex align="center" gap={2} mb={3}>
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="#00AEEF"
                flexShrink={0}
              />
              <Text
                fontSize="11px"
                fontWeight="700"
                color="#1565C0"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                TrustBridge Flow
              </Text>
            </Flex>
            <Box pl={3} borderLeft="2px solid" borderColor="#BBDEFB">
              {tbLogs.map((log, idx) => (
                <LogStep
                  key={log.log_id}
                  log={log}
                  isLast={idx === tbLogs.length - 1}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── Gateway Flow ──────────────────────────────────── */}
        {gwLogs.length > 0 && (
          <Box>
            <Flex align="center" gap={2} mb={3}>
              <Box
                w="8px"
                h="8px"
                borderRadius="full"
                bg="#E67E22"
                flexShrink={0}
              />
              <Text
                fontSize="11px"
                fontWeight="700"
                color="#B7500A"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Gateway Flow
              </Text>
            </Flex>
            <Box pl={3} borderLeft="2px solid" borderColor="#FFE0B2">
              {gwLogs.map((log, idx) => (
                <GwLogStep
                  key={log.log_id}
                  log={log}
                  isLast={idx === gwLogs.length - 1}
                />
              ))}
            </Box>
          </Box>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const ViewDeviceForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();

  const deviceIdParam = searchParams.get('id');
  const deviceId = deviceIdParam ? Number(deviceIdParam) : null;

  const { data: deviceDetails, isLoading } = useGetDeviceById(deviceId);

  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 10;

  const { data: logsResult, isLoading: logsLoading } = useGetDeviceLogs(
    deviceId,
    logPage,
    LOGS_PER_PAGE,
  );
  const { data: connectivity, isLoading: connectivityLoading } =
    useCheckDeviceConnectivity(deviceId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogPage(1);
  }, [deviceId]);

  const rawLogs = logsResult?.data ?? [];
  const totalPages = logsResult?.meta.totalPages ?? 1;

  // Sort this page's logs ascending so every downstream operation sees correct order.
  const logList: DeviceLog[] = [...rawLogs].sort((a, b) => a.log_id - b.log_id);

  // Group logs by (process_type, attempt_number) — each combo = one user-triggered run.
  // Preserve order by first log's log_id so runs appear chronologically.
  const runMap = new Map<
    string,
    {
      processType: string;
      attemptNumber: number;
      displayNumber: number;
      logs: DeviceLog[];
    }
  >();
  for (const log of logList) {
    const processType = log.process_type ?? 'authentication';
    const attemptNumber = log.attempt_number ?? 1;
    const displayNumber = log.display_number ?? attemptNumber;
    const key = `${processType}::${attemptNumber}`;
    if (!runMap.has(key)) {
      runMap.set(key, { processType, attemptNumber, displayNumber, logs: [] });
    }
    runMap.get(key)!.logs.push(log);
  }
  // short desc;
  const sortedRuns = Array.from(runMap.values()).sort(
    (a, b) => (b.logs[0]?.log_id ?? 0) - (a.logs[0]?.log_id ?? 0),
  );
  // A run is truly in-progress only when its overall status is 'in_progress'.
  // Using getGroupOverallStatus (which checks success first) prevents stale
  // gw:err_mgt(in_progress) logs from keeping the spinner alive after auth completes.
  const hasInProgress = sortedRuns.some(
    (r) => getGroupOverallStatus(r.logs) === 'in_progress',
  );

  // When an in-progress auth run completes (OK or NOK), refresh device list and
  // dashboard stats so counts update without a manual page reload.
  const queryClient = useQueryClient();
  const prevInProgress = useRef(false);
  useEffect(() => {
    if (prevInProgress.current && !hasInProgress) {
      invalidateDeviceQueries(queryClient);
    }
    prevInProgress.current = hasInProgress;
  }, [hasInProgress, queryClient]);

  return (
    <ViewModal
      isOpen={shouldOpen('viewDeviceDetails')}
      onClose={modalClose}
      title="View Details"
      showSubmitButton={false}
      childBodyPaddingX={4}
      childBodyPaddingY={4}
    >
      {isLoading && (
        <Flex align="center" justify="center" minH="200px">
          <Spinner />
        </Flex>
      )}

      {deviceDetails && (
        <>
          {/* Device Details */}
          <Text variant="ssm_medium" mb={4} color="primary.1700">
            Device Details
          </Text>

          <Grid
            templateColumns="repeat(3, 1fr)"
            columnGap={6}
            rowGap={5}
            mb={2}
          >
            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Batch N.O.
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.batch_no || '—'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Device Serial
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.device_serial || '—'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Device Name
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.device_name}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Device Type
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.device_type}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Device Group
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.deviceGroup?.group_name ?? '—'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Profile
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                wordBreak="break-all"
              >
                {deviceDetails.deviceProfile?.profile_name || 'Not assigned'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Approved
              </Text>
              <Badge
                mt={1}
                px={2}
                py={0.5}
                borderRadius="sm"
                bg={deviceDetails.is_approved ? '#E8F6ED' : '#F5F5F5'}
                color={deviceDetails.is_approved ? '#2E8B57' : '#666'}
                fontSize="11px"
                fontWeight="700"
                textTransform="uppercase"
              >
                {deviceDetails.is_approved ? 'Yes' : 'No'}
              </Badge>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Status
              </Text>
              <Text
                fontSize="13px"
                color="gray.800"
                fontWeight="500"
                mt={1}
                textTransform="capitalize"
              >
                {deviceDetails.status?.replace(/_/g, ' ')}
              </Text>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Failed Auth Attempts
              </Text>
              <Flex align="center" gap={2} mt={1}>
                <Text
                  fontSize="13px"
                  fontWeight="500"
                  color={
                    (deviceDetails.failed_auth_attempts ?? 0) > 0
                      ? '#C0392B'
                      : 'gray.800'
                  }
                >
                  {deviceDetails.failed_auth_attempts ?? 0}
                </Text>
                {sortedRuns.length > 0 && (
                  <Badge
                    px={1.5}
                    py={0.5}
                    borderRadius="sm"
                    bg="#FDEAEA"
                    color="#C0392B"
                    fontSize="10px"
                    fontWeight="700"
                    textTransform="uppercase"
                  >
                    {sortedRuns.length} run{sortedRuns.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </Flex>
            </VStack>

            <VStack alignItems="flex-start" spacing={0}>
              <Text
                fontSize="12px"
                color="gray.500"
                fontWeight="600"
                textTransform="uppercase"
                letterSpacing="0.5px"
              >
                Connectivity
              </Text>
              <Flex alignItems="center" gap={2} mt={1}>
                {connectivityLoading ? (
                  <Spinner size="xs" />
                ) : (
                  <>
                    <Box
                      w="8px"
                      h="8px"
                      borderRadius="full"
                      bg={connectivity?.is_online ? '#45B46D' : '#7C7F83'}
                    />
                    <Text
                      fontSize="13px"
                      color={connectivity?.is_online ? '#45B46D' : '#7C7F83'}
                      fontWeight="500"
                    >
                      {connectivity?.is_online ? 'Online' : 'Offline'}
                    </Text>
                    {connectivity?.last_seen_at && (
                      <Text
                        fontSize="11px"
                        color="gray.400"
                        whiteSpace="nowrap"
                      >
                        (Last seen:{' '}
                        {new Date(connectivity.last_seen_at).toLocaleString()})
                      </Text>
                    )}
                  </>
                )}
              </Flex>
            </VStack>
          </Grid>

          <VStack alignItems="flex-start" spacing={0}>
            <Text
              fontSize="11px"
              color="gray.500"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.5px"
            >
              Token ID
            </Text>
            <Text
              fontSize="13px"
              color="gray.800"
              fontWeight="500"
              mt={1}
              wordBreak="break-all"
            >
              {deviceDetails.token_id}
            </Text>
          </VStack>

          <Divider my={5} />

          {/* Activity Timeline */}
          <Flex align="center" justify="space-between" mb={4}>
            <Text variant="ssm_medium" color="primary.1700">
              Activity Board
            </Text>
            {hasInProgress && (
              <Flex align="center" gap={2}>
                <Spinner size="xs" color="orange.400" />
                <Text fontSize="12px" color="orange.500" fontWeight="500">
                  Process in progress…
                </Text>
              </Flex>
            )}
          </Flex>

          {logsLoading && logList.length === 0 && (
            <Flex justify="center" py={6}>
              <Spinner size="sm" color="gray.400" />
            </Flex>
          )}

          {!logsLoading && logList.length === 0 && (
            <Box bg="gray.50" borderRadius="md" py={6} textAlign="center">
              <Text fontSize="13px" color="gray.400">
                No activity logs yet.
              </Text>
            </Box>
          )}

          {sortedRuns.length > 0 && (
            <Accordion allowMultiple key={sortedRuns.length} defaultIndex={[0]}>
              {sortedRuns.map((run, idx) => (
                <RunBlock
                  key={`${run.processType}::${run.attemptNumber}`}
                  runNumber={run.displayNumber ?? sortedRuns.length - idx}
                  processType={run.processType}
                  logs={run.logs}
                />
              ))}
            </Accordion>
          )}
        </>
      )}
      {totalPages > 1 && (
        <Flex justify="center" align="center" gap={3} mt={4}>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={logPage <= 1}
            onClick={() => setLogPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Text fontSize="12px" color="gray.500">
            Page {logPage} of {totalPages}
          </Text>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={logPage >= totalPages}
            onClick={() => setLogPage((p) => p + 1)}
          >
            Next
          </Button>
        </Flex>
      )}
    </ViewModal>
  );
};
