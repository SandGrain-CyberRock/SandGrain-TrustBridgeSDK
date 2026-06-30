import * as Yup from 'yup';

export const tenantCredentialsSchema = Yup.object().shape({
  tenant_id: Yup.string().required('Tenant ID is required'),
  tenant_user_id: Yup.string().required('Tenant User ID is required'),
  email: Yup.string()
    .email('Enter a valid email address')
    .required('Email is required'),
  password: Yup.string().required('Password is required'),
  cf_access_client_id: Yup.string().required(
    'Cloudflare Access Client ID is required',
  ),
  cf_access_client_secret: Yup.string().required(
    'Cloudflare Access Client Secret is required',
  ),
});
