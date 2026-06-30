import { useState } from 'react';
import { useMoveDevice } from '../service/Devices';
import type { ErrorResponse } from '../../../lib/types';
import { useNotification } from '../../../hooks/useNotification';

export const useMoveDevices = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [deviceIdsToMove, setDeviceIdsToMove] = useState<number[]>([]);
  const moveDevice = useMoveDevice();

  const openModalWithDevices = (deviceIds: number[]) => {
    setDeviceIdsToMove(deviceIds);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setDeviceIdsToMove([]);
  };

  const { errorNotification } = useNotification();
  const executeMove = async () => {
    try {
      await moveDevice.mutateAsync({ device_ids: deviceIdsToMove });
      closeModal();
    } catch (error: unknown) {
      const err = error as ErrorResponse;
      errorNotification(
        err?.response?.data?.message ?? 'Failed to move devices',
      );
      closeModal();
    }
  };

  return {
    openModalWithDevices,
    executeMove,
    closeModal,
    isOpen,
    deviceCount: deviceIdsToMove.length,
    isLoading: moveDevice.isPending,
  };
};
