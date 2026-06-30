import * as Yup from 'yup';

const nameValidation = Yup.string()
  .required('Group Name is required')
  .min(4, 'Group Name must be at least 4 characters')
  .max(25, 'Group Name must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

export const deviceGroupSchema = Yup.object().shape({
  group_name: nameValidation,
  password: Yup.string()
    .required('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .max(48, 'Password must be at most 48 characters')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter')
    .matches(
      /[^A-Za-z0-9]/,
      'Password must contain at least one special character',
    ),
});
