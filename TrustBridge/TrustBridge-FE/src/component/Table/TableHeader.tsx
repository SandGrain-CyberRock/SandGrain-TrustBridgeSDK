import { useState } from 'react';
import { Flex, Text, Input, Button } from '@chakra-ui/react';

export interface TableHeaderProps {
  title?: string;
  searchEnable?: boolean;
  buttonTitle?: string;
  onButtonClick?: () => void;
}

export const TableHeader = ({
  title,
  searchEnable,
  buttonTitle,
  onButtonClick,
}: TableHeaderProps) => {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <Flex justify="space-between" mb={4} flexWrap="wrap" gap={2}>
      {title && <Text variant="lg_bold">{title}</Text>}

      {searchEnable && (
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          w={{ base: '100%', sm: '200px' }}
        />
      )}

      {buttonTitle && onButtonClick && (
        <Button onClick={onButtonClick}>{buttonTitle}</Button>
      )}
    </Flex>
  );
};
