import { useState } from 'react';
import {
  Button,
  Divider,
  HStack,
  Input,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';

import { DATE_PRESETS } from '../constant';

const formatShort = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

interface DateRangeFilterProps {
  fromDate: string;
  toDate: string;
  onChange: (fromDate: string, toDate: string) => void;
}

export const DateRangeFilter = ({
  fromDate,
  toDate,
  onChange,
}: DateRangeFilterProps) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);

  // Seed the draft from committed values right when the popover opens,
  // as part of the same event — no effect needed.
  const handleOpen = () => {
    setDraftFrom(fromDate);
    setDraftTo(toDate);
    onOpen();
  };

  const applyPreset = (getRange: () => [string, string]) => {
    const [from, to] = getRange();
    onChange(from, to);
    onClose();
  };

  const applyCustom = () => {
    onChange(draftFrom, draftTo);
    onClose();
  };

  const clearRange = () => {
    onChange('', '');
    onClose();
  };

  const hasRange = !!(fromDate || toDate);
  const label =
    fromDate && toDate
      ? `${formatShort(fromDate)} – ${formatShort(toDate)}`
      : fromDate
        ? `From ${formatShort(fromDate)}`
        : toDate
          ? `Until ${formatShort(toDate)}`
          : 'All time';

  return (
    <Popover
      isOpen={isOpen}
      onOpen={handleOpen}
      onClose={onClose}
      placement="bottom-start"
    >
      <PopoverTrigger>
        <Button
          size="sm"
          variant="outline"
          bg="white"
          borderColor="gray.200"
          fontWeight="500"
          color={hasRange ? 'gray.700' : 'gray.400'}
          rightIcon={<Text fontSize="10px">▾</Text>}
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent w="290px" borderColor="gray.100" boxShadow="lg">
        <PopoverBody p={3}>
          <VStack align="stretch" spacing={0.5} mb={2}>
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="ghost"
                justifyContent="flex-start"
                fontWeight="400"
                color="gray.600"
                onClick={() => applyPreset(preset.getRange)}
              >
                {preset.label}
              </Button>
            ))}
          </VStack>

          <Divider mb={3} borderColor="gray.100" />

          <Text
            fontSize="10px"
            fontWeight="700"
            letterSpacing="0.05em"
            color="gray.400"
            mb={2}
          >
            CUSTOM RANGE
          </Text>
          <HStack spacing={2} mb={3}>
            <Input
              type="date"
              size="sm"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              color={draftFrom ? 'gray.700' : 'gray.400'}
            />
            <Text fontSize="12px" color="gray.400">
              to
            </Text>
            <Input
              type="date"
              size="sm"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => setDraftTo(e.target.value)}
              color={draftTo ? 'gray.700' : 'gray.400'}
            />
          </HStack>

          <HStack justify="space-between">
            <Button
              size="xs"
              variant="ghost"
              color="gray.500"
              onClick={clearRange}
              isDisabled={!hasRange}
            >
              Clear
            </Button>
            <Button size="xs" variant="primary" onClick={applyCustom}>
              Apply
            </Button>
          </HStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};
