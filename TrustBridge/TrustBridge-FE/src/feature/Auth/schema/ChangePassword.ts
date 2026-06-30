import * as Yup from 'yup';

export const changePasswordSchema = Yup.object().shape({
  oldPassword: Yup.string()
    .required('Current password is required')
    .max(72, 'Password must be at most 72 characters'),
  newPassword: Yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('New password is required')
    .max(72, 'Password must be at most 72 characters'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm password is required')
    .max(72, 'Password must be at most 72 characters'),
});
