import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";

import { firstValueFrom } from "rxjs";

import { CreateIotRequest, CyberRockClaimTokenRequest, CyberRockHeaders, UpdateTokenSerial } from "./types";

const TENANT_API_BASE_URL = process.env.TENANT_API_BASE_URL || "https://tenant-api.sandbox.sandgrain.io/api";

@Injectable()
export class CyberRockService {
    private readonly logger = new Logger(CyberRockService.name);
    constructor(private readonly httpService: HttpService) { }

    private getHeaders(
        { accessToken, credential }: CyberRockHeaders
    ) {
        return {
            "Content-Type": "application/json",
            accept: "application/json",
            ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
            ...(credential && {
                "CF-Access-Client-Id": credential.cf_access_client_id,
                "CF-Access-Client-Secret": credential.cf_access_client_secret,
            }),
        }
    }

    async claimToken(
        { accessToken, credential }: CyberRockHeaders,
        requestBody: CyberRockClaimTokenRequest
    ) {
        this.logger.log("START::CyberRockService::claimToken", accessToken, credential, requestBody);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/tenantApi/claim-token`,
                requestBody,
                {
                    headers: this.getHeaders({ accessToken, credential })
                },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::claimToken", accessToken, credential, requestBody);
        return data;
    }


    async getUserData(
        { accessToken, credential }: CyberRockHeaders
    ) {
        this.logger.log("START::CyberRockService::getUserData", accessToken, credential);
        const { data } = await firstValueFrom(
            this.httpService.get(`${TENANT_API_BASE_URL}/users/me`, {
                headers: this.getHeaders({ accessToken, credential }),
            }),
        );
        this.logger.log("SUCCESS::CyberRockService::getUserData", accessToken, credential);
        return data;
    }


    async tenantUserLogin(
        { credential }: CyberRockHeaders,
        { email, password }: { email: string, password: string }
    ) {
        this.logger.log("START::CyberRockService::tenantUserLogin", credential, email, password);
        const { data } = await firstValueFrom(
            this.httpService.post(`${TENANT_API_BASE_URL}/auth/tenantUserLogin`, { email, password, contentFormat: "plain" }, {
                headers: this.getHeaders({ credential }),
            }),
        );
        this.logger.log("SUCCESS::CyberRockService::tenantUserLogin", credential, email, password);
        return data;
    }

    async heartbeatMe(
        { accessToken, credential }: CyberRockHeaders
    ) {
        this.logger.log("START::CyberRockService::heartbeatMe", accessToken, credential);
        const { data } = await firstValueFrom(
            this.httpService.get(`${TENANT_API_BASE_URL}/heartbeat/me`, {
                headers: this.getHeaders({ accessToken, credential }),
            }),
        );
        this.logger.log("SUCCESS::CyberRockService::heartbeatMe", accessToken, credential);
        return data;
    }

    async searchByTid(
        { accessToken, credential }: CyberRockHeaders,
        { tid }: { tid: string }
    ) {
        this.logger.log("START::CyberRockService::searchByTid", accessToken, credential, tid);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/token-serials/search-by-tid`,
                { TID: tid },
                { headers: this.getHeaders({ accessToken, credential }) },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::searchByTid", accessToken, credential, tid);
        return data;
    }

    async updateTokenSerials(
        tid: string,
        { accessToken, credential }: CyberRockHeaders,
        payload: UpdateTokenSerial,
    ) {
        this.logger.log("START::CyberRockService::updateTokenSerials", tid, accessToken, credential, payload);
        const { data } = await firstValueFrom(
            this.httpService.put(
                `${TENANT_API_BASE_URL}/token-serials/${tid}`,
                payload,
                { headers: this.getHeaders({ accessToken, credential }) },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::updateTokenSerials", tid, accessToken, credential, payload);
        return data;
    }

    async listTenantUsers(
        { tenantId, limit }: { tenantId: string, limit: number },
        { accessToken, credential }: CyberRockHeaders
    ) {
        this.logger.log("START::CyberRockService::listTenantUsers", tenantId, limit, accessToken, credential);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/token-serials/list-tenant-users`,
                { limit: limit, tenantId },
                { headers: this.getHeaders({ accessToken, credential }) },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::listTenantUsers", tenantId, limit, accessToken, credential);
        return data;
    }

    async listIotUsers(
        { tenantUserIds, limit }: { tenantUserIds: string[], limit: number },
        { accessToken, credential }: CyberRockHeaders
    ) {
        this.logger.log("START::CyberRockService::listIotUsers", tenantUserIds, limit, accessToken, credential);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/token-serials/list-iot-users`,
                { limit: limit, tenantUserIds },
                { headers: this.getHeaders({ accessToken, credential }) },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::listIotUsers", tenantUserIds, limit, accessToken, credential);
        return data;
    }


    async createIot(
        { accessToken, credential }: CyberRockHeaders,
        requestPayload: CreateIotRequest
    ) {
        this.logger.log("START::CyberRockService::createIot", accessToken, credential, requestPayload);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/iot/create-iot`,
                requestPayload,
                {
                    headers: this.getHeaders({ accessToken, credential }),
                },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::createIot", accessToken, credential, requestPayload);
        return data;
    }

    async listIotForTenantUser(
        tenant_user_id: string,
        body: {
            page: number;
            limit: number;
            searchData?: { iotUser?: string };
        },
        { accessToken, credential }: CyberRockHeaders,
    ) {
        this.logger.log("START::CyberRockService::listIotForTenantUser", tenant_user_id, body, accessToken, credential);
        const { data } = await firstValueFrom(
            this.httpService.post(
                `${TENANT_API_BASE_URL}/tenants/list-iot-for-tenant-user`,
                { ...body, id: tenant_user_id },
                {
                    headers: {
                        "Content-Type": "application/json",
                        accept: "application/json",
                        Authorization: `Bearer ${accessToken}`,
                        "CF-Access-Client-Id": credential.cf_access_client_id,
                        "CF-Access-Client-Secret": credential.cf_access_client_secret,
                    },
                },
            ),
        );
        this.logger.log("SUCCESS::CyberRockService::listIotForTenantUser", tenant_user_id, body, accessToken, credential);
        return data;
    }
}