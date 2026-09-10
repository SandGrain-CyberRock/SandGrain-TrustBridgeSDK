import * as crypto from "crypto";

import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";

import * as bcrypt from "bcrypt";
import { encrypt } from "src/common/crypto";
import { generateStrongPassword } from "src/common/helpers";
import { TenantUserCredential } from "src/entities/tenant-user-credential.entity";
import { Repository, DataSource } from "typeorm";

import { MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES } from "./constants";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { InitializeSystemDto } from "./dto/initialize-system.dto";
import { LoginDto } from "./dto/login.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { EmailService } from "../../common/services/email.service";
import { OrganizationUnit } from "../../entities/organization-unit.entity";
import { Role } from "../../entities/role.entity";
import { Tenant } from "../../entities/tenant.entity";
import { UserRole } from "../../entities/user-role.entity";
import { User } from "../../entities/user.entity";
import { TenantApiService } from "../tenant-api/tenant-api.service";
import { UserService } from "../user/user.service";
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(OrganizationUnit)
    private orgRepo: Repository<OrganizationUnit>,
    private jwtService: JwtService,
    private userService: UserService,
    private emailService: EmailService,
    private dataSource: DataSource,
    private tenantApiService: TenantApiService,
  ) { }

  /**
   * Check if the system needs initialization (no org exists yet).
   */
  private async checkNeedsInitialization(user: User, roles: string[]): Promise<boolean> {
    try {
      this.logger.log("START::AuthService::checkNeedsInitialization", user, roles);
      // step 1. Check if user has TRUST_ADMIN role
      if (!roles.includes("TRUST_ADMIN")) return false;
      // step 2. Check if TrustAdmin has no org assigned, system needs initialization
      if (!user.ou_id) return true;
      // step 3. Check if any org actually exists
      const dynamicOrgCheck = await this.orgRepo.findOne({
        select: ["ou_id"],
        where: {},
      });
      this.logger.log("SUCCESS::AuthService::checkNeedsInitialization", user, dynamicOrgCheck, roles);
      return !dynamicOrgCheck;
    } catch (error) {
      this.logger.error("ERROR::AuthService::checkNeedsInitialization", error, user, roles);
      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;
    this.logger.log("START::AuthService::login", loginDto);

    return this.dataSource.transaction(async (manager) => {
      // step 1: lock the user row (no relations here — locking + join isn't supported)
      const user = await manager.findOne(User, {
        where: { username },
        lock: { mode: "pessimistic_write" },
      });

      if (!user) throw new UnauthorizedException("Invalid credentials");
      if (user.user_status !== "ACTIVE") throw new UnauthorizedException("Account is inactive");
      if (user.isLocked()) throw new BadRequestException(`Account is locked. Try again in ${user.getLockRemainingMinutes()} minutes`);

      // step 2: verify password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        user.incrementFailedLogins(MAX_FAILED_ATTEMPTS, LOCK_DURATION_MINUTES);
        await manager.save(user);

        if (user.isLocked()) throw new BadRequestException(`Account locked due to too many failed attempts. Try again in ${LOCK_DURATION_MINUTES} minutes.`);
        const attemptsLeft = MAX_FAILED_ATTEMPTS - user.failed_logins;
        throw new UnauthorizedException(`Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`);
      }

      // step 3: reset failed attempts
      user.resetFailedLoginsWhileLoginSuccess();

      // step 4: now load relations (roles/org don't need the row lock — read committed is fine)
      const userWithRelations = await manager.findOne(User, {
        where: { user_id: user.user_id },
        relations: ["userRoles", "userRoles.role", "org"],
      });
      const roles = userWithRelations.userRoles?.map((ur) => ur.role.name) || [];

      // step 5: tenant + init check
      const [tenant, needsInitialization] = await Promise.all([
        user.ou_id ? manager.findOne(Tenant, { where: { ou_id: user.ou_id } }) : null,
        this.checkNeedsInitialization(user, roles),
      ]);
      await manager.save(user);

      const credentialsConfigured = tenant?.credentials_configured ?? false;

      const payload = {
        sub: user.user_id,
        username: user.username,
        email: user.email,
        ou_id: user.ou_id,
        token_version: user.token_version,
      };

      this.logger.log("SUCCESS::AuthService::login", payload);
      return {
        data: {
          access_token: this.jwtService.sign(payload),
          user: {
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            ou_id: user.ou_id,
            org_name: userWithRelations.org?.ou_name,
            mustChangePassword: user.must_change_password,
            credentialsConfigured,
            needsInitialization,
          },
        },
        message: "User logged in successfully",
      };
    }).catch((error) => {
      this.logger.error("ERROR::AuthService::login", error, loginDto);
      throw error;
    });
  }

  async getProfile(userId: number) {
    try {
      this.logger.log("START::AuthService::getProfile", userId);
      const user = await this.userRepo.findOne({
        where: { user_id: userId },
        relations: ["org"],
      });

      if (!user) throw new UnauthorizedException("User not found");
      this.logger.log("SUCCESS::AuthService::getProfile", userId);
      return {
        data: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          name: user.name,
          company_title: user.company_title,
          ou_id: user.ou_id,
          org_name: user.org?.ou_name,
          last_login_at: user.last_login_at,
          mustChangePassword: user.must_change_password,
        },
        message: "Profile retrieved successfully",
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::getProfile", error, userId);
      throw error;
    }
  }

  async updateProfile(userId: number, dto: { name?: string; company_title?: string }) {
    try {
      this.logger.log("START::AuthService::updateProfile", userId, dto);

      const user = await this.userRepo.findOne({ where: { user_id: userId }, relations: ["org"] });
      if (!user) throw new UnauthorizedException("User not found");
      if (dto.name !== undefined) user.name = dto.name;
      if (dto.company_title !== undefined) user.company_title = dto.company_title;

      await this.userRepo.save(user);
      this.logger.log("SUCCESS::AuthService::updateProfile", userId, dto);
      return {
        data: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          name: user.name,
          company_title: user.company_title,
          ou_id: user.ou_id,
          org_name: user.org?.ou_name,
        },
        message: "Profile updated successfully",
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::updateProfile", error, userId, dto);
      throw error;
    }
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    try {
      this.logger.log("START::AuthService::forgotPassword", forgotPasswordDto);
      const resetToken = await this.userService.generatePasswordResetToken(
        forgotPasswordDto.email,
      );

      // Send email in background — don't block the response
      this.emailService
        .sendPasswordResetEmail(forgotPasswordDto.email, resetToken)
        .catch((err) =>
          console.error("Failed to send password reset email:", err),
        );

      this.logger.log("SUCCESS::AuthService::forgotPassword", forgotPasswordDto);
      return {
        data: null,
        message: "Password reset link sent to your email",
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::forgotPassword", error, forgotPasswordDto);
      throw error;
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      this.logger.log("START::AuthService::resetPassword", resetPasswordDto);
      await this.userService.resetPassword(
        resetPasswordDto.token,
        resetPasswordDto.password,
      );
      this.logger.log("SUCCESS::AuthService::resetPassword", resetPasswordDto);
      return {
        data: null,
        message:
          "Password reset successfully. You can now log in with your new password.",
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::resetPassword", error, resetPasswordDto);
      throw error;
    }
  }

  async setPassword(setPasswordDto: SetPasswordDto) {
    try {
      this.logger.log("START::AuthService::setPassword", setPasswordDto);
      await this.userService.setPassword(
        setPasswordDto.token,
        setPasswordDto.password,
      );
      this.logger.log("SUCCESS::AuthService::setPassword", setPasswordDto);
      return {
        data: null,
        message: "Password set successfully. You can now log in.",
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::setPassword", error, setPasswordDto);
      throw error;
    }
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    try {
      this.logger.log("START::AuthService::changePassword", userId, dto);
      // step 1. Fetch the user
      const user = await this.userRepo.findOne({ where: { user_id: userId } });
      if (!user) throw new NotFoundException("User not found");

      // step 2. Verify old password
      const isOldValid = await bcrypt.compare(
        dto.oldPassword,
        user.password_hash,
      );
      if (!isOldValid) throw new BadRequestException("Old password is incorrect");

      // step 3. Hash new password
      user.password_hash = await bcrypt.hash(dto.newPassword, 10);

      // step 4. Remove must_change_password flag
      user.must_change_password = false;

      // step 5. Save the user
      await this.userRepo.save(user);
      this.logger.log("SUCCESS::AuthService::changePassword", userId, dto);
      return { data: null, message: "Password changed successfully" };
    } catch (error) {
      this.logger.error("ERROR::AuthService::changePassword", error, userId, dto);
      throw error;
    }
  }

  async initializeSystem(userId: number, dto: InitializeSystemDto) {
    try {
      this.logger.log("START::AuthService::initializeSystem", userId, dto);
      // step 1. Fetch the user
      const user = await this.userRepo.findOne({
        where: { user_id: userId },
        relations: ["org", "userRoles", "userRoles.role"],
      });

      if (!user) throw new NotFoundException("User not found");

      // step 2. Verify the user is TrustAdmin
      const isTrustAdmin = user.userRoles?.some((ur) => ur.role?.name === "TRUST_ADMIN");
      if (!isTrustAdmin) {
        throw new BadRequestException("Only TrustAdmin can initialize the system");
      }

      //  step 3. Prevent re-initialization
      const anyOrgExists = await this.orgRepo.exists({});
      if (anyOrgExists) {
        throw new ConflictException("System is already initialized");
      }


      // then proceed with the transaction
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const manager = queryRunner.manager;
        // Step 1: Create the organization
        const newOrg = manager.create(OrganizationUnit, {
          ou_name: dto.orgName,
          ou_description: dto.orgDescription || null,
          ou_email: dto.orgEmail,
        });
        const savedOrg = await manager.save(OrganizationUnit, newOrg);
        const orgId = savedOrg.ou_id;

        // Step 2: Update TrustAdmin's ou_id to the new organization
        user.ou_id = orgId;
        await manager.save(User, user);

        // get tenant id and tenant user id from sandgrain
        const { tenantId, tenantUserId } = await this.tenantApiService.getTenantIdAndUserIdFromCyberRock({
          cf_access_client_id: dto.tenantCredentials.cf_access_client_id,
          cf_access_client_secret: dto.tenantCredentials.cf_access_client_secret,
          email: dto.tenantCredentials.email,
          password: dto.tenantCredentials.password,
        });

        // Step 3: Create new Tenant
        const tenantCreds = dto.tenantCredentials;
        const newTenant = manager.create(Tenant, {
          tenant_id: tenantId,
          ou_id: orgId,
          tenant_status: 'ACTIVE',
          credentials_configured: true,
        });
        await manager.save(Tenant, newTenant);

        // Step 4: Create new TenantUserCredential
        const newTenantCreds = manager.create(TenantUserCredential, {
          tenant_id: tenantId,
          tenant_user_id: tenantUserId,
          email: tenantCreds.email,
          password: encrypt(tenantCreds.password),
          cf_access_client_id: tenantCreds.cf_access_client_id,
          cf_access_client_secret: encrypt(tenantCreds.cf_access_client_secret),
        });
        await manager.save(TenantUserCredential, newTenantCreds);

        // Step 4: Create admin user
        const adminData = dto.adminUser;
        const generatedPassword = this.generateStrongPassword(16);
        const passwordHash = await bcrypt.hash(generatedPassword, 12);
        const adminUsername = adminData.email.split("@")[0];
        const adminName = `${adminData.firstName} ${adminData.lastName}`;

        const newAdmin = manager.create(User, {
          ou_id: orgId,
          username: adminUsername,
          name: adminName,
          email: adminData.email,
          password_hash: passwordHash,
          user_status: 'ACTIVE',
          must_change_password: true,
        });
        const savedAdmin = await manager.save(User, newAdmin);
        const adminUserId = savedAdmin.user_id;


        // step 5. Assign ADMINISTRATOR role
        const adminRole = await manager.findOneBy(Role, { name: "ADMINISTRATOR" });
        if (adminRole) {
          const newAdminRoleMapping = manager.create(UserRole, {
            user_id: adminUserId,
            role_id: adminRole.id,
          });
          await manager.save(UserRole, newAdminRoleMapping);
        }
        // step 6. Commit the transaction
        await queryRunner.commitTransaction();

        // step 7. Send credentials email in background
        this.emailService
          .sendActivationEmail(adminData.email, adminName, adminUsername, generatedPassword)
          .catch((err) => console.error("Failed to send admin welcome email:", err));

        // step 8. Issue a new JWT with updated ou_id
        const newPayload = {
          sub: user.user_id,
          username: user.username,
          email: user.email,
          ou_id: orgId,
          token_version: user.token_version,
        };

        this.logger.log("SUCCESS::AuthService::initializeSystem", userId, dto);
        return {
          data: {
            access_token: this.jwtService.sign(newPayload),
            organization: {
              ou_id: orgId,
              ou_name: dto.orgName,
            },
            adminUser: {
              user_id: adminUserId,
              username: adminUsername,
              name: adminName,
              email: adminData.email,
              generatedPassword,
            },
          },
          message: "System initialized successfully",
        };
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error("ERROR::AuthService::initializeSystem", error, userId, dto);
        throw error;
      } finally {
        await queryRunner.release();
      }
    } catch (error: any) {
      this.logger.error("ERROR::AuthService::initializeSystem", error, userId, dto);
      const status = error?.response?.status ?? error?.status;
      if (status === 401 || status === 403 || status === 400) {
        throw new BadRequestException("Please Enter the valid Tenant credentials");
      }

      throw error;
    }
  }

  private generateStrongPassword(length: number = 16): string {
    return generateStrongPassword(length);
  }

  async adminResetPassword(userId: number) {
    try {
      this.logger.log("START::AuthService::adminResetPassword", userId);
      // step 1. Fetch the user
      const user = await this.userRepo.findOne({ where: { user_id: userId } });
      if (!user) throw new NotFoundException("User not found");

      // step 2. Auto-generate a secure temporary password
      const tempPassword =
        crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 4) +
        "@" +
        crypto.randomBytes(4).toString("hex");

      // step 3. Hash the temporary password
      user.password_hash = await bcrypt.hash(tempPassword, 10);

      // step 4. Set flag so user must change password at next login
      user.must_change_password = true;

      // step 5. Reset failed login attempts & unlock the account
      user.failed_logins = 0;
      user.acc_locked_until = null;

      // step 6. Invalidate all existing sessions
      user.token_version = (user.token_version || 0) + 1;

      // step 7. Save the user
      await this.userRepo.save(user);

      // step 8. Send email in background — don't block the response
      this.emailService
        .sendPasswordChangedEmail(user.email, user.name || user.username, user.username, tempPassword)
        .catch((err) =>
          console.error("Failed to send admin reset password email:", err),
        );
      this.logger.log("SUCCESS::AuthService::adminResetPassword", userId);
      return {
        username: user.username,
        email: user.email,
        generatedPassword: tempPassword,
      };
    } catch (error) {
      this.logger.error("ERROR::AuthService::adminResetPassword", error, userId);
      throw error;
    }
  }
}
