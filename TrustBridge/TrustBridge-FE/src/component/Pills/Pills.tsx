import { Button, Wrap, Text } from '@chakra-ui/react';
import { useFormContext } from 'react-hook-form';

type PillOption = {
  id: number;
  label: string;
};

type SelectablePillsProps = {
  name: string;
  options: PillOption[];
  label?: string;
};

export const SelectablePills = ({
  name,
  options,
  label,
}: SelectablePillsProps) => {
  const { watch, setValue } = useFormContext();

  const selected: number[] = watch(name) || [];

  const toggle = (id: number) => {
    setValue(
      name,
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
      { shouldDirty: true },
    );
  };

  return (
    <>
      {label && (
        <Text variant="sm_medium" m={3}>
          {label}
        </Text>
      )}
      <Wrap spacing={2}>
        {options.map((option) => {
          const isSelected = selected.includes(option.id);

          return (
            <Button
              key={option.id}
              size="sm"
              borderRadius="full"
              onClick={() => toggle(option.id)}
              textTransform="capitalize"
              bg={isSelected ? 'blue.2100' : 'gray.25'}
              border="1px solid"
              borderColor={isSelected ? 'blue.1900' : 'gray.1700'}
              color="black"
              _hover={{
                bg: isSelected ? 'blue.2000' : 'gray.50',
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </Wrap>
    </>
  );
};
