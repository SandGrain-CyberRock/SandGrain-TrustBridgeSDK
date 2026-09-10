import * as crypto from "crypto";

import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import * as bcrypt from "bcrypt";
import { Workbook } from "exceljs";
import { generateStrongPassword } from "src/common/helpers";
import { Repository, In } from "typeorm";

import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { getWorksheetColumns, mapUserToExportRow, sanitizeUser } from "./helpers";
import { EmailService } from "../../common/services/email.service";
import { Role } from "../../entities/role.entity";
import { UserRole } from "../../entities/user-role.entity";
import { User } from "../../entities/user.entity";
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

  async create(createDto: CreateUserDto) {
    try {
      this.logger.log("START::UserService::create", createDto);
      // step 1: check if username or email already exists
      const existingUser = await this.userRepo.findOne({
        where: [{ username: createDto.username }, { email: createDto.email }],
      });

      if (existingUser) {
        throw new ConflictException("Username or email already exists");
      }

      // step 2: generate strong default password
      const defaultPassword = generateStrongPassword();
      const passwordHash = await bcrypt.hash(defaultPassword, 12);

      // step 3: create user
      const user = this.userRepo.create({
        ou_id: createDto.ou_id,
        name: createDto.name || null,
        company_title: createDto.company_title || null,
        username: createDto.username,
        email: createDto.email,
        password_hash: passwordHash,
        user_status: "ACTIVE",
        must_change_password: true,
      });

      const savedUser = await this.userRepo.save(user);

      // step 4: assign role if provided
      if (createDto.role_id) {
        await this.assignRole(savedUser.user_id, createDto.role_id);
      }

      // step 5: send credentials email in background — don't block the response
      this.emailService
        .sendActivationEmail(savedUser.email, savedUser.name || savedUser.username, savedUser.username, defaultPassword)
        .catch((err) => console.error("Failed to send welcome email:", err));

      const created = await this.findOneRaw(savedUser.user_id);
      this.systemActivityService.logCreated("user", savedUser.user_id, savedUser.name || savedUser.username).catch(() => { });
      this.logger.log("SUCCESS::UserService::create", createDto);
      return { ...sanitizeUser(created), generatedPassword: defaultPassword };
    } catch (error) {
      this.logger.error("ERROR::UserService::create", error, createDto);
      throw error;
    }
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
    try {
      this.logger.log("START::UserService::findAll", page, limit, search, ouId, status, role);
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
      const sanitizedUsers = users.map((user) => sanitizeUser(user));

      return {
        users: sanitizedUsers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error("ERROR::UserService::findAll", error, page, limit, search, ouId, status, role);
      throw error;
    }
  }

  // TODO: Add pagination
  async searchUsers(query: string, ouId?: number): Promise<any[]> {
    try {
      this.logger.log("START::UserService::searchUsers", query, ouId);
      const qb = this.userRepo
        .createQueryBuilder("user")
        .leftJoinAndSelect("user.org", "org")
        .leftJoinAndSelect("user.userRoles", "userRoles")
        .leftJoinAndSelect("userRoles.role", "role");

      if (ouId) {
        qb.where("user.ou_id = :ouId", { ouId });
      }

      const isNumeric = /^\d+$/.test(query);
      const searchCondition = ouId ? "AND" : "WHERE";

      if (isNumeric) {
        qb.andWhere(
          `${searchCondition} (user.user_id = :id OR user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)`,
          { id: Number(query), q: `%${query}%` },
        );
      } else {
        qb.andWhere(
          `${searchCondition} (user.username LIKE :q OR user.email LIKE :q OR user.name LIKE :q OR user.company_title LIKE :q)`,
          { q: `%${query}%` },
        );
      }

      const users = await qb.orderBy("user.created_at", "DESC").getMany();
      this.logger.log("SUCCESS::UserService::searchUsers", query, ouId);
      return users.map((user) => sanitizeUser(user));
    } catch (error) {
      this.logger.error("ERROR::UserService::searchUsers", error, query, ouId);
      throw error;
    }
  }

  private async findOneRaw(id: number): Promise<User> {
    try {
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
    } catch (error) {
      this.logger.error("ERROR::UserService::findOneRaw", error, id);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      this.logger.log("START::UserService::findOne", id);
      const user = await this.findOneRaw(id);
      this.logger.log("SUCCESS::UserService::findOne", id);
      return sanitizeUser(user);
    } catch (error) {
      this.logger.error("ERROR::UserService::findOne", error, id);
      throw error;
    }
  }

  async update(id: number, updateDto: UpdateUserDto) {
    try {
      this.logger.log("START::UserService::update", id, updateDto);
      // step 1: find user
      const user = await this.findOneRaw(id);

      // step 2: update user
      if (updateDto.name !== undefined) user.name = updateDto.name;
      if (updateDto.company_title !== undefined)
        user.company_title = updateDto.company_title;
      if (updateDto.user_status) user.user_status = updateDto.user_status;

      await this.userRepo.save(user);

      // step 3: update role if provided
      if (updateDto.role_id) {
        await this.assignRole(id, updateDto.role_id);
      }

      const updated = await this.findOneRaw(id);
      // step 4: log activity
      this.systemActivityService.logUpdated("user", id, updated.name || updated.username).catch(() => { });
      return sanitizeUser(updated);
    } catch (error) {
      this.logger.error("ERROR::UserService::update", error, id, updateDto);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::UserService::remove", id);
      // step 1: find user
      const user = await this.findOneRaw(id);
      await this.userRepo.softRemove(user);
      this.systemActivityService.logDeleted("user", id, user.name || user.username).catch(() => { });
      this.logger.log("SUCCESS::UserService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::UserService::remove", error, id);
      throw error;
    }
  }

  async assignRole(userId: number, roleId: number): Promise<void> {
    try {
      this.logger.log("START::UserService::assignRole", userId, roleId);
      // step 1: verify user exists
      await this.findOneRaw(userId);

      // step 2: verify role exists
      const role = await this.roleRepo.findOne({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(`Role with ID ${roleId} not found`);
      }

      // step 3: remove existing role
      await this.userRoleRepo.delete({ user_id: userId });

      // step 4: assign new role
      const userRole = this.userRoleRepo.create({
        user_id: userId,
        role_id: roleId,
      });

      // step 5: save user role
      await this.userRoleRepo.save(userRole);
      this.logger.log("SUCCESS::UserService::assignRole", userId, roleId);
    } catch (error) {
      this.logger.error("ERROR::UserService::assignRole", error, userId, roleId);
      throw error;
    }
  }

  async getUserRole(userId: number): Promise<Role | null> {
    try {
      this.logger.log("START::UserService::getUserRole", userId);
      const userRole = await this.userRoleRepo.findOne({
        where: { user_id: userId },
        relations: ["role"],
      });
      this.logger.log("SUCCESS::UserService::getUserRole", userId);
      return userRole ? userRole.role : null;
    } catch (error) {
      this.logger.error("ERROR::UserService::getUserRole", error, userId);
      throw error;
    }
  }

  async assignRoles(userId: number, roleIds: number[]): Promise<void> {
    try {
      this.logger.log("START::UserService::assignRoles", userId, roleIds);
      // step 1: remove existing roles
      await this.userRoleRepo.delete({ user_id: userId });

      // step 2: verify roles exist
      const roles = await this.roleRepo.find({
        where: { id: In(roleIds) },
      });

      if (roles.length !== roleIds.length) {
        throw new NotFoundException("One or more roles not found");
      }

      // step 3: assign new roles at one go
      const userRoles = roleIds.map((roleId) =>
        this.userRoleRepo.create({ user_id: userId, role_id: roleId }),
      );

      await this.userRoleRepo.save(userRoles);
      this.logger.log("SUCCESS::UserService::assignRoles", userId, roleIds);
    } catch (error) {
      this.logger.error("ERROR::UserService::assignRoles", error, userId, roleIds);
      throw error;
    }
  }

  async getUserRoles(userId: number): Promise<Role[]> {
    try {
      this.logger.log("START::UserService::getUserRoles", userId);
      const userRoles = await this.userRoleRepo.find({
        where: { user_id: userId },
        relations: ["role"],
      });

      return userRoles.map((ur) => ur.role);
      this.logger.log("SUCCESS::UserService::getUserRoles", userId);
    } catch (error) {
      this.logger.error("ERROR::UserService::getUserRoles", error, userId);
      throw error;
    }
  }

  async generatePasswordResetToken(email: string): Promise<string> {
    try {
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
    } catch (error) {
      this.logger.error("ERROR::UserService::generatePasswordResetToken", error, email);
      throw error;
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.error("ERROR::UserService::resetPassword", error, token, newPassword);
      throw error;
    }
  }

  async resendInvitation(userId: number): Promise<{ message: string }> {
    try {
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
    } catch (error) {
      this.logger.error("ERROR::UserService::resendInvitation", error, userId);
      throw error;
    }
  }

  async setPassword(token: string, password: string): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.error("ERROR::UserService::setPassword", error, token, password);
      throw error;
    }
  }

  // Export methods
  private async getUsersForExport(
    ouId?: number,
    status?: string,
  ): Promise<User[]> {
    try {
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

      const users = await qb.getMany();
      this.logger.log("SUCCESS::UserService::getUsersForExport", ouId, status);
      return users;
    } catch (error) {
      this.logger.error("ERROR::UserService::getUsersForExport", error, ouId, status);
      throw error;
    }
  }


  async exportUsersToExcel(ouId?: number, status?: string): Promise<Buffer> {
    try {
      this.logger.log("START::UserService::exportUsersToExcel", ouId, status);
      const users = await this.getUsersForExport(ouId, status);
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Users");

      worksheet.columns = getWorksheetColumns()

      worksheet.getRow(1).font = { bold: true };

      for (const user of users) {
        worksheet.addRow(mapUserToExportRow(user));
      }

      const buffer = await workbook.xlsx.writeBuffer();
      this.logger.log("SUCCESS::UserService::exportUsersToExcel", ouId, status);
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error("ERROR::UserService::exportUsersToExcel", error, ouId, status);
      throw error;
    }
  }

  async exportUsersToCsv(ouId?: number, status?: string): Promise<Buffer> {
    try {
      this.logger.log("START::UserService::exportUsersToCsv", ouId, status);
      const users = await this.getUsersForExport(ouId, status);
      const workbook = new Workbook();
      const worksheet = workbook.addWorksheet("Users");

      worksheet.columns = getWorksheetColumns()

      for (const user of users) {
        worksheet.addRow(mapUserToExportRow(user));
      }

      const buffer = await workbook.csv.writeBuffer();
      this.logger.log("SUCCESS::UserService::exportUsersToCsv", ouId, status);
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error("ERROR::UserService::exportUsersToCsv", error, ouId, status);
      throw error;
    }
  }

  async exportUsersToJson(ouId?: number, status?: string): Promise<Buffer> {
    try {
      this.logger.log("START::UserService::exportUsersToJson", ouId, status);
      const users = await this.getUsersForExport(ouId, status);
      const rows = users.map((user) => mapUserToExportRow(user));
      this.logger.log("SUCCESS::UserService::exportUsersToJson", ouId, status);
      return Buffer.from(JSON.stringify(rows, null, 2));
    } catch (error) {
      this.logger.error("ERROR::UserService::exportUsersToJson", error, ouId, status);
      throw error;
    }
  }
}
