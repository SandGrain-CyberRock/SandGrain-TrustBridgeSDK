import { Box, Button, Flex, HStack, Text, VStack } from '@chakra-ui/react';
import { Add } from '../../../../assets/svgs';
import { DataTable } from '../../../../component/Table/DataTable';
import { ConfirmDialog } from '../../../../component/Modal/ConfirmDialog';
import { useModalSearchParams } from '../../../../hooks/useModalSearchParams';
import { useCategoryColumns } from '../columns/category.col';
import { CategoryForm } from '../components/CategoryForm';
import { useGetCategories, useDeleteCategory } from '../service/Category';

export const Categories = () => {
  const { modalOpen, modalClose, shouldOpen, searchParams } =
    useModalSearchParams();
  const { data: categories } = useGetCategories();
  const columns = useCategoryColumns();

  const deleteId = searchParams.get('id') ?? '';
  const deleteCategory = useDeleteCategory();

  const handleDelete = async () => {
    if (deleteId) {
      await deleteCategory.mutateAsync(deleteId);
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
            Categories
          </Text>
          <Text variant="sm_normal" color="gray.1600">
            Manage device categories
          </Text>
        </VStack>
        <HStack>
          <Button
            variant="primary"
            leftIcon={<Add color="white" />}
            onClick={() => modalOpen('', 'addCategory')}
          >
            <Text variant="sm_normal">Add Category</Text>
          </Button>
        </HStack>
      </Flex>

      <DataTable
        data={categories ?? []}
        columns={columns}
        showCheckbox={false}
        emptyStateText="No categories available"
      />

      <CategoryForm />

      <ConfirmDialog
        isOpen={shouldOpen('deleteCategory')}
        onClose={modalClose}
        onConfirm={handleDelete}
        title="Delete Category"
        message="Are you sure you want to delete this category? This action cannot be undone."
        confirmText="Delete"
        isLoading={deleteCategory.isPending}
      />
    </Box>
  );
};
