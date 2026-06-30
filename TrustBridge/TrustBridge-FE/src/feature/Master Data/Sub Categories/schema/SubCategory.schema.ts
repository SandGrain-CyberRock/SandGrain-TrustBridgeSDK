import * as Yup from 'yup';

export const subCategorySchema = Yup.object({
  sub_category_name: Yup.string()
    .trim()
    .required('Sub-category name is required')
    .min(2, 'Sub-category name must be at least 2 characters')
    .max(50, 'Sub-category name must be at most 50 characters'),
  category_id: Yup.string().required('Category is required'),
});
