import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { User } from "../../entities/user.entity";
import { Tenant } from "../../entities/tenant.entity";
import { OrganizationUnit } from "../../entities/organization-unit.entity";
import { Role } from "../../entities/role.entity";
import { UserRole } from "../../entities/user-role.entity";
import { UserService } from "../user/user.service";
import { EmailService } from "../../common/services/email.service";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { SetPasswordDto } from "./dto/set-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { InitializeSystemDto } from "./dto/initialize-system.dto";
import { TenantApiService } from "../tenant-api/tenant-api.service";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    @InjectRepository(OrganizationUnit)
    private orgRepo: Repository<OrganizationUnit>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
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
    if (!roles.includes("TRUST_ADMIN")) return false;
    // If TrustAdmin has no org assigned, system needs initialization
    if (!user.ou_id) return true;
    // Also check if any org actually exists
    const orgCount = await this.orgRepo.count();
    return orgCount === 0;
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    const user = await this.userRepo.findOne({
      where: { username },
      relations: ["org"],
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.user_status !== "ACTIVE") {
      throw new UnauthorizedException("Account is inactive");
    }

    // Check if account is locked
    if (user.acc_locked_until && user.acc_locked_until > new Date()) {
      const remainingTime = Math.ceil(
        (user.acc_locked_until.getTime() - Date.now()) / 60000,
      );
      throw new BadRequestException(
        `Account is locked. Try again in ${remainingTime} minutes`,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      user.failed_logins = (user.failed_logins || 0) + 1;

      const attemptsLeft = MAX_FAILED_ATTEMPTS - user.failed_logins;

      // If exceeded max attempts → lock account
      if (user.failed_logins >= MAX_FAILED_ATTEMPTS) {
        user.acc_locked_until = new Date(
          Date.now() + LOCK_DURATION_MINUTES * 60000,
        );

        await this.userRepo.save(user);

        throw new BadRequestException(
          `Account locked due to too many failed attempts. Try again in ${LOCK_DURATION_MINUTES} minutes.`,
        );
      }

      await this.userRepo.save(user);

      throw new UnauthorizedException(
        `Invalid credentials. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`,
      );
    }

    // Reset failed login attempts on successful login and bump token version
    // to invalidate any existing sessions
    user.failed_logins = 0;
    user.acc_locked_until = null;
    user.last_login_at = new Date();
    user.token_version = (user.token_version || 0) + 1;
    await this.userRepo.save(user);

    // Check user roles for needsInitialization check
    const userRoles = await this.userRoleRepo.find({
      where: { user_id: user.user_id },
      relations: ["role"],
    });
    const roles = userRoles.map((ur) => ur.role.name);

    // Check if tenant credentials are configured
    let credentialsConfigured = true;
    if (user.ou_id) {
      const tenant = await this.tenantRepo.findOne({
        where: { ou_id: user.ou_id },
      });
      credentialsConfigured = tenant?.credentials_configured ?? false;
    } else {
      // TrustAdmin without org — credentials not configured yet
      credentialsConfigured = false;
    }

    const needsInitialization = await this.checkNeedsInitialization(user, roles);

    const payload = {
      sub: user.user_id,
      username: user.username,
      email: user.email,
      ou_id: user.ou_id,
      token_version: user.token_version,
    };

    return {
      data: {
        access_token: this.jwtService.sign(payload),

        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          ou_id: user.ou_id,
          org_name: user.org?.ou_name,
          mustChangePassword: user.must_change_password,
          credentialsConfigured,
          needsInitialization,
        },
      },
      message: "User logged in successfully",
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      relations: ["org"],
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

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
  }

  async updateProfile(userId: number, dto: { name?: string; company_title?: string }) {
    const user = await this.userRepo.findOne({ where: { user_id: userId }, relations: ["org"] });
    if (!user) throw new UnauthorizedException("User not found");
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.company_title !== undefined) user.company_title = dto.company_title;
    await this.userRepo.save(user);
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
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const resetToken = await this.userService.generatePasswordResetToken(
      forgotPasswordDto.email,
    );

    // Send email in background — don't block the response
    this.emailService
      .sendPasswordResetEmail(forgotPasswordDto.email, resetToken)
      .catch((err) =>
        console.error("Failed to send password reset email:", err),
      );

    return {
      data: null,
      message: "Password reset link sent to your email",
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    await this.userService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );

    return {
      data: null,
      message:
        "Password reset successfully. You can now log in with your new password.",
    };
  }

  async setPassword(setPasswordDto: SetPasswordDto) {
    await this.userService.setPassword(
      setPasswordDto.token,
      setPasswordDto.password,
    );

    return {
      data: null,
      message: "Password set successfully. You can now log in.",
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException("User not found");

    // Verify old password
    const isOldValid = await bcrypt.compare(
      dto.oldPassword,
      user.password_hash,
    );
    if (!isOldValid) throw new BadRequestException("Old password is incorrect");

    // Hash new password
    user.password_hash = await bcrypt.hash(dto.newPassword, 10);

    // Remove must_change_password flag
    user.must_change_password = false;

    // Do NOT invalidate sessions - keep user logged in
    // user.token_version = (user.token_version || 0) + 1;

    await this.userRepo.save(user);

    return { data: null, message: "Password changed successfully" };
  }

  async initializeSystem(userId: number, dto: InitializeSystemDto) {
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      relations: ["org"],
    });
    if (!user) throw new NotFoundException("User not found");

    // Verify the user is TrustAdmin
    const userRoles = await this.userRoleRepo.find({
      where: { user_id: userId },
      relations: ["role"],
    });
    const roles = userRoles.map((ur) => ur.role.name);
    if (!roles.includes("TRUST_ADMIN")) {
      throw new BadRequestException("Only TrustAdmin can initialize the system");
    }

    // Prevent re-initialization
    const existingOrgs = await this.orgRepo.count();
    if (existingOrgs > 0) {
      throw new ConflictException("System is already initialized");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Create the organization
      const orgResult = await queryRunner.query(
        `INSERT INTO tb_organization_unit (ou_name, ou_description, ou_email) VALUES (?, ?, ?)`,
        [dto.orgName, dto.orgDescription || null, dto.orgEmail],
      );
      const orgId = orgResult.insertId;

      // Step 2: Update TrustAdmin's ou_id to the new organization
      await queryRunner.query(
        `UPDATE tb_user SET ou_id = ? WHERE user_id = ?`,
        [orgId, userId],
      );

      // get tenant id and tenant user id from sandgrain
      const { tenantId, tenantUserId } = await this.tenantApiService.getTenantIdAndUserIdFromCyberRock({
        cf_access_client_id: dto.tenantCredentials.cf_access_client_id,
        cf_access_client_secret: dto.tenantCredentials.cf_access_client_secret,
        email: dto.tenantCredentials.email,
        password: dto.tenantCredentials.password,
      });

      // Step 3: Save tenant credentials
      const tenantCreds = dto.tenantCredentials;
      await queryRunner.query(
        `INSERT INTO cr_tenant (tenant_id, ou_id, tenant_status, credentials_configured) VALUES (?, ?, 'ACTIVE', true)`,
        [tenantId, orgId],
      );
      await queryRunner.query(
        `INSERT INTO cr_tenant_user_credential (tenant_id, tenant_user_id, email, password, cf_access_client_id, cf_access_client_secret)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          tenantUserId,
          tenantCreds.email,
          tenantCreds.password,
          tenantCreds.cf_access_client_id,
          tenantCreds.cf_access_client_secret,
        ],
      );

      // Step 4: Create admin user
      const adminData = dto.adminUser;
      const generatedPassword = this.generateStrongPassword(16);
      const passwordHash = await bcrypt.hash(generatedPassword, 12);
      const adminUsername = adminData.email.split("@")[0];
      const adminName = `${adminData.firstName} ${adminData.lastName}`;

      const adminResult = await queryRunner.query(
        `INSERT INTO tb_user (ou_id, username, name, email, password_hash, user_status, must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', true)`,
        [orgId, adminUsername, adminName, adminData.email, passwordHash],
      );
      const adminUserId = adminResult.insertId;

      // Assign ADMINISTRATOR role
      const adminRole = await this.roleRepo.findOneBy({ name: "ADMINISTRATOR" });
      if (adminRole) {
        await queryRunner.query(
          `INSERT INTO tenant_user_roles (user_id, role_id) VALUES (?, ?)`,
          [adminUserId, adminRole.id],
        );
      }

      await queryRunner.commitTransaction();

      // Send credentials email in background
      this.emailService
        .sendActivationEmail(adminData.email, adminName, adminUsername, generatedPassword)
        .catch((err) => console.error("Failed to send admin welcome email:", err));

      // Issue a new JWT with updated ou_id
      const newPayload = {
        sub: user.user_id,
        username: user.username,
        email: user.email,
        ou_id: orgId,
        token_version: user.token_version,
      };

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
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private generateStrongPassword(length: number = 16): string {
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const lower = "abcdefghjkmnpqrstuvwxyz";
    const numbers = "23456789";
    const symbols = "!@#$%^&*";
    const all = upper + lower + numbers + symbols;

    let password = "";
    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = 4; i < length; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    return password
      .split("")
      .sort(() => 0.5 - Math.random())
      .join("");
  }

  async adminResetPassword(userId: number) {
    const user = await this.userRepo.findOne({ where: { user_id: userId } });
    if (!user) throw new NotFoundException("User not found");

    // Auto-generate a secure temporary password
    const tempPassword =
      crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 4) +
      "@" +
      crypto.randomBytes(4).toString("hex");

    // Hash the temporary password
    user.password_hash = await bcrypt.hash(tempPassword, 10);

    // Set flag so user must change password at next login
    user.must_change_password = true;

    // Reset failed login attempts & unlock the account
    user.failed_logins = 0;
    user.acc_locked_until = null;

    // Invalidate all existing sessions
    user.token_version = (user.token_version || 0) + 1;

    await this.userRepo.save(user);

    // Send email in background — don't block the response
    this.emailService
      .sendPasswordChangedEmail(user.email, user.name || user.username, user.username, tempPassword)
      .catch((err) =>
        console.error("Failed to send admin reset password email:", err),
      );

    return {
      username: user.username,
      email: user.email,
      generatedPassword: tempPassword,
    };
  }
}
