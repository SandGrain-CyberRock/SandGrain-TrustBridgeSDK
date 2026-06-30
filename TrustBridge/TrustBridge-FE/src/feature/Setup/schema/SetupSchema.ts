import * as Yup from 'yup';

export const changePasswordStepSchema = Yup.object().shape({
  oldPassword: Yup.string().required('Current password is required'),
  newPassword: Yup.string()
    .required('New password is required')
    .min(12, 'Password must be at least 12 characters')
    .matches(/[A-Z]/, 'Must contain an uppercase letter')
    .matches(/[a-z]/, 'Must contain a lowercase letter')
    .matches(/[0-9]/, 'Must contain a number')
    .matches(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm password is required'),
});

export const systemSetupStepSchema = Yup.object().shape({
  orgName: Yup.string().required('Organisation name is required'),
  orgDescription: Yup.string().default(''),
  orgEmail: Yup.string()
    .email('Enter a valid email')
    .required('Organisation email is required'),
  // tenant_id: Yup.string().required('CyberRock Tenant ID is required'),
  // tenant_user_id: Yup.string().required('Tenant User ID is required'),
  email: Yup.string()
    .email('Enter a valid email')
    .required('Access email is required'),
  password: Yup.string()
    .min(6, 'Password must be at least 6 characters')
    .required('Access password is required'),
  confirmAccessPassword: Yup.string()
    .oneOf([Yup.ref('password')], 'Passwords must match')
    .required('Confirm password is required'),
  cf_access_client_id: Yup.string().required(
    'Cloudflare Access Client ID is required',
  ),
  cf_access_client_secret: Yup.string().required(
    'Cloudflare Access Client Secret is required',
  ),
});

export const adminUserStepSchema = Yup.object().shape({
  firstName: Yup.string().required('First name is required'),
  lastName: Yup.string().required('Last name is required'),
  email: Yup.string()
    .email('Enter a valid email')
    .required('Email is required'),
});
