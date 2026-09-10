export type CyberRockHeaders = {
    accessToken?: string;
    credential: CloudflareAccessCredentials;
}
export type CyberRockClaimTokenRequest = {
    claimTokenId: string;
}

export type CloudflareAccessCredentials = {
    cf_access_client_id: string;
    cf_access_client_secret: string;
}


export type UpdateTokenSerial = {
    status: string;
    applyToAllDelegates: boolean;
    iotId?: string;
    tenantId: string;
}

export type CreateIotRequest = {
    username: string;
    password: string;
    tenantUserIds: string[];
    isEnabled: boolean;
}