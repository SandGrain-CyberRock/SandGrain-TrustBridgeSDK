import {
  Box,
  Text,
  HStack,
  Grid,
  InputGroup,
  InputLeftElement,
  Input,
} from '@chakra-ui/react';
import { Clock, Filter, Search } from '../../../assets/svgs';
import { DeviceListTable } from './DeviceListTable';

export const DeviceList = () => {
  return (
    <Box
      bg="white"
      p={5}
      my={2}
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      minW="0"
    >
      <Grid templateColumns="1fr auto" alignItems="center" gap={4}>
        <Text variant="lgg_bold" color={'primary.1700'}>
          Device List
        </Text>

        <HStack spacing={2}>
          <Box
            w="288px"
            display={{ base: 'none', md: 'block' }}
            borderColor={'bgSecondary.1200'}
          >
            <InputGroup>
              <InputLeftElement pointerEvents="none">
                <Search color="gray.25" />
              </InputLeftElement>
              <Input
                bg={'gray.25'}
                placeholder="Search devices..."
                fontSize="sm"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
              />
            </InputGroup>
          </Box>

          <Box
            w="100px"
            display={{ base: 'none', md: 'block' }}
            borderColor={'bgSecondary.1200'}
          >
            <InputGroup>
              <InputLeftElement pointerEvents="none">
                <Filter color="gray.25" />
              </InputLeftElement>
              <Input
                bg={'gray.25'}
                placeholder="Filter"
                fontSize="sm"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
              />
            </InputGroup>
          </Box>
        </HStack>
      </Grid>

      <HStack gap={1} color="primary.1400" align="center">
        <Box boxSize="16px" display="flex" alignItems="center">
          <Clock />
        </Box>

        <Text variant="sm_normal" lineHeight="20px">
          Updated – last 30 days
        </Text>
      </HStack>

      <DeviceListTable />
    </Box>
  );
};
