import {
  Injectable,
  NotFoundException,
  HttpException,
  Logger,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { CyberRockService } from "src/common/cyberRock/cyberRock.service";
import { UpdateTokenSerial } from "src/common/cyberRock/types";
import { Repository, DataSource } from "typeorm";

import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";

@Injectable()
export class TenantApiService {
  private readonly logger = new Logger(TenantApiService.name);
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    @InjectRepository(TenantUserCredential)
    private credentialRepo: Repository<TenantUserCredential>,
    private dataSource: DataSource,
    private cyberRockService: CyberRockService,
  ) { }

  async getCredentials(tenantId: string): Promise<TenantUserCredential> {
    try {
      this.logger.log("START::TenantApiService::getCredentials", tenantId);
      const credential = await this.credentialRepo.findOne({
        where: { tenant_id: tenantId },
      });
      if (!credential) {
        throw new NotFoundException(
          `No credentials found for tenant ${tenantId}`,
        );
      }
      return credential;
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::getCredentials", error, tenantId);
      throw error;
    }
  }

  async getFirstTenantId(): Promise<string> {
    try {
      this.logger.log("START::TenantApiService::getFirstTenantId");
      const credential = await this.credentialRepo.findOne({ where: {} });
      if (!credential) {
        throw new NotFoundException("No tenant credentials configured");
      }
      this.logger.log("SUCCESS::TenantApiService::getFirstTenantId");
      return credential.tenant_id;
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::getFirstTenantId", error);
      throw error;
    }
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
    try {
      this.logger.log("START::TenantApiService::getTenantIdAndUserIdFromCyberRock", cf_access_client_id, cf_access_client_secret, email, password);

      const tokenData = await this.extractCredentialFromSandgrain({
        cf_access_client_id,
        cf_access_client_secret,
        email,
        password,
      });

      const accessToken = tokenData?.accessToken;
      if (!accessToken) {
        throw new BadRequestException("Please Enter the valid Tenant credentials");
      }

      const userData = await this.cyberRockService.getUserData({ accessToken, credential: { cf_access_client_id, cf_access_client_secret } });

      const tenantUserId = userData?.id;
      const tenantId = userData?.tenantId;

      if (!tenantUserId || !tenantId) {
        throw new BadRequestException("Please Enter the valid Tenant credentials");
      }
      const payload = JSON.parse(
        Buffer.from(tokenData.accessToken.split(".")[1], "base64").toString(),
      );
      // Cache the token
      await this.setCachedToken(tenantId, tokenData.accessToken, payload.exp);
      this.logger.log("SUCCESS::TenantApiService::getTenantIdAndUserIdFromCyberRock", cf_access_client_id, cf_access_client_secret, email, password);
      return {
        tenantId,
        tenantUserId,
      }

    } catch (error) {
      this.logger.error("ERROR::TenantApiService::getTenantIdAndUserIdFromCyberRock", error, cf_access_client_id, cf_access_client_secret, email, password);
      throw error;
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
    try {
      this.logger.log("START::TenantApiService::extractCredentialFromSandgrain", cf_access_client_id, cf_access_client_secret, email, password);
      const data = await this.cyberRockService.tenantUserLogin({ credential: { cf_access_client_id, cf_access_client_secret } }, { email, password });
      this.logger.log("SUCCESS::TenantApiService::extractCredentialFromSandgrain", cf_access_client_id, cf_access_client_secret, email, password);
      return data
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::extractCredentialFromSandgrain", error, cf_access_client_id, cf_access_client_secret, email, password);
      throw error;
    }
  }
  async getAccessToken(
    tenantId: string,
  ): Promise<{ token: string; credential: TenantUserCredential }> {
    try {
      this.logger.log("START::TenantApiService::getAccessToken", tenantId);

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

        await this.setCachedToken(tenantId, data.accessToken, payload.exp);


        return { token: data.accessToken, credential };
      } catch (error: any) {
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
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::getAccessToken", error);
      throw error;

    }
  }

  async login(tenantId: string): Promise<string> {
    try {
      this.logger.log("START::TenantApiService::login", tenantId);
      const { token } = await this.getAccessToken(tenantId);
      this.logger.log("SUCCESS::TenantApiService::login", tenantId);
      return token;
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::login", error);
      throw error;
    }

  }

  async listIotForTenantUser(
    tenantId: string,
    body: {
      page: number;
      limit: number;
      searchData?: { iotUser?: string };
    },
  ): Promise<any> {
    this.logger.log("START::TenantApiService::listIotForTenantUser", tenantId, body);
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const data = await this.cyberRockService.listIotForTenantUser(credential.tenant_user_id, body, { accessToken, credential });
      this.logger.log("SUCCESS::TenantApiService::listIotForTenantUser", tenantId, body);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::listIotForTenantUser", error, tenantId, body);
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "Tenant API list IoT failed",
        error.response?.status || 500,
      );
    }
  }



  async heartbeatMe(tenantId: string): Promise<any> {
    this.logger.log("START::TenantApiService::heartbeatMe", tenantId);
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const data = await this.cyberRockService.heartbeatMe({ accessToken, credential });
      this.logger.log("SUCCESS::TenantApiService::heartbeatMe", tenantId);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::heartbeatMe", error, tenantId);
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
      this.logger.log("START::TenantApiService::createIot", tenantId, body);
      const data = await this.cyberRockService.createIot({ accessToken, credential }, requestPayload);

      this.logger.log("SUCCESS::TenantApiService::createIot", tenantId, body);
      return data;
    } catch (error: any) {
      const errorCode = error.response?.data?.errorCode;

      this.logger.error(
        `ERROR::TenantApiService::createIot → tenantId=${tenantId} tenantUserId=${credential.tenant_user_id} status=${error.response?.status} response=${JSON.stringify(error.response?.data)} message=${error.message}`,
      );

      if (errorCode === 'FORBIDDEN.DUPLICATE_DEVICE_USERNAME') {
        throw new ConflictException('Device username already exists');
      }

      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        'Tenant API create IoT failed',
        error.response?.status || 500,
      );
    }
  }

  async getUserMe(tenantId: string): Promise<any> {
    this.logger.log("START::TenantApiService::getUserMe", tenantId);
    const { token: accessToken, credential } =
      await this.getAccessToken(tenantId);

    try {
      const data = await this.cyberRockService.getUserData({ accessToken, credential });
      this.logger.log("SUCCESS::TenantApiService::getUserMe", tenantId);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::getUserMe", error, tenantId);
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
      `SELECT uc.tenant_id, uc.tenant_user_id, uc.email, uc.cf_access_client_id
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
    this.logger.log("START::TenantApiService::updateCredentialsByOuId", ouId);

    const existing = await this.credentialRepo
      .createQueryBuilder("uc")
      .innerJoin("cr_tenant", "t", "t.tenant_id = uc.tenant_id")
      .where("t.ou_id = :ouId", { ouId })
      .getOne();

    if (!existing) {
      throw new NotFoundException("No credentials found for this organization");
    }

    // let tokenData: { accessToken?: string };
    // try {
    //   tokenData = await this.extractCredentialFromSandgrain({
    //     email: dto.email ?? existing.email,
    //     password: dto.password ?? existing.password,
    //     cf_access_client_id: dto.cf_access_client_id ?? existing.cf_access_client_id,
    //     cf_access_client_secret: dto.cf_access_client_secret ?? existing.cf_access_client_secret,
    //   });
    // } catch (error: any) {
    //   this.logger.error("ERROR::TenantApiService::updateCredentialsByOuId::validate", error, ouId);
    //   throw new HttpException(
    //     error.response?.data?.message ||
    //     error.response?.data ||
    //     "Invalid credentials — verification against CyberRock failed",
    //     error.response?.status || 401,
    //   );
    // }

    // if (!tokenData?.accessToken) {
    //   throw new BadRequestException("Please provide valid credentials");
    // }

    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(changes).length === 0) {
      return { success: true, message: "Nothing to update" };
    }

    await this.credentialRepo.update({ tenant_id: existing.tenant_id }, changes);
    this.tokenCache.delete(existing.tenant_id);

    this.logger.log("SUCCESS::TenantApiService::updateCredentialsByOuId", ouId);
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
    this.logger.log("START::TenantApiService::searchByTid", tenantId, tid);
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const data = await this.cyberRockService.searchByTid({ accessToken: token, credential }, { tid });
      this.logger.log("SUCCESS::TenantApiService::searchByTid", tenantId, tid);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::searchByTid", error, tenantId, tid);
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "searchByTid failed",
        error.response?.status || 500,
      );
    }
  }


  async listTenantUsers(tenantId: string): Promise<any> {
    this.logger.log("START::TenantApiService::listTenantUsers", tenantId);
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const data = await this.cyberRockService.listTenantUsers({ tenantId, limit: 1000 }, { accessToken: token, credential });
      this.logger.log("SUCCESS::TenantApiService::listTenantUsers", tenantId);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::listTenantUsers", error, tenantId);
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "listTenantUsers failed",
        error.response?.status || 500,
      );
    }
  }

  async listIotUsers(tenantId: string, tenantUserIds: string[]): Promise<any> {
    this.logger.log("START::TenantApiService::listIotUsers", tenantId, tenantUserIds);
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const data = await this.cyberRockService.listIotUsers({ tenantUserIds, limit: 1000 }, { accessToken: token, credential });
      this.logger.log("SUCCESS::TenantApiService::listIotUsers", tenantId, tenantUserIds);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::listIotUsers", error, tenantId, tenantUserIds);
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
    payload: UpdateTokenSerial,
  ): Promise<any> {
    this.logger.log("START::TenantApiService::updateTokenSerialLifecycle", tenantId, tid, payload);
    const { token, credential } = await this.getAccessToken(tenantId);
    try {
      const data = await this.cyberRockService.updateTokenSerials(tid, { accessToken: token, credential }, payload);
      this.logger.log("SUCCESS::TenantApiService::updateTokenSerialLifecycle", tenantId, tid, payload);
      return data;
    } catch (error: any) {
      this.logger.error("ERROR::TenantApiService::updateTokenSerialLifecycle", error, tenantId, tid, payload);
      throw new HttpException(
        error.response?.data?.message ||
        error.response?.data ||
        "updateTokenSerialLifecycle failed",
        error.response?.status || 500,
      );
    }
  }

  private async setCachedToken(
    tenantId: string,
    token: string,
    expiresAt: number,
  ): Promise<void> {
    try {
      this.logger.log("START::TenantApiService::setCachedToken", tenantId, token, expiresAt);
      this.tokenCache.set(tenantId, { token, expiresAt });
      this.logger.log("SUCCESS::TenantApiService::setCachedToken", tenantId, token, expiresAt);
    } catch (error) {
      this.logger.error("ERROR::TenantApiService::setCachedToken", error, tenantId, token, expiresAt);
      throw error;
    }
  }
}
