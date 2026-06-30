import { Flex, Grid, Spinner, Text, VStack } from '@chakra-ui/react';
import { ViewModal } from '../../../component/Modal/ViewModal';
import { useModalSearchParams } from '../../../hooks/useModalSearchParams';
import { useGetOrganizationById } from '../service/Organizations';

export const ViewOrganizationsForm = () => {
  const { shouldOpen, modalClose, searchParams } = useModalSearchParams();
  const organizationId = searchParams.get('id') || '';
  const { data: organizationDetails, isLoading } = useGetOrganizationById(
    organizationId,
    !!organizationId,
  );

  return (
    <ViewModal
      isOpen={shouldOpen('viewOrganizations')}
      onClose={modalClose}
      title="View Details"
      childBodyPaddingX={4}
      childBodyPaddingY={4}
    >
      <Text variant="ssm_medium" mb={5} color="primary.1700">
        Organization Details
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
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Organization ID
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {organizationDetails?.ou_id || 'N/A'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Organization Name
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {organizationDetails?.ou_name || 'N/A'}
              </Text>
            </VStack>
            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Status
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {organizationDetails?.ou_status || 'N/A'}
              </Text>
            </VStack>

            <VStack alignItems="flex-start">
              <Text variant="sm_normal" color="primary.1400">
                Description
              </Text>
              <Text variant="sm_normal" color="primary.1700">
                {organizationDetails?.ou_description || 'N/A'}
              </Text>
            </VStack>
          </Grid>
        </Flex>
      )}
    </ViewModal>
  );
};
