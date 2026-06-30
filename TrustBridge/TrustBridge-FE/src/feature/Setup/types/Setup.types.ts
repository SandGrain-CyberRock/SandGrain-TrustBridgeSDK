export type ChangePasswordFormData = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type SystemSetupFormData = {
  orgName: string;
  orgDescription: string;
  orgEmail: string;
  // tenant_id: string;
  // tenant_user_id: string;
  email: string;
  password: string;
  confirmAccessPassword: string;
  cf_access_client_id: string;
  cf_access_client_secret: string;
};

export type AdminUserFormData = {
  firstName: string;
  lastName: string;
  email: string;
};

export type InitializePayload = {
  orgName: string;
  orgDescription?: string;
  orgEmail: string;
  tenantCredentials: {
    // tenant_id: string;
    // tenant_user_id: string;
    email: string;
    password: string;
    cf_access_client_id: string;
    cf_access_client_secret: string;
  };
  adminUser: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type InitializeResponse = {
  access_token: string;
  organization: {
    ou_id: number;
    ou_name: string;
  };
  adminUser: {
    user_id: number;
    username: string;
    name: string;
    email: string;
    generatedPassword: string;
  };
};
