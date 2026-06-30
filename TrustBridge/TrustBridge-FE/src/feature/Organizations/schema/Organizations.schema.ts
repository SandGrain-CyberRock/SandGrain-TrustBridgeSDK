import * as Yup from 'yup';

const nameValidation = Yup.string()
  .required('Name is required')
  .min(4, 'Organization Name must be at least 4 characters')
  .max(25, 'Organization Name must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

export const addOrganizationSchema = Yup.object({
  name: nameValidation,
  description: Yup.string()
    .required('Description is required')
    .min(5, 'Organization Description must be at least 5 characters')
    .max(500, 'Organization Description must be at most 500 characters'),
});
