import { Box, Button, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { Add } from '../../../../assets/svgs';
import { DataTable } from '../../../../component/Table/DataTable';
import { ConfirmDialog } from '../../../../component/Modal/ConfirmDialog';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useTagColumns } from '../columns/tag.col';
import { TagForm } from '../components/TagForm';
import { useGetTags, useDeleteTag } from '../service/Tag';

export const Tags = () => {
  const { modalOpen, modalClose, shouldOpen, searchParams } =
    useModalSearchParams();
  const { data: tags } = useGetTags();
  const columns = useTagColumns();

  const deleteId = searchParams.get('id') ?? '';
  const deleteTag = useDeleteTag();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTag.mutateAsync(deleteId);
      modalClose();
    }
  };

  return (
    <Box
      border="1px solid"
      borderColor="primary.1200"
      borderRadius="xl"
      p={6}
      bg="white"
    >
      <Flex justify="space-between" mb={6}>
        <VStack align="start" spacing={1}>
          <Text variant="xl_medium" color="primary.1700">
            Tags
          </Text>
          <Text variant="sm_normal" color="gray.1600">
            Manage profile tags
          </Text>
        </VStack>
        <HStack>
          <Button
            variant="primary"
            leftIcon={<Add color="white" />}
            onClick={() => modalOpen('', 'addTag')}
          >
            <Text variant="sm_normal">Add Tag</Text>
          </Button>
        </HStack>
      </Flex>

      <DataTable
        data={tags ?? []}
        columns={columns}
        showCheckbox={false}
        emptyStateText="No tags available"
      />

      <TagForm />

      <ConfirmDialog
        isOpen={shouldOpen('deleteTag')}
        onClose={modalClose}
        onConfirm={handleDelete}
        title="Delete Tag"
        message="Are you sure you want to delete this tag? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteTag.isPending}
      />
    </Box>
  );
};
