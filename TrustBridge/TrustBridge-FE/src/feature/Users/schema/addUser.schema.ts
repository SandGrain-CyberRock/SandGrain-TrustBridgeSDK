import * as Yup from 'yup';

export const addUserSchema = Yup.object({
  name: Yup.string()
    .required('Name is required')
    .max(100, 'Name must be at most 100 characters'),

  username: Yup.string()
    .required('Username is required')
    .max(100, 'Username must be at most 100 characters'),

  email: Yup.string()
    .email('Invalid email format')
    .required('Email is required')
    .max(100, 'Email must be at most 100 characters'),

  companyTitle: Yup.string()
    .required('Company Title is required')
    .max(100, 'Company Title must be at most 100 characters'),

  role: Yup.number().typeError('Role is required').required('Role is required'),

  organizationId: Yup.number()
    .typeError('Organization is required')
    .required('Organization is required'),
});
