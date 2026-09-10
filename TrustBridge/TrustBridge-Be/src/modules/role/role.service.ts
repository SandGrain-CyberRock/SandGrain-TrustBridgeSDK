import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repository, In, Brackets } from "typeorm";

import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { Permission } from "../../entities/permission.entity";
import { RolePermission } from "../../entities/role-permission.entity";
import { Role } from "../../entities/role.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);
  constructor(
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permRepo: Repository<Permission>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(createDto: CreateRoleDto): Promise<Role> {
    try {
      this.logger.log("START::RoleService::create", createDto);
      // step 1: check if role name already exists
      const existingRole = await this.roleRepo.findOne({
        where: { name: createDto.name },
      });

      if (existingRole) {
        throw new ConflictException("Role name already exists");
      }

      // step 2: create role
      const role = this.roleRepo.create({
        name: createDto.name,
        label: createDto.label,
        icon: createDto.icon,
        icon_color: createDto.icon_color,
        description: createDto.description,
      });

      const savedRole = await this.roleRepo.save(role);

      // step 3: assign permissions if provided
      if (createDto.permission_ids && createDto.permission_ids.length > 0) {
        await this.assignPermissions(savedRole.id, createDto.permission_ids);
      }

      // step 4: log activity
      this.systemActivityService.logCreated("role", savedRole.id, savedRole.label || savedRole.name).catch(() => { });
      this.logger.log("SUCCESS::RoleService::create", createDto);

      return savedRole;
    } catch (error) {
      this.logger.error("ERROR::RoleService::create", error, createDto);
      throw error;
    }
  }

  async findAll(
    search?: string,
    status?: string,
    module?: string,
  ): Promise<Role[]> {
    try {
      this.logger.log("START::RoleService::findAll", search, status, module);

      const qb = this.roleRepo
        .createQueryBuilder("role")
        .leftJoinAndSelect("role.rolePermissions", "rp")
        .leftJoinAndSelect("rp.permission", "p")
        .orderBy("role.created_at", "DESC");

      if (search) {
        qb.andWhere(
          new Brackets((qb2) => {
            qb2
              .where("role.name LIKE :search", { search: `%${search}%` })
              .orWhere("role.label LIKE :search", { search: `%${search}%` })
              .orWhere(
                (qb3) =>
                  `role.id IN ${qb3
                    .subQuery()
                    .select("rp3.role_id")
                    .from(RolePermission, "rp3")
                    .innerJoin("rp3.permission", "p3")
                    .where("p3.module LIKE :search", {
                      search: `%${search}%`,
                    })
                    .getQuery()}`,
              );
          }),
        );
      }

      if (status) {
        qb.andWhere("role.status = :status", { status });
      }

      if (module) {
        qb.andWhere("p.module = :module", { module });
      }

      return qb.getMany();

    } catch (error) {
      this.logger.error("ERROR::RoleService::findAll", error, search, status, module);
      throw error;
    }
  }

  async findOne(id: number): Promise<Role> {
    try {
      this.logger.log("START::RoleService::findOne", id);
      const role = await this.roleRepo.findOne({
        where: { id },
        relations: ["rolePermissions", "rolePermissions.permission"],
      });

      if (!role) {
        throw new NotFoundException(`Role with ID ${id} not found`);
      }

      this.logger.log("SUCCESS::RoleService::findOne", id);
      return role;
    } catch (error) {
      this.logger.error("ERROR::RoleService::findOne", error, id);
      throw error;
    }
  }

  async update(id: number, updateDto: UpdateRoleDto): Promise<Role> {
    try {
      this.logger.log("START::RoleService::update", id, updateDto);
      const role = await this.findOne(id);

      // step 1: check for duplicate name if updating
      if (updateDto.name && updateDto.name !== role.name) {
        const existingRole = await this.roleRepo.findOne({
          where: { name: updateDto.name },
        });
        if (existingRole) {
          throw new ConflictException("Role name already exists");
        }
      }

      // step 2: update role
      Object.assign(role, {
        name: updateDto.name ?? role.name,
        label: updateDto.label ?? role.label,
        icon: updateDto.icon ?? role.icon,
        icon_color: updateDto.icon_color ?? role.icon_color,
        description: updateDto.description ?? role.description,
        status: updateDto.status ?? role.status,
      });

      const updatedRole = await this.roleRepo.save(role);

      // step 3: update permissions if provided
      if (updateDto.permission_ids) {
        await this.assignPermissions(id, updateDto.permission_ids);
      }

      // step 4: log activity
      this.systemActivityService.logUpdated("role", id, updatedRole.label || updatedRole.name).catch(() => { });
      this.logger.log("SUCCESS::RoleService::update", id, updateDto);
      return updatedRole;
    } catch (error) {
      this.logger.error("ERROR::RoleService::update", error, id, updateDto);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::RoleService::remove", id);
      // step 1: get role
      const role = await this.findOne(id);
      const roleName = role.label || role.name;
      // step 2: remove permissions for this role
      await this.rolePermRepo.delete({ role_id: id });
      await this.roleRepo.remove(role);
      // step 3: log activity
      this.systemActivityService.logDeleted("role", id, roleName).catch(() => { });
      this.logger.log("SUCCESS::RoleService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::RoleService::remove", error, id);
      throw error;
    }
  }

  async clearAllPermissions(): Promise<void> {
    try {
      this.logger.log("START::RoleService::clearAllPermissions");
      // Delete ALL role_permissions
      await this.rolePermRepo.delete({});
      this.logger.log("SUCCESS::RoleService::clearAllPermissions");
    } catch (error) {
      this.logger.error("ERROR::RoleService::clearAllPermissions", error);
      throw error;
    }
  }

  async assignPermissions(
    roleId: number,
    permissionIds: number[],
  ): Promise<void> {
    try {
      this.logger.log("START::RoleService::assignPermissions", roleId, permissionIds);

      // step 1: remove existing permissions
      await this.rolePermRepo.delete({ role_id: roleId });

      if (permissionIds.length === 0) return;

      // step 2: verify permissions exist
      const permissions = await this.permRepo.find({
        where: { id: In(permissionIds) },
      });

      if (permissions.length !== permissionIds.length) {
        throw new NotFoundException("One or more permissions not found");
      }

      // step 3: assign new permissions
      const rolePerms = permissionIds.map((permId) =>
        this.rolePermRepo.create({ role_id: roleId, permission_id: permId }),
      );

      // step 4: save role permissions
      await this.rolePermRepo.save(rolePerms);
      this.logger.log("SUCCESS::RoleService::assignPermissions", roleId, permissionIds);
    } catch (error) {
      this.logger.error("ERROR::RoleService::assignPermissions", error, roleId, permissionIds);
      throw error;
    }
  }

  async getRolePermissions(roleId: number): Promise<Permission[]> {
    try {
      this.logger.log("START::RoleService::getRolePermissions", roleId);
      const rolePerms = await this.rolePermRepo.find({
        where: { role_id: roleId },
        relations: ["permission"],
      });

      this.logger.log("SUCCESS::RoleService::getRolePermissions", roleId);
      return rolePerms.map((rp) => rp.permission);
    } catch (error) {
      this.logger.error("ERROR::RoleService::getRolePermissions", error, roleId);
      throw error;
    }
  }
}
