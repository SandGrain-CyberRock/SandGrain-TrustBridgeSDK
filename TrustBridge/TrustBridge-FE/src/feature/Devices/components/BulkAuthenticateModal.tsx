import {
  Badge,
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useBulkAuthenticate } from '../service/Devices';

interface BulkAuthenticateModalProps {
  isOpen: boolean;
  onClose: () => void;
  idleCount: number;
  /** Filters currently active on the main screen — passed straight to the API */
  filters: {
    statuses?: string[];
    device_group_id?: number;
    profile_id?: number;
  };
}

/**
 * BulkAuthenticateModal
 *
 * Confirms and triggers bulk re-authentication for idle/rejected devices using
 * whatever filters are already active on the New Devices toolbar. Auth runs in
 * the background; results appear in each device's Activity Timeline.
 */
export const BulkAuthenticateModal = ({
  isOpen,
  onClose,
  idleCount,
  filters,
}: BulkAuthenticateModalProps) => {
  const { mutate: triggerBulkAuth, isPending, data } = useBulkAuthenticate();

  const queued = data?.data?.data?.queued ?? 0;
  const skipped = data?.data?.data?.skipped ?? 0;
  const hasResult = !!data;

  const handleConfirm = () => {
    triggerBulkAuth(filters);
  };

  const handleClose = () => {
    if (!isPending) onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
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
          Bulk Authenticate Devices
        </ModalHeader>
        <ModalCloseButton top={3} isDisabled={isPending} />

        <ModalBody py={5}>
          {!hasResult ? (
            <VStack spacing={4} align="stretch">
              {/* Info banner */}
              <Box
                bg="#FFF8EC"
                border="1px solid"
                borderColor="#EDAE49"
                borderRadius="lg"
                p={4}
              >
                <Flex align="center" gap={3}>
                  <Box
                    w="36px"
                    h="36px"
                    borderRadius="full"
                    bg="#c9922a"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    <Text fontSize="18px">🔐</Text>
                  </Box>
                  <Box>
                    <Text fontSize="13px" fontWeight="700" color="gray.800">
                      Background Authentication
                    </Text>
                    <Text fontSize="12px" color="gray.500" mt="2px">
                      {idleCount} device{idleCount !== 1 ? 's' : ''} matching
                      the current filter will be authenticated
                    </Text>
                  </Box>
                </Flex>
              </Box>

              {/* Notes */}
              <VStack spacing={2} align="stretch">
                {[
                  'Authentication runs in the background via MQTT / cloud',
                  'Device status resets to idle, then progresses to claimed or rejected',
                  "Logs visible in each device's Activity Timeline",
                  'You can safely close this dialog once queued',
                ].map((point, i) => (
                  <Flex key={i} align="flex-start" gap={2}>
                    <Box
                      w="5px"
                      h="5px"
                      borderRadius="full"
                      bg="#c9922a"
                      mt="6px"
                      flexShrink={0}
                    />
                    <Text fontSize="12.5px" color="gray.600">
                      {point}
                    </Text>
                  </Flex>
                ))}
              </VStack>
            </VStack>
          ) : (
            <VStack spacing={4} align="stretch">
              <Flex
                align="center"
                gap={3}
                bg="#E8F6ED"
                border="1px solid"
                borderColor="#A7F3D0"
                borderRadius="lg"
                p={4}
              >
                <Box
                  w="36px"
                  h="36px"
                  borderRadius="full"
                  bg="#45B46D"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Text fontSize="18px" color="white" fontWeight="700">
                    ✓
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="13px" fontWeight="700" color="#2E8B57">
                    Authentication Queued
                  </Text>
                  <Text fontSize="12px" color="gray.600" mt="2px">
                    {queued} device{queued !== 1 ? 's' : ''} are now
                    authenticating in the background
                    {skipped > 0 && `, ${skipped} skipped`}
                  </Text>
                </Box>
              </Flex>

              <Flex justify="center">
                <Badge
                  px={3}
                  py={1}
                  borderRadius="full"
                  bg="#FFF3CD"
                  color="#856404"
                  fontSize="12px"
                  fontWeight="600"
                >
                  Check each device's Activity Timeline for real-time progress
                </Badge>
              </Flex>
            </VStack>
          )}
        </ModalBody>

        <ModalFooter
          borderTop="1px solid"
          borderColor="gray.100"
          gap={2}
          pt={3}
        >
          {!hasResult ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                fontSize="13px"
                onClick={handleClose}
                isDisabled={isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                fontSize="13px"
                bg="orange.2500"
                color="white"
                isLoading={isPending}
                loadingText="Queuing…"
                onClick={handleConfirm}
                isDisabled={idleCount === 0}
              >
                Start Bulk Auth
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              fontSize="13px"
              bg="orange.2500"
              color="white"
              _hover={{ bg: '#b07d20' }}
              onClick={handleClose}
            >
              Done
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
