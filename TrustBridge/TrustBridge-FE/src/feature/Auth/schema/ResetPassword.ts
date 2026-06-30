import * as Yup from 'yup';

export const resetPasswordSchema = Yup.object().shape({
  token: Yup.string()
    .trim()
    .required('Token is required.')
    .max(500, 'Token must be at most 500 characters'),
  password: Yup.string()
    .required('Password is required')
    .max(72, 'Password must be at most 72 characters'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Confirm password is required')
    .max(72, 'Password must be at most 72 characters'),
});
