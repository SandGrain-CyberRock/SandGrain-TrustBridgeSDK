import { HStack, Switch } from '@chakra-ui/react';

type StatusValue = 'ACTIVE' | 'INACTIVE';

type StatusToggleProps = {
  id: string;
  currentStatus: StatusValue;
  onToggle: (params: { id: string; nextStatus: StatusValue }) => void;
  isLoading?: boolean;
  activeColor?: string;
};

export const StatusToggle = ({
  id,
  currentStatus,
  onToggle,
  isLoading = false,
  activeColor = '#00AEEF',
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
        isDisabled={isLoading}
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
