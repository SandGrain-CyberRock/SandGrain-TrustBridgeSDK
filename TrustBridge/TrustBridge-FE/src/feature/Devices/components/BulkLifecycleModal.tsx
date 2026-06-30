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
  Spinner,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useBulkLifecycleAuth } from '../service/Devices';

interface BulkLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  claimedCount: number;
}

/**
 * BulkLifecycleModal
 *
 * Confirms and triggers bulk lifecycle authentication (Option 2 — Fault Injection)
 * for all claimed devices. The auth runs in the background via MQTT; results
 * (active / inactive) will appear in each device's Activity Timeline.
 */
export const BulkLifecycleModal = ({
  isOpen,
  onClose,
  claimedCount,
}: BulkLifecycleModalProps) => {
  const { mutate: triggerBulkAuth, isPending, data } = useBulkLifecycleAuth();

  const queued = data?.data?.data?.queued ?? 0;
  const hasResult = !!data;

  const handleConfirm = () => {
    triggerBulkAuth(
      {},
      {
        onSuccess: () => {
          // keep modal open to show result summary
        },
      },
    );
  };

  const handleClose = () => {
    onClose();
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
          Move to Lifecycle
        </ModalHeader>
        <ModalCloseButton top={3} />

        <ModalBody py={5}>
          {!hasResult ? (
            <VStack spacing={4} align="stretch">
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
                    bg="#EDAE49"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    <Text fontSize="18px">⚡</Text>
                  </Box>
                  <Box>
                    <Text fontSize="13px" fontWeight="700" color="gray.800">
                      Fault Injection Authentication
                    </Text>
                    <Text fontSize="12px" color="gray.500" mt="2px">
                      {claimedCount} claimed device
                      {claimedCount !== 1 ? 's' : ''} will be authenticated
                    </Text>
                  </Box>
                </Flex>
              </Box>

              <VStack spacing={2} align="stretch">
                {[
                  'Authentication runs in the background via MQTT',
                  'auth_ok → device becomes Active (is_active = true)',
                  'auth_fail → device becomes Inactive (is_active = false)',
                  "Logs visible in each device's Activity Timeline",
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

              <Box
                bg="gray.50"
                borderRadius="md"
                p={3}
                border="1px solid"
                borderColor="gray.200"
              >
                <Text fontSize="12px" color="gray.500">
                  This process may take several minutes depending on device
                  connectivity. You can safely close this dialog — auth
                  continues in the background.
                </Text>
              </Box>
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
                leftIcon={isPending ? <Spinner size="xs" /> : undefined}
                onClick={handleConfirm}
                isDisabled={claimedCount === 0}
              >
                Start Lifecycle Auth
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              fontSize="13px"
              bg="orange.2500"
              color="white"
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
