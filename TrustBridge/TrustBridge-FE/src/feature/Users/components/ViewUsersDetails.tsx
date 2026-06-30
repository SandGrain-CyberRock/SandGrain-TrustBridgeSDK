import { Flex, Grid, Text, VStack, Spinner } from '@chakra-ui/react';
import { ViewModal } from '../../../component/Modal/ViewModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useGetUserById } from '../service/Users';
import { format } from 'date-fns';

export const ViewUsersDetails = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const userId = searchParams.get('id') || '';
  const { data: userDetails, isLoading } = useGetUserById(userId, !!userId);

  return (
    <ViewModal
      isOpen={shouldOpen('viewUser')}
      onClose={modalClose}
      title="View Details"
      childBodyPaddingX={4}
      childBodyPaddingY={4}
    >
      <Text variant="ssm_medium" mb={5} color="primary.1700">
        User Details
      </Text>

      {isLoading ? (
        <Flex justify="center" align="center" minH="100px">
          <Spinner size="sm" />
        </Flex>
      ) : (
        <Flex>
          <Grid
            templateColumns="repeat(3, 1fr)"
            columnGap={6}
            rowGap={8}
            width="100%"
            flex="1"
            alignItems="flex-start"
          >
            {/* User ID */}
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                User ID
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.user_id || 'N/A'}
              </Text>
            </VStack>

            {/* Username */}
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Name
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.name || 'N/A'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Username
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.username || 'N/A'}
              </Text>
            </VStack>

            {/* Email */}
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Email Address
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.email || 'N/A'}
              </Text>
            </VStack>

            {/* Role */}
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Role
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.userRoles[0]?.role?.name || 'N/A'}
              </Text>
            </VStack>

            {/* Company Title */}
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Company Title
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.company_title || 'N/A'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Status
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.user_status || 'N/A'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Last Login
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.last_login_at
                  ? format(
                      new Date(userDetails.last_login_at),
                      'dd/MM/yyyy HH:mm',
                    )
                  : 'Never'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Created At
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {userDetails?.created_at
                  ? format(new Date(userDetails.created_at), 'dd/MM/yyyy')
                  : 'N/A'}
              </Text>
            </VStack>
          </Grid>
        </Flex>
      )}
    </ViewModal>
  );
};
