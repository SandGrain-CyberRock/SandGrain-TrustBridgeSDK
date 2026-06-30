import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';
import { Add, Search } from '../../../assets/svgs';
import { ProfileTemplate } from '../components/ProfileTemplate';
import { CreateProfileForm } from '../components/CreateProfileForm';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import {
  useGetDeviceProfiles,
  useDeleteDeviceProfile,
} from '../service/DeviceProfile';
import { ConfirmDialog } from '../../../component/Modal/ConfirmDialog';

export const DeviceProfile = () => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { modalOpen, modalClose, shouldOpen, searchParams } =
    useModalSearchParams();

  const { data, isLoading } = useGetDeviceProfiles({
    search: debouncedSearch || undefined,
  });
  const profiles = data?.data ?? [];
  const totalCount = data?.total ?? 0;

  const deleteId = searchParams.get('id') ?? '';
  const deleteProfile = useDeleteDeviceProfile();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteProfile.mutateAsync(deleteId);
      modalClose();
    }
  };

  return (
    <>
      <Box
        border="1px solid"
        borderColor="primary.1200"
        borderRadius="xl"
        p={6}
        bg="white"
        position="relative"
        _hover={{ boxShadow: 'md' }}
        transition="all 0.2s"
      >
        <Flex justify="space-between">
          <VStack align="start">
            <Text variant="xl_medium" color={'primary.1700'}>
              Profile Templates
            </Text>
            <Text variant="sm_normal" color="gray.1600">
              {isLoading ? 'Loading...' : `${totalCount} profiles configured`}
            </Text>
          </VStack>
          <VStack align="end" spacing={4}>
            <HStack>
              <Button
                variant="primary"
                px="24px"
                py="10px"
                leftIcon={<Add color="white" />}
                onClick={() => modalOpen('', 'createProfile')}
              >
                <Text variant="sm_normal">Create Profile</Text>
              </Button>
            </HStack>
          </VStack>
        </Flex>
        <Flex mt={4}>
          <Box display={{ base: 'none', md: 'block' }} w={'250px'}>
            <InputGroup bg="gray.25" borderRadius="xl">
              <InputLeftElement pointerEvents="none">
                <Search />
              </InputLeftElement>
              <Input
                placeholder="Search by profile name"
                fontSize="xs"
                borderRadius="xl"
                _placeholder={{ color: 'primary.1400' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </Box>
        </Flex>

        <Box
          mt={6}
          border="1px solid"
          borderColor="primary.100"
          borderRadius="md"
          minH="200px"
        >
          {profiles.length > 0 ? (
            <Grid
              templateColumns={{
                base: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(2, 1fr)',
                lg: 'repeat(3, 1fr)',
              }}
              gap={6}
              p={6}
            >
              {profiles.map((profile) => (
                <ProfileTemplate key={profile.profile_id} data={profile} />
              ))}
            </Grid>
          ) : (
            <Flex justify="center" align="center" minH="200px">
              <Text color="gray.1600">No profiles configured yet.</Text>
            </Flex>
          )}
        </Box>
      </Box>

      <CreateProfileForm />

      <ConfirmDialog
        isOpen={shouldOpen('deleteProfile')}
        onClose={modalClose}
        onConfirm={handleDelete}
        title="Delete Profile"
        message="Are you sure you want to delete this profile? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteProfile.isPending}
      />
    </>
  );
};
