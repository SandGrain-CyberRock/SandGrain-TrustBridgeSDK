import * as Yup from 'yup';

export const categorySchema = Yup.object({
  category_name: Yup.string()
    .trim()
    .required('Category name is required')
    .min(2, 'Category name must be at least 2 characters')
    .max(50, 'Category name must be at most 50 characters'),
});
