import { Button, Flex, Text, Image } from '@chakra-ui/react';
import { useRef } from 'react';
import { ViewModal } from './ViewModal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isLoading?: boolean;
  colorScheme?: string;
  icon?: string;
}

export const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  colorScheme = 'red',
  icon,
}: ConfirmDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <ViewModal childBodyPaddingX={3} title="" isOpen={isOpen} onClose={onClose}>
      <Flex direction="column" align="center" gap={'8px'} py="16px">
        {icon && <Image src={icon} alt="Status Image" mb="16px" />}
        <Text variant="lgg_medium" color={'primary.1900'}>
          {title}
        </Text>
        <Text variant="ssm_normal" color="gray.1600" textAlign="center">
          {message}
        </Text>

        <Flex gap="12px" mt="20px">
          <Button
            ref={cancelRef}
            onClick={onClose}
            disabled={isLoading}
            height="40px"
            variant="cancel"
            px={'34px'}
          >
            {cancelText}
          </Button>
          <Button
            colorScheme={colorScheme}
            onClick={handleConfirm}
            isLoading={isLoading}
            height="40px"
            px={'24px'}
          >
            {confirmText}
          </Button>
        </Flex>
      </Flex>
    </ViewModal>
  );
};
