import {
  Injectable,
  NotFoundException,
  HttpException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";
import { Tenant } from "../../entities/tenant.entity";

const TENANT_API_BASE_URL = "https://tenant-api.sandbox.sandgrain.io/api";

@Injectable()
export class TenantApiService {
  private readonly logger = new Logger(TenantApiService.name);
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    @InjectRepository(TenantUserCredential)
    private credentialRepo: Repository<TenantUserCredential>,
    private httpService: HttpService,
    private dataSource: DataSource,
  ) { }

  async getCredentials(tenantId: string): Promise<TenantUserCredential> {
    const credential = await this.credentialRepo.findOne({
      where: { tenant_id: tenantId },
    });
    if (!credential) {
      throw new NotFoundException(
        `No credentials found for tenant ${tenantId}`,
      );
    }
    return credential;
  }

  async getFirstTenantId(): Promise<string> {
    const credential = await this.credentialRepo.findOne({ where: {} });
    if (!credential) {
      throw new NotFoundException("No tenant credentials configured");
    }
    return credential.tenant_id;
  }

  async getTenantIdAndUserIdFromCyberRock({
    cf_access_client_id,
    cf_access_client_secret,
    email,
    password,
  }: {
    cf_access_client_id: string;
    cf_access_client_secret: string;
    email: string;
    password: string;
  }): Promise<{ tenantId: string; tenantUserId: string }> {

    const tokenData = await this.extractCredentialFromSandgrain({
      cf_access_client_id,
      cf_access_client_secret,
      email,
      password,
    });

    const accessToken = tokenData?.accessToken;
    if (!accessToken) {
      throw new HttpException("Invalid credentials", 401);
    }

    const { data: userData } = await firstValueFrom(
      this.httpService.get(`${TENANT_API_BASE_URL}/users/me`, {
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "CF-Access-Client-Id": cf_access_client_id,
          "CF-Access-Client-Secret": cf_access_client_secret,
        },
      }),
    );

    const tenantUserId = userData?.id;
    const tenantId = userData?.tenantId;

    if (!tenantUserId || !tenantId) {
      throw new HttpException("Invalid credentials", 401);
    }
    const payload = JSON.parse(
      Buffer.from(tokenData.accessToken.split(".")[1], "base64").toString(),
    );

    // Cache the token
    this.tokenCache.set(tenantId, {
      token: tokenData.accessToken,
      expiresAt: payload.exp,
    });
    return {
      tenantId,
      tenantUserId,
    }
  }

  private async extractCredentialFromSandgrain({
    cf_access_client_id,
    cf_access_client_secret,
    email,
    password,
  }: {
    cf_access_client_id: string;
    cf_access_client_secret: string;
    email: string;
    password: string;
  }) {
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${TENANT_API_BASE_URL}/auth/tenantUserLogin`,
        {
          email,
          password,
        },
        {
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "CF-Access-Client-Id": cf_access_client_id,
            "CF-Access-Client-Secret": cf_access_client_secret,
          },
        },
      ),
    );
    return data
  }

  async getAccessToken(
    tenantId: string,
  ): Promise<{ token: string; credential: TenantUserCredential }> {
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now() / 1000 + 30) {
      const credential = await this.getCredentials(tenantId);
      return { token: cached.token, credential };
    }

    const credential = await this.getCredentials(tenantId);

    try {
      const data = await this.extractCredentialFromSandgrain({
        cf_access_client_id: credential.cf_access_client_id,
        cf_access_client_secret: credential.cf_access_client_secret,
        email: credential.email,
        password: credential.password,
      });
      // Decode JWT exp claim to cache until expiry
      const payload = JSON.parse(
        Buffer.from(data.accessToken.split(".")[1], "base64").toString(),
      );
      this.tokenCache.set(tenantId, {
        token: data.accessToken,
        expiresAt: payload.exp,
      });

      return { token: data.accessToken, credential };
    } catch (error) {
      this.logger.error(
        "Tenant API login failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API login failed",
        error.response?.status || 500,
      );
    }
  }

  async login(tenantId: string): Promise<string> {
    const { token } = await this.getAccessToken(tenantId);
    return token;
  }

  async listIotForTenantUser(
    tenantId: string,
    body: {
      page: number;
      limit: number;
      searchData?: { iotUser?: string };
    },
  ): Promise<any> {
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/tenants/list-iot-for-tenant-user`,
          { ...body, id: credential.tenant_user_id },
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

      return data;
    } catch (error) {
      this.logger.error(
        "Tenant API list IoT failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API list IoT failed",
        error.response?.status || 500,
      );
    }
  }

  async heartbeatMe(tenantId: string): Promise<any> {
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${TENANT_API_BASE_URL}/heartbeat/me`, {
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "CF-Access-Client-Id": credential.cf_access_client_id,
            "CF-Access-Client-Secret": credential.cf_access_client_secret,
          },
        }),
      );
      return data;
    } catch (error) {
      this.logger.error(
        "Tenant API heartbeat/me failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API heartbeat/me failed",
        error.response?.status || 500,
      );
    }
  }

  async createIot(
    tenantId: string,
    body: { username: string; password: string },
  ): Promise<any> {
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    const requestPayload = {
      username: body.username,
      password: body.password,
      tenantUserIds: [credential.tenant_user_id],
      isEnabled: true,
    };
    this.logger.log(
      `createIot → tenantId=${tenantId} credential.tenant_user_id=${credential.tenant_user_id} payload=${JSON.stringify(requestPayload)}`,
    );

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/iot/create-iot`,
          requestPayload,
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

      this.logger.log(`createIot → response=${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      this.logger.error(
        `createIot FAILED → tenantId=${tenantId} tenantUserId=${credential.tenant_user_id} status=${error.response?.status} response=${JSON.stringify(error.response?.data)} message=${error.message}`,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API create IoT failed",
        error.response?.status || 500,
      );
    }
  }

  async getUserMe(tenantId: string): Promise<any> {
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${TENANT_API_BASE_URL}/users/me`, {
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "CF-Access-Client-Id": credential.cf_access_client_id,
            "CF-Access-Client-Secret": credential.cf_access_client_secret,
          },
        }),
      );

      return data;
    } catch (error) {
      this.logger.error(
        "Tenant API request failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API request failed",
        error.response?.status || 500,
      );
    }
  }

  /**
   * Save tenant credentials for an organization
   * @param ouId - Organization unit ID
   * @param dto - Credentials data
   */
  async saveCredentials(
    ouId: number,
    dto: {
      email: string;
      password: string;
      cf_access_client_id: string;
      cf_access_client_secret: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      // Use provided tenant_id — update if exists for this org, otherwise insert
      const existingRows = await queryRunner.query(
        `SELECT tenant_id FROM cr_tenant WHERE ou_id = ? AND deleted_at IS NULL LIMIT 1`,
        [ouId],
      );

      const { tenantId, tenantUserId } = await this.getTenantIdAndUserIdFromCyberRock({
        cf_access_client_id: dto.cf_access_client_id,
        cf_access_client_secret: dto.cf_access_client_secret,
        email: dto.email,
        password: dto.password,
      });

      if (existingRows.length > 0) {
        const oldTenantId = existingRows[0].tenant_id;

        // IMPORTANT: delete child rows BEFORE updating the parent's PK.
        // The FK cr_tenant_user_credential.tenant_id → cr_tenant.tenant_id
        // has no ON UPDATE CASCADE, so updating cr_tenant.tenant_id while
        // children still reference the old value would fail with FK 1451.
        await queryRunner.query(
          `DELETE FROM cr_tenant_user_credential WHERE tenant_id = ?`,
          [oldTenantId],
        );

        if (oldTenantId !== tenantId) {
          // tenant_id is the PK — re-key by insert+delete instead of UPDATE
          // (some MySQL versions disallow updating a PK referenced by FKs even
          // after children are gone, depending on engine version).
          await queryRunner.query(
            `INSERT INTO cr_tenant (tenant_id, ou_id, tenant_status, credentials_configured, created_at, updated_at, deleted_at)
             SELECT ?, ou_id, 'ACTIVE', true, created_at, NOW(6), deleted_at
             FROM cr_tenant WHERE tenant_id = ?`,
            [tenantId, oldTenantId],
          );
          await queryRunner.query(
            `DELETE FROM cr_tenant WHERE tenant_id = ?`,
            [oldTenantId],
          );
        } else {
          // Same tenant_id — just refresh status flags
          await queryRunner.query(
            `UPDATE cr_tenant SET credentials_configured = true, tenant_status = 'ACTIVE' WHERE tenant_id = ?`,
            [tenantId],
          );
        }
      } else {
        await queryRunner.query(
          `INSERT INTO cr_tenant (tenant_id, ou_id, tenant_status, credentials_configured) VALUES (?, ?, 'ACTIVE', true)`,
          [tenantId, ouId],
        );
      }

      // Save credentials
      await queryRunner.query(
        `INSERT INTO cr_tenant_user_credential (tenant_id, tenant_user_id, email, password, cf_access_client_id, cf_access_client_secret)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          tenantUserId,
          dto.email,
          dto.password,
          dto.cf_access_client_id,
          dto.cf_access_client_secret,
        ],
      );

      await queryRunner.commitTransaction();

      this.logger.log(`Credentials saved for organization ${ouId}`);

      return { success: true, message: "Credentials saved successfully" };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error("Failed to save credentials", error);
      throw new HttpException("Failed to save credentials", 500);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check if credentials are configured for user's organization
   * @param userId - User ID
   */
  async getCredentialsByOuId(ouId: number): Promise<{
    tenant_id: string;
    tenant_user_id: string;
    email: string;
    cf_access_client_id: string;
    cf_access_client_secret: string;
  } | null> {
    const rows = await this.dataSource.query(
      `SELECT uc.tenant_id, uc.tenant_user_id, uc.email, uc.cf_access_client_id, uc.cf_access_client_secret
       FROM cr_tenant_user_credential uc
       INNER JOIN cr_tenant t ON t.tenant_id = uc.tenant_id
       WHERE t.ou_id = ? LIMIT 1`,
      [ouId],
    );
    return rows[0] || null;
  }

  async updateCredentialsByOuId(
    ouId: number,
    dto: {
      tenant_user_id?: string;
      email?: string;
      password?: string;
      cf_access_client_id?: string;
      cf_access_client_secret?: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    const rows = await this.dataSource.query(
      `SELECT uc.tenant_id FROM cr_tenant_user_credential uc
       INNER JOIN cr_tenant t ON t.tenant_id = uc.tenant_id
       WHERE t.ou_id = ? LIMIT 1`,
      [ouId],
    );
    if (!rows.length) {
      throw new NotFoundException("No credentials found for this organization");
    }
    const tenantId = rows[0].tenant_id;
    const fields: string[] = [];
    const values: any[] = [];
    if (dto.tenant_user_id !== undefined) {
      fields.push("tenant_user_id = ?");
      values.push(dto.tenant_user_id);
    }
    if (dto.email !== undefined) {
      fields.push("email = ?");
      values.push(dto.email);
    }
    if (dto.password !== undefined) {
      fields.push("password = ?");
      values.push(dto.password);
    }
    if (dto.cf_access_client_id !== undefined) {
      fields.push("cf_access_client_id = ?");
      values.push(dto.cf_access_client_id);
    }
    if (dto.cf_access_client_secret !== undefined) {
      fields.push("cf_access_client_secret = ?");
      values.push(dto.cf_access_client_secret);
    }
    if (fields.length === 0)
      return { success: true, message: "Nothing to update" };
    values.push(tenantId);
    await this.dataSource.query(
      `UPDATE cr_tenant_user_credential SET ${fields.join(", ")} WHERE tenant_id = ?`,
      values,
    );
    // Invalidate cached token so next call re-authenticates with new creds
    this.tokenCache.delete(tenantId);
    return { success: true, message: "Credentials updated successfully" };
  }

  async areCredentialsConfigured(userId: number): Promise<boolean> {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM cr_tenant_user_credential tur
       INNER JOIN tb_user u ON u.ou_id = (
         SELECT ou_id FROM cr_tenant WHERE tenant_id = tur.tenant_id
       )
       WHERE u.user_id = ?`,
      [userId],
    );
    return result[0]?.count > 0;
  }

  private buildTenantHeaders(
    accessToken: string,
    credential: {
      cf_access_client_id: string;
      cf_access_client_secret: string;
    },
  ) {
    return {
      "Content-Type": "application/json",
      accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "CF-Access-Client-Id": credential.cf_access_client_id,
      "CF-Access-Client-Secret": credential.cf_access_client_secret,
    };
  }

  async searchByTid(tenantId: string, tid: string): Promise<any> {
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/token-serials/search-by-tid`,
          { TID: tid },
          { headers: this.buildTenantHeaders(token, credential) },
        ),
      );
      return data;
    } catch (error) {
      this.logger.error(
        "searchByTid failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "searchByTid failed",
        error.response?.status || 500,
      );
    }
  }

  async listTenantUsers(tenantId: string): Promise<any> {
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/token-serials/list-tenant-users`,
          { limit: 1000, tenantId },
          { headers: this.buildTenantHeaders(token, credential) },
        ),
      );
      return data;
    } catch (error) {
      this.logger.error(
        "listTenantUsers failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "listTenantUsers failed",
        error.response?.status || 500,
      );
    }
  }

  async listIotUsers(tenantId: string, tenantUserIds: string[]): Promise<any> {
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/token-serials/list-iot-users`,
          { limit: 1000, tenantUserIds },
          { headers: this.buildTenantHeaders(token, credential) },
        ),
      );
      return data;
    } catch (error) {
      this.logger.error(
        "listIotUsers failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "listIotUsers failed",
        error.response?.status || 500,
      );
    }
  }

  async updateTokenSerialLifecycle(
    tenantId: string,
    tid: string,
    payload: {
      status: string;
      applyToAllDelegates: boolean;
      iotId?: string;
      tenantId: string;
    },
  ): Promise<any> {
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const { data } = await firstValueFrom(
        this.httpService.put(
          `${TENANT_API_BASE_URL}/token-serials/${tid}`,
          payload,
          { headers: this.buildTenantHeaders(token, credential) },
        ),
      );
      return data;
    } catch (error) {
      this.logger.error(
        "updateTokenSerialLifecycle failed",
        error.response?.data || error.message,
      );
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "updateTokenSerialLifecycle failed",
        error.response?.status || 500,
      );
    }
  }
}
