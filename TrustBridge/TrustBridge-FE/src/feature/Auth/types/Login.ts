export type LoginTypes = {
  username: string;
  password: string;
};

export type LoginResponseType = {
  access_token: string;
  user: {
    user_id: number;
    username: string;
    email: string;
    ou_id: number;
    org_name: string;
    mustChangePassword: boolean;
    credentialsConfigured: boolean;
    needsInitialization: boolean;
  };
};

export type ChangePasswordType = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export type ChangePasswordPayload = Omit<ChangePasswordType, 'confirmPassword'>;

export type ForgotPasswordType = {
  email: string;
};

export type ResetPasswordType = {
  token: string;
  password: string;
  confirmPassword: string;
};

export type ResetPasswordPayload = Omit<ResetPasswordType, 'confirmPassword'>;
