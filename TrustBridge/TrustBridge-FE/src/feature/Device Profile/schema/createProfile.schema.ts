import * as Yup from 'yup';

const nameValidation = Yup.string()
  .required('Profile Name is required')
  .min(4, 'Profile Name must be at least 4 characters')
  .max(25, 'Profile Name must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

export const createProfileSchema = Yup.object().shape({
  profile_name: nameValidation,
  category_id: Yup.string().required('Category is required'),
  sub_category_id: Yup.string().required('Sub Category is required'),
  tag_ids: Yup.array().of(Yup.number()).optional(),
  is_default: Yup.boolean().optional(),
});
