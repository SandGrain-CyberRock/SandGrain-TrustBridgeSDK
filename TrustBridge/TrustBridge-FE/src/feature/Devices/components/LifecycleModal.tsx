import {
  Badge,
  Box,
  Button,
  Divider,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useState } from 'react';
import type { Device } from '../types/AllDeviceType';
import {
  useGetTidStatus,
  useGetLifecycleTenantUsers,
  useGetDeviceGroups,
  useUpdateLifecycle,
} from '../service/Devices';

// ─── Status option definitions ──────────────────────────────────────────────

type LifecycleStatus =
  | 'AssetOwnedAndActive'
  | 'AssetNonActive'
  | 'AssetStatusActive'
  | 'ReadyForHandover'
  | 'AssetEndOfLife';

interface StatusOption {
  value: LifecycleStatus;
  label: string;
  description: string;
  isActive: boolean;
  statusLabel?: string; // overrides the default Active/Inactive badge text
  accent: string;
  bg: string;
}

const ALL_OPTIONS: Record<LifecycleStatus, StatusOption> = {
  AssetOwnedAndActive: {
    value: 'AssetOwnedAndActive',
    label: 'Asset Owned & Active',
    description: 'Device remains owned and active.',
    isActive: true,
    accent: '#2E8B57',
    bg: '#E8F6ED',
  },
  AssetNonActive: {
    value: 'AssetNonActive',
    label: 'Asset Non-Active',
    description: 'Deactivate the device.',
    isActive: false,
    accent: '#B7500A',
    bg: '#FFF0E0',
  },
  AssetStatusActive: {
    value: 'AssetStatusActive',
    label: 'Asset Status Active',
    description: 'Re-activate the device — sets it back to active state.',
    isActive: true,
    accent: '#2E8B57',
    bg: '#E8F6ED',
  },
  ReadyForHandover: {
    value: 'ReadyForHandover',
    label: 'Ready For Hand Over',
    description:
      'Device is prepared to be transferred to another owner or user.',
    isActive: false,
    statusLabel: 'Idle',
    accent: '#1565C0',
    bg: '#E3F2FD',
  },
  AssetEndOfLife: {
    value: 'AssetEndOfLife',
    label: 'Asset End Of Life',
    description: 'Device is permanently decommissioned.',
    isActive: false,
    accent: '#C0392B',
    bg: '#FDEAEA',
  },
};

// Maps current TID status → the options the user can transition to
const OPTIONS_BY_STATUS: Partial<Record<LifecycleStatus, StatusOption[]>> = {
  AssetOwnedAndActive: [
    ALL_OPTIONS.AssetOwnedAndActive,
    ALL_OPTIONS.AssetNonActive,
  ],
  AssetStatusActive: [
    ALL_OPTIONS.AssetStatusActive,
    ALL_OPTIONS.AssetNonActive,
  ],
  AssetNonActive: [
    ALL_OPTIONS.AssetNonActive,
    ALL_OPTIONS.AssetStatusActive,
    ALL_OPTIONS.ReadyForHandover,
    ALL_OPTIONS.AssetEndOfLife,
  ],
};

// ─── StatusCard ──────────────────────────────────────────────────────────────

