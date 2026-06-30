import * as Yup from 'yup';

const nameValidation = Yup.string()
  .required('Role Name is required')
  .min(4, 'Role Name must be at least 4 characters')
  .max(25, 'Role Name must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

const labelValidation = Yup.string()
  .required('Label is required')
  .min(4, 'Label must be at least 4 characters')
  .max(25, 'Label must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

export const createRoleSchema = Yup.object().shape({
  roleName: nameValidation,
  label: labelValidation,
  description: Yup.string()
    .required('Description is required')
    .min(5, 'Description must be at least 5 characters')
    .max(500, 'Description must be at most 500 characters'),
  permission_ids: Yup.array()
    .of(Yup.number().required())
    .required()
    .default([]),

  icon: Yup.string().required().default(''),
  icon_color: Yup.string().required().default(''),
});
