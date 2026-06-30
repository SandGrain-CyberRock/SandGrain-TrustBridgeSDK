import { Box, Button, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { Add } from '../../../../assets/svgs';
import { DataTable } from '../../../../component/Table/DataTable';
import { ConfirmDialog } from '../../../../component/Modal/ConfirmDialog';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useSubCategoryColumns } from '../columns/subCategory.col';
import { SubCategoryForm } from '../components/SubCategoryForm';
import {
  useGetSubCategories,
  useDeleteSubCategory,
} from '../service/SubCategory';

export const SubCategories = () => {
  const { modalOpen, modalClose, shouldOpen, searchParams } =
    useModalSearchParams();
  const { data: subCategories } = useGetSubCategories();
  const columns = useSubCategoryColumns();

  const deleteId = searchParams.get('id') ?? '';
  const deleteSubCategory = useDeleteSubCategory();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteSubCategory.mutateAsync(deleteId);
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
            Sub-Categories
          </Text>
          <Text variant="sm_normal" color="gray.1600">
            Manage device sub-categories
          </Text>
        </VStack>
        <HStack>
          <Button
            variant="primary"
            leftIcon={<Add color="white" />}
            onClick={() => modalOpen('', 'addSubCategory')}
          >
            <Text variant="sm_normal">Add Sub-Category</Text>
          </Button>
        </HStack>
      </Flex>

      <DataTable
        data={subCategories ?? []}
        columns={columns}
        showCheckbox={false}
        emptyStateText="No sub-categories available"
      />

      <SubCategoryForm />

      <ConfirmDialog
        isOpen={shouldOpen('deleteSubCategory')}
        onClose={modalClose}
        onConfirm={handleDelete}
        title="Delete Sub-Category"
        message="Are you sure you want to delete this sub-category? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteSubCategory.isPending}
      />
    </Box>
  );
};
