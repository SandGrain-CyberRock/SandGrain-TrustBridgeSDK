import * as Yup from 'yup';

export const loginSchema = Yup.object().shape({
  username: Yup.string()
    .trim()
    .required('Username is required.')
    .max(100, 'Username must be at most 100 characters'),
  password: Yup.string()
    .required('Password is required')
    .max(72, 'Password must be at most 72 characters'),
});
