import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, Brackets } from "typeorm";
import { Role } from "../../entities/role.entity";
import { RolePermission } from "../../entities/role-permission.entity";
import { Permission } from "../../entities/permission.entity";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(RolePermission)
    private rolePermRepo: Repository<RolePermission>,
    @InjectRepository(Permission)
    private permRepo: Repository<Permission>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(createDto: CreateRoleDto): Promise<Role> {
    // Check if role name already exists
    const existingRole = await this.roleRepo.findOne({
      where: { name: createDto.name },
    });

    if (existingRole) {
      throw new ConflictException("Role name already exists");
    }

    const role = this.roleRepo.create({
      name: createDto.name,
      label: createDto.label,
      icon: createDto.icon,
      icon_color: createDto.icon_color,
      description: createDto.description,
    });

    const savedRole = await this.roleRepo.save(role);

    // Assign permissions if provided
    if (createDto.permission_ids && createDto.permission_ids.length > 0) {
      await this.assignPermissions(savedRole.id, createDto.permission_ids);
    }

    this.systemActivityService.logCreated("role", savedRole.id, savedRole.label || savedRole.name).catch(() => {});

    return this.findOne(savedRole.id);
  }

  async findAll(
    search?: string,
    status?: string,
    module?: string,
  ): Promise<Role[]> {
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
  }

  async findOne(id: number): Promise<Role> {
    const role = await this.roleRepo.findOne({
      where: { id },
      relations: ["rolePermissions", "rolePermissions.permission"],
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return role;
  }

  async update(id: number, updateDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id);

    // Check for duplicate name if updating
    if (updateDto.name && updateDto.name !== role.name) {
      const existingRole = await this.roleRepo.findOne({
        where: { name: updateDto.name },
      });
      if (existingRole) {
        throw new ConflictException("Role name already exists");
      }
    }

    Object.assign(role, {
      name: updateDto.name ?? role.name,
      label: updateDto.label ?? role.label,
      icon: updateDto.icon ?? role.icon,
      icon_color: updateDto.icon_color ?? role.icon_color,
      description: updateDto.description ?? role.description,
      status: updateDto.status ?? role.status,
    });

    const updatedRole = await this.roleRepo.save(role);

    // Update permissions if provided
    if (updateDto.permission_ids) {
      await this.assignPermissions(id, updateDto.permission_ids);
    }

    this.systemActivityService.logUpdated("role", id, updatedRole.label || updatedRole.name).catch(() => {});

    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const role = await this.findOne(id);
    const roleName = role.label || role.name;
    // Also remove permissions for this role
    await this.rolePermRepo.delete({ role_id: id });
    await this.roleRepo.remove(role);
    this.systemActivityService.logDeleted("role", id, roleName).catch(() => {});
  }

  async clearAllPermissions(): Promise<void> {
    // Delete ALL role_permissions
    await this.rolePermRepo.delete({});
  }

  async assignPermissions(
    roleId: number,
    permissionIds: number[],
  ): Promise<void> {
    // Remove existing permissions
    await this.rolePermRepo.delete({ role_id: roleId });

    if (permissionIds.length === 0) return;

    // Verify permissions exist
    const permissions = await this.permRepo.find({
      where: { id: In(permissionIds) },
    });

    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException("One or more permissions not found");
    }

    // Assign new permissions
    const rolePerms = permissionIds.map((permId) =>
      this.rolePermRepo.create({ role_id: roleId, permission_id: permId }),
    );

    await this.rolePermRepo.save(rolePerms);
  }

  async getRolePermissions(roleId: number): Promise<Permission[]> {
    const rolePerms = await this.rolePermRepo.find({
      where: { role_id: roleId },
      relations: ["permission"],
    });

    return rolePerms.map((rp) => rp.permission);
  }
}
