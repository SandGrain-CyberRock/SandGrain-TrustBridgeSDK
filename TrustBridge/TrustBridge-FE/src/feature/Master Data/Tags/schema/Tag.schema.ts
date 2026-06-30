import * as Yup from 'yup';

export const tagSchema = Yup.object({
  tag_name: Yup.string()
    .trim()
    .required('Tag name is required')
    .min(2, 'Tag name must be at least 2 characters')
    .max(30, 'Tag name must be at most 30 characters'),
});
