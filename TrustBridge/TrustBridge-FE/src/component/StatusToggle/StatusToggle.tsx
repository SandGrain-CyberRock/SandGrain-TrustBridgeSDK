import { HStack, Switch } from '@chakra-ui/react';

type StatusValue = 'ACTIVE' | 'INACTIVE';

type StatusToggleProps = {
  id: string;
  currentStatus: StatusValue;
  onToggle: (params: { id: string; nextStatus: StatusValue }) => void;
  isLoading?: boolean;
  activeColor?: string;
  isDisabled?: boolean;
};

export const StatusToggle = ({
  id,
  currentStatus,
  onToggle,
  isLoading = false,
  activeColor = '#00AEEF',
  isDisabled = false,
}: StatusToggleProps) => {
  const isActive = currentStatus === 'ACTIVE';
  const nextStatus: StatusValue = isActive ? 'INACTIVE' : 'ACTIVE';

  return (
    <HStack spacing={3}>
      <Switch
        aria-label="Toggle Switch"
        size="md"
        sx={{
          '.chakra-switch__track[data-checked]': {
            backgroundColor: activeColor,
          },
        }}
        isChecked={isActive}
        isDisabled={isDisabled || isLoading}
        onChange={() =>
          onToggle({
            id,
            nextStatus,
          })
        }
      />
    </HStack>
  );
};