function StatusCard({
  option,
  selected,
  onSelect,
}: {
  option: StatusOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Box
      onClick={onSelect}
      cursor="pointer"
      border="2px solid"
      borderColor={selected ? option.accent : 'gray.200'}
      borderRadius="md"
      p={3}
      bg={selected ? option.bg : 'white'}
      transition="all 0.15s"
      _hover={{ borderColor: option.accent, bg: option.bg }}
    >
      <Flex align="center" gap={3}>
        <Box
          w="10px"
          h="10px"
          borderRadius="full"
          bg={selected ? option.accent : 'gray.300'}
          flexShrink={0}
          mt="1px"
        />
        <Box flex={1}>
          <Flex align="center" gap={2}>
            <Text
              fontSize="13px"
              fontWeight="700"
              color={selected ? option.accent : 'gray.700'}
            >
              {option.label}
            </Text>
            {selected && (
              <Badge
                px={1.5}
                py={0.5}
                borderRadius="sm"
                bg={option.accent}
                color="white"
                fontSize="9px"
                fontWeight="700"
              >
                Selected
              </Badge>
            )}
            <Badge
              px={1.5}
              py={0.5}
              borderRadius="sm"
              bg={
                option.isActive
                  ? '#E8F6ED'
                  : option.statusLabel === 'Idle'
                    ? '#E3F2FD'
                    : '#FDEAEA'
              }
              color={
                option.isActive
                  ? '#2E8B57'
                  : option.statusLabel === 'Idle'
                    ? '#1565C0'
                    : '#C0392B'
              }
              fontSize="9px"
              fontWeight="700"
            >
              {option.statusLabel ?? (option.isActive ? 'Active' : 'Inactive')}
            </Badge>
          </Flex>
          <Text fontSize="12px" color="gray.500" mt="2px" lineHeight="1.4">
            {option.description}
          </Text>
        </Box>
      </Flex>
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LifecycleModalProps {
  device: Device | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LifecycleModal = ({
  device,
  isOpen,
  onClose,
}: LifecycleModalProps) => {
  const deviceId = device?.device_id ?? null;

  const [selectedStatus, setSelectedStatus] = useState<LifecycleStatus | null>(
    null,
  );
  const [selectedTenantUserId, setSelectedTenantUserId] = useState('');
  const [selectedIotUserId, setSelectedIotUserId] = useState('');

  const { data: tidData, isLoading: tidLoading } = useGetTidStatus(
    isOpen ? deviceId : null,
  );
  const { data: tenantUsers, isLoading: tenantUsersLoading } =
    useGetLifecycleTenantUsers(isOpen ? deviceId : null);
  const { data: iotUsers, isLoading: iotUsersLoading } = useGetDeviceGroups();

  const { mutate: updateLifecycle, isPending: isUpdating } =
    useUpdateLifecycle();

  // Derive effective values: user selection takes priority, fall back to current TID data
  const effectiveIotUserId =
    selectedIotUserId || (tidData?.iotId ? String(tidData.iotId) : '');
  // tenantId CyberRock expects is the org/tenant ID (root tidData.tenantId), not the user ID
  const effectiveTenantId = tidData?.tenantId ? String(tidData.tenantId) : '';
  // Tenant user ID (for display default in the select) lives inside iot.iotToTenantUsers
  const defaultTenantUserId =
    tidData?.iot?.iotToTenantUsers?.[0]?.tenantUser?.id ?? '';
  const effectiveTenantUserId = selectedTenantUserId || defaultTenantUserId;

  const currentTidStatus = (tidData?.status as LifecycleStatus) ?? null;

  // Options depend purely on the current status from the backend
  const optionList =
    (currentTidStatus && OPTIONS_BY_STATUS[currentTidStatus]) ?? [];

  const handleSubmit = () => {
    if (!selectedStatus || !deviceId) return;

    updateLifecycle(
      {
        id: deviceId,
        status: selectedStatus,
        applyToAllDelegates: false,
        iotId: effectiveIotUserId || undefined,
        tenantId: effectiveTenantId || undefined,
      },
      { onSuccess: () => handleClose() },
    );
  };

  const handleClose = () => {
    setSelectedStatus(null);
    setSelectedTenantUserId('');
    setSelectedIotUserId('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="lg">
      <ModalOverlay bg="blackAlpha.400" />
      <ModalContent borderRadius="xl" mx={4}>
        <ModalHeader
          fontSize="15px"
          fontWeight="700"
          color="gray.800"
          borderBottom="1px solid"
          borderColor="gray.100"
          pb={3}
        >
          <Flex align="center" gap={2}>
            <Text>Device Lifecycle</Text>
            {device && (
              <Badge
                px={2}
                py={0.5}
                borderRadius="md"
                bg="gray.100"
                color="gray.600"
                fontSize="11px"
                fontWeight="600"
              >
                {device.device_name}
              </Badge>
            )}
          </Flex>
        </ModalHeader>
        <ModalCloseButton top={3} />

        <ModalBody py={5}>
          {tidLoading ? (
            <Flex justify="center" align="center" minH="120px">
              <Spinner color="#c9922a" />
            </Flex>
          ) : (
            <VStack spacing={4} align="stretch">
              {/* Current status indicator */}
              {currentTidStatus && (
                <Flex
                  align="center"
                  gap={2}
                  bg="gray.50"
                  borderRadius="md"
                  px={3}
                  py={2}
                  border="1px solid"
                  borderColor="gray.200"
                >
                  <Text fontSize="11px" color="gray.500" fontWeight="600">
                    CURRENT STATUS
                  </Text>
                  <Badge
                    px={2}
                    py={0.5}
                    borderRadius="md"
                    bg={
                      currentTidStatus === 'AssetOwnedAndActive'
                        ? '#E8F6ED'
                        : '#FFF0E0'
                    }
                    color={
                      currentTidStatus === 'AssetOwnedAndActive'
                        ? '#2E8B57'
                        : '#B7500A'
                    }
                    fontSize="11px"
                    fontWeight="700"
                  >
                    {currentTidStatus}
                  </Badge>
                </Flex>
              )}

              {/* Status options */}
              <Box>
                <Text
                  fontSize="11px"
                  fontWeight="700"
                  color="gray.500"
                  textTransform="uppercase"
                  letterSpacing="0.5px"
                  mb={2}
                >
                  Select Action
                </Text>
                <VStack spacing={2} align="stretch">
                  {optionList.map((opt) => (
                    <StatusCard
                      key={opt.value}
                      option={opt}
                      selected={selectedStatus === opt.value}
                      onSelect={() => setSelectedStatus(opt.value)}
                    />
                  ))}
                </VStack>
              </Box>

              <Divider />

              {/* Transfer options */}
              <Box>
                <Text
                  fontSize="11px"
                  fontWeight="700"
                  color="gray.500"
                  textTransform="uppercase"
                  letterSpacing="0.5px"
                  mb={3}
                >
                  Transfer Options (optional)
                </Text>

                <VStack spacing={3} align="stretch">
                  {/* Tenant user transfer */}
                  <Box>
                    <Text
                      fontSize="12px"
                      fontWeight="600"
                      color="gray.700"
                      mb={1}
                    >
                      Transfer to Tenant User
                    </Text>
                    {tenantUsersLoading ? (
                      <Flex align="center" gap={2}>
                        <Spinner size="xs" />
                        <Text fontSize="12px" color="gray.400">
                          Loading users…
                        </Text>
                      </Flex>
                    ) : (
                      <Select
                        size="sm"
                        fontSize="13px"
                        borderRadius="md"
                        bg="gray.25"
                        borderColor="gray.200"
                        _focus={{ borderColor: '#c9922a' }}
                        placeholder="Select Tenant User"
                        value={effectiveTenantUserId}
                        onChange={(e) => {
                          setSelectedTenantUserId(e.target.value);
                        }}
                      >
                        {(tenantUsers ?? [])?.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName && u.lastName
                              ? `${u.firstName} ${u.lastName}`
                              : (u.email ?? u.id)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Box>

                  {/* Device group transfer */}
                  <Box>
                    <Text
                      fontSize="12px"
                      fontWeight="600"
                      color="gray.700"
                      mb={1}
                    >
                      Transfer to Device Group
                    </Text>
                    {iotUsersLoading ? (
                      <Flex align="center" gap={2}>
                        <Spinner size="xs" />
                        <Text fontSize="12px" color="gray.400">
                          Loading groups…
                        </Text>
                      </Flex>
                    ) : (
                      <Select
                        size="sm"
                        fontSize="13px"
                        borderRadius="md"
                        bg="gray.25"
                        borderColor="gray.200"
                        _focus={{ borderColor: '#c9922a' }}
                        placeholder="Select Device Group"
                        value={effectiveIotUserId}
                        onChange={(e) => setSelectedIotUserId(e.target.value)}
                      >
                        {(iotUsers ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.username ?? u.id}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Box>
                </VStack>
              </Box>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter
          borderTop="1px solid"
          borderColor="gray.100"
          gap={2}
          pt={3}
        >
          <Button
            variant="ghost"
            size="sm"
            fontSize="13px"
            onClick={handleClose}
            isDisabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            fontSize="13px"
            bg="orange.2500"
            color="white"
            _hover={{ bg: '#b07d20' }}
            isLoading={isUpdating}
            loadingText="Updating…"
            isDisabled={!selectedStatus || tidLoading}
            onClick={handleSubmit}
          >
            Apply Lifecycle Change
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
