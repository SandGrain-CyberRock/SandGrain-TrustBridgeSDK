import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';

import { tenantCredentialsSchema } from '../schema/tenantCredentials.schema';
import type { TenantCredentialsPayload } from '../service/TenantCredentials';

const defaultValues: TenantCredentialsPayload = {
  tenant_id: '',
  tenant_user_id: '',
  email: '',
  password: '',
  cf_access_client_id: '',
  cf_access_client_secret: '',
};

export const useTenantCredentialsForm = () => {
  const formMethods = useForm<TenantCredentialsPayload>({
    defaultValues,
    resolver: yupResolver(tenantCredentialsSchema),
  });

  return { formMethods };
};
