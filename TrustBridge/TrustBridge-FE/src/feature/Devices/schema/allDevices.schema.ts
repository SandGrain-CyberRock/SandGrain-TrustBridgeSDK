import * as Yup from 'yup';

const nameValidation = Yup.string()
  .required('Device Name is required')
  .min(4, 'Device Name must be at least 4 characters')
  .max(25, 'Device Name must be at most 25 characters')
  .matches(
    /^[A-Za-z0-9_@-]+$/,
    'Only letters (A–Z, a–z), digits (0–9), and special characters _ - @ are allowed',
  );

export const allDevicesSchema = Yup.object().shape({
  device_name: nameValidation,
  device_serial: Yup.string()
    .optional()
    .max(100, 'Device Serial must be at most 100 characters'),
  token_id: Yup.string()
    .required('Token ID is required')
    .max(100, 'Token ID must be at most 100 characters'),
  device_group_id: Yup.string().required('Device Group is required'),
  tenant_id: Yup.string()
    .optional()
    .max(100, 'Tenant ID must be at most 100 characters'),
  profile_id: Yup.string().optional(),
  batch_no: Yup.string()
    .optional()
    .max(100, 'Batch No must be at most 100 characters'),
});
