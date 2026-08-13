import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { Workbook } from "exceljs";
import { User } from "../../entities/user.entity";
import { UserRole } from "../../entities/user-role.entity";
import { Role } from "../../entities/role.entity";
import { EmailService } from "../../common/services/email.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    private emailService: EmailService,
    private systemActivityService: SystemActivityService,
  ) { }

  private sanitizeUser(
    user: User,
  ): Omit<
    User,
    | "password_hash"
    | "password_reset_token"
    | "password_reset_expires"
    | "invitation_token"
    | "invitation_expires"
  > {
    const {
      password_hash,
      password_reset_token,
      password_reset_expires,
      invitation_token,
      invitation_expires,
      ...sanitized
    } = user;
    return sanitized as any;
  }

  private generateStrongPassword(length: number = 12): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const symbols = "@$!%*?&#";

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

  async create(createDto: CreateUserDto) {

    const email = createDto.email.trim().toLowerCase();
    const username = createDto.username.trim();

    // Check if username or email already exists
    const existingUser = await this.userRepo.findOne({
      where: [{ username }, { email }],
    });

    if (existingUser) {
      throw new ConflictException("Username or email already exists");
    }

    const defaultPassword = this.generateStrongPassword();
    const passwordHash = await bcrypt.hash(defaultPassword, 12);

    const user = this.userRepo.create({
      ou_id: createDto.ou_id,
      name: createDto.name || null,
      company_title: createDto.company_title || null,
      username,
      email,
      password_hash: passwordHash,
      user_status: "ACTIVE",
      must_change_password: true,
    });

    let savedUser;
    try {
      savedUser = await this.userRepo.save(user);
    } catch (err: any) {
      // MySQL duplicate key -> convert to a proper 409 instead of bubbling as 500
      if (err.code === "ER_DUP_ENTRY" || err.driverError?.code === "ER_DUP_ENTRY") {
        throw new ConflictException("Username or email already exists");
      }
      throw err;
    }

    if (createDto.role_id) {
      await this.assignRole(savedUser.user_id, createDto.role_id);
    }

    this.emailService
      .sendActivationEmail(savedUser.email, savedUser.name || savedUser.username, savedUser.username, defaultPassword)
      .catch((err) => console.error("Failed to send welcome email:", err));

    const created = await this.findOneRaw(savedUser.user_id);
    this.systemActivityService.logCreated("user", savedUser.user_id, savedUser.name || savedUser.username).catch(() => { });
    return { ...this.sanitizeUser(created), generatedPassword: defaultPassword };
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    ouId?: number,
    status?: string,
    role?: string,
  ): Promise<{
    users: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const qb = this.userRepo
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.org", "org")
      .leftJoinAndSelect("user.userRoles", "userRoles")
      .leftJoinAndSelect("userRoles.role", "role")
      .orderBy("user.created_at", "DESC")
      .skip(skip)
      .take(limit);

    // Org users filter by their ou_id (set from JWT in controller).
    // TrustAdmin with no ouId (pre-init) sees all users.
    if (ouId) {
      qb.andWhere("user.ou_id = :ouId", { ouId });
    }

    // Status filter
    if (status) {
      qb.andWhere("user.user_status = :status", {
        status: status.toUpperCase(),
      });
    }

    // Role filter
    if (role) {
      qb.andWhere("role.name = :role", { role });
    }

    // Search filter - searches username, email, name, company_title
    if (search) {
      const isNumeric = /^\d+$/.test(search);
      if (isNumeric) {
        qb.andWhere(
          "(user.user_id = :id OR user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)",
          { id: Number(search), q: `%${search}%` },
        );
      } else {
        qb.andWhere(
          "(user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)",
          { q: `%${search}%` },
        );
      }
    }

    const [users, total] = await qb.getManyAndCount();
    const sanitizedUsers = users.map((user) => this.sanitizeUser(user));

    return {
      users: sanitizedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchUsers(query: string, ouId?: number): Promise<any[]> {
    const qb = this.userRepo
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.org", "org")
      .leftJoinAndSelect("user.userRoles", "userRoles")
      .leftJoinAndSelect("userRoles.role", "role");

    if (ouId) {
      qb.where("user.ou_id = :ouId", { ouId });
    }

    const isNumeric = /^\d+$/.test(query);

    if (isNumeric) {
      qb.andWhere(
        "(user.user_id = :id OR user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)",
        { id: Number(query), q: `%${query}%` },
      );
    } else {
      qb.andWhere(
        "(user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)",
        { q: `%${query}%` },
      );
    }

    const users = await qb.orderBy("user.created_at", "DESC").getMany();
    return users.map((user) => this.sanitizeUser(user));
  }

  private async findOneRaw(id: number): Promise<User> {
    this.logger.log("START::UserService::findOneRaw", id);
    const user = await this.userRepo.findOne({
      where: { user_id: id },
      relations: ["org", "userRoles", "userRoles.role"],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    this.logger.log("SUCCESS::UserService::findOneRaw", id);
    return user;
  }

  async findOne(id: number) {
    this.logger.log("START::UserService::findOne", id);
    const user = await this.findOneRaw(id);
    this.logger.log("SUCCESS::UserService::findOne", id);
    return this.sanitizeUser(user);
  }

  async update(id: number, updateDto: UpdateUserDto) {
    this.logger.log("START::UserService::update", id, updateDto);
    const user = await this.findOneRaw(id);

    if (updateDto.name !== undefined) user.name = updateDto.name;
    if (updateDto.company_title !== undefined)
      user.company_title = updateDto.company_title;
    if (updateDto.user_status) user.user_status = updateDto.user_status;

    await this.userRepo.save(user);

    // Update role if provided
    if (updateDto.role_id) {
      await this.assignRole(id, updateDto.role_id);
    }

    const updated = await this.findOneRaw(id);
    this.systemActivityService.logUpdated("user", id, updated.name || updated.username).catch(() => { });
    this.logger.log("SUCCESS::UserService::update", id, updateDto);
    return this.sanitizeUser(updated);
  }

  async remove(id: number): Promise<void> {
    this.logger.log("START::UserService::remove", id);
    const user = await this.findOneRaw(id);
    await this.userRepo.softRemove(user);
    this.systemActivityService.logDeleted("user", id, user.name || user.username).catch(() => { });
    this.logger.log("SUCCESS::UserService::remove", id);
  }

  async assignRole(userId: number, roleId: number): Promise<void> {
    this.logger.log("START::UserService::assignRole", userId, roleId);
    // Verify user exists
    await this.findOneRaw(userId);

    // Verify role exists
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    // Remove existing role
    await this.userRoleRepo.delete({ user_id: userId });

    // Assign new role
    const userRole = this.userRoleRepo.create({
      user_id: userId,
      role_id: roleId,
    });

    await this.userRoleRepo.save(userRole);
    this.logger.log("SUCCESS::UserService::assignRole", userId, roleId);
  }

  async getUserRole(userId: number): Promise<Role | null> {
    this.logger.log("START::UserService::getUserRole", userId);
    const userRole = await this.userRoleRepo.findOne({
      where: { user_id: userId },
      relations: ["role"],
    });
    this.logger.log("SUCCESS::UserService::getUserRole", userId);

    return userRole ? userRole.role : null;
  }

  async assignRoles(userId: number, roleIds: number[]): Promise<void> {
    this.logger.log("START::UserService::assignRoles", userId, roleIds);
    // Remove existing roles
    await this.userRoleRepo.delete({ user_id: userId });

    // Verify roles exist
    const roles = await this.roleRepo.find({
      where: { id: In(roleIds) },
    });

    if (roles.length !== roleIds.length) {
      throw new NotFoundException("One or more roles not found");
    }

    // Assign new roles
    const userRoles = roleIds.map((roleId) =>
      this.userRoleRepo.create({ user_id: userId, role_id: roleId }),
    );

    await this.userRoleRepo.save(userRoles);
    this.logger.log("SUCCESS::UserService::assignRoles", userId, roleIds);
  }

  async getUserRoles(userId: number): Promise<Role[]> {
    this.logger.log("START::UserService::getUserRoles", userId);
    const userRoles = await this.userRoleRepo.find({
      where: { user_id: userId },
      relations: ["role"],
    });

    this.logger.log("SUCCESS::UserService::getUserRoles", userId);
    return userRoles.map((ur) => ur.role);
  }

  async generatePasswordResetToken(email: string): Promise<string> {
    this.logger.log("START::UserService::generatePasswordResetToken", email);
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException("User with this email not found");
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour

    user.password_reset_token = resetToken;
    user.password_reset_expires = resetExpires;
    await this.userRepo.save(user);

    this.logger.log("SUCCESS::UserService::generatePasswordResetToken", email);
    return resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    this.logger.log("START::UserService::resetPassword", token, newPassword);
    const user = await this.userRepo.findOne({
      where: { password_reset_token: token },
    });

    if (
      !user ||
      !user.password_reset_expires ||
      user.password_reset_expires < new Date()
    ) {
      throw new ConflictException("Invalid or expired reset token");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.password_hash = passwordHash;
    user.password_reset_token = null;
    user.password_reset_expires = null;

    await this.userRepo.save(user);
    this.logger.log("SUCCESS::UserService::resetPassword", token, newPassword);
  }

  async resendInvitation(userId: number): Promise<{ message: string }> {
    this.logger.log("START::UserService::resendInvitation", userId);
    const user = await this.findOneRaw(userId);

    // Check if user already set their password
    if (user.password_hash && user.password_hash !== "") {
      throw new ConflictException("User has already set their password");
    }

    // Generate new invitation token
    const invitationToken = crypto.randomBytes(32).toString("hex");
    const invitationExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    user.invitation_token = invitationToken;
    user.invitation_expires = invitationExpires;
    await this.userRepo.save(user);

    // Send invitation email
    await this.emailService.sendInvitationEmail(
      user.email,
      user.username,
      invitationToken,
    );

    this.logger.log("SUCCESS::UserService::resendInvitation", userId);
    return { message: "Invitation email resent successfully" };
  }

  async setPassword(token: string, password: string): Promise<void> {
    this.logger.log("START::UserService::setPassword", token, password);
    const user = await this.userRepo.findOne({
      where: { invitation_token: token },
    });

    if (
      !user ||
      !user.invitation_expires ||
      user.invitation_expires < new Date()
    ) {
      throw new ConflictException("Invalid or expired invitation token");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    user.password_hash = passwordHash;
    user.invitation_token = null;
    user.invitation_expires = null;

    await this.userRepo.save(user);
    this.logger.log("SUCCESS::UserService::setPassword", token, password);
  }

  // Export methods
  private async getUsersForExport(
    ouId?: number,
    status?: string,
  ): Promise<User[]> {
    this.logger.log("START::UserService::getUsersForExport", ouId, status);
    const qb = this.userRepo
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.org", "org")
      .leftJoinAndSelect("user.userRoles", "userRoles")
      .leftJoinAndSelect("userRoles.role", "role")
      .orderBy("user.created_at", "DESC");

    if (ouId) {
      qb.where("user.ou_id = :ouId", { ouId });
    }

    if (status) {
      qb.andWhere("user.user_status = :status", {
        status: status.toUpperCase(),
      });
    }

    this.logger.log("SUCCESS::UserService::getUsersForExport", ouId, status);
    return await qb.getMany();
  }

  private mapUserToExportRow(user: User): any {
    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      name: user.name || "",
      company_title: user.company_title || "",
      organization: user.org?.ou_name || "",
      roles: user.userRoles?.map((ur) => ur.role?.name).join(", ") || "",
      status: user.user_status,
      created_at: user.created_at?.toISOString() || "",
      updated_at: user.updated_at?.toISOString() || "",
    };
  }

  async exportUsersToExcel(ouId?: number, status?: string): Promise<Buffer> {
    const users = await this.getUsersForExport(ouId, status);
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Users");

    worksheet.columns = [
      { header: "User ID", key: "user_id", width: 10 },
      { header: "Username", key: "username", width: 20 },
      { header: "Email", key: "email", width: 30 },
      { header: "Name", key: "name", width: 25 },
      { header: "Company Title", key: "company_title", width: 25 },
      { header: "Organization", key: "organization", width: 25 },
      { header: "Roles", key: "roles", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Created At", key: "created_at", width: 20 },
      { header: "Updated At", key: "updated_at", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };

    for (const user of users) {
      worksheet.addRow(this.mapUserToExportRow(user));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportUsersToCsv(ouId?: number, status?: string): Promise<Buffer> {
    const users = await this.getUsersForExport(ouId, status);
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Users");

    worksheet.columns = [
      { header: "User ID", key: "user_id", width: 10 },
      { header: "Username", key: "username", width: 20 },
      { header: "Email", key: "email", width: 30 },
      { header: "Name", key: "name", width: 25 },
      { header: "Company Title", key: "company_title", width: 25 },
      { header: "Organization", key: "organization", width: 25 },
      { header: "Roles", key: "roles", width: 30 },
      { header: "Status", key: "status", width: 15 },
      { header: "Created At", key: "created_at", width: 20 },
      { header: "Updated At", key: "updated_at", width: 20 },
    ];

    for (const user of users) {
      worksheet.addRow(this.mapUserToExportRow(user));
    }

    const buffer = await workbook.csv.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportUsersToJson(ouId?: number, status?: string): Promise<Buffer> {
    const users = await this.getUsersForExport(ouId, status);
    const rows = users.map((user) => this.mapUserToExportRow(user));
    return Buffer.from(JSON.stringify(rows, null, 2));
  }
}
