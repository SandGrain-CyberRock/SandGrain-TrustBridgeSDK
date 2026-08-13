import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from '../../entities/permission.entity';
import { SystemActivityService } from '../system-activity/system-activity.service';

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  constructor(
    @InjectRepository(Permission)
    private permRepo: Repository<Permission>,
    private systemActivityService: SystemActivityService,
  ) { }

  async create(createDto: CreatePermissionDto): Promise<Permission> {
    try {
      this.logger.log("START::PermissionService::create", createDto);
      // step 1: check if permission key already exists
      const existingPerm = await this.permRepo.findOne({
        where: { key: createDto.key },
      });

      if (existingPerm) {
        throw new ConflictException('Permission key already exists');
      }
      // step 2: create permission
      const permission = this.permRepo.create(createDto);
      const saved = await this.permRepo.save(permission);
      // step 3: log activity
      this.systemActivityService.logCreated("permission", saved.id, saved.key).catch(() => { });
      this.logger.log("SUCCESS::PermissionService::create", createDto);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::PermissionService::create", error, createDto);
      throw error;
    }
  }

  async findAll(): Promise<Permission[]> {
    try {
      this.logger.log("START::PermissionService::findAll");
      const data = await this.permRepo.find({
        order: { module: 'ASC', action: 'ASC' },
      });
      this.logger.log("SUCCESS::PermissionService::findAll");
      return data;
    } catch (error) {
      this.logger.error("ERROR::PermissionService::findAll", error);
      throw error;
    }
  }

  async findByModule(module: string): Promise<Permission[]> {
    try {
      this.logger.log("START::PermissionService::findByModule", module);
      const data = await this.permRepo.find({
        where: { module },
        order: { action: 'ASC' },
      });
      this.logger.log("SUCCESS::PermissionService::findByModule", module);
      return data;
    } catch (error) {
      this.logger.error("ERROR::PermissionService::findByModule", error, module);
      throw error;
    }
  }

  async findOne(id: number): Promise<Permission> {
    try {
      this.logger.log("START::PermissionService::findOne", id);
      const permission = await this.permRepo.findOne({ where: { id } });
      if (!permission) {
        throw new NotFoundException(`Permission with ID ${id} not found`);
      }
      this.logger.log("SUCCESS::PermissionService::findOne", id);
      return permission;
    } catch (error) {
      this.logger.error("ERROR::PermissionService::findOne", error, id);
      throw error;
    }
  }

  async update(
    id: number,
    updateDto: UpdatePermissionDto,
  ): Promise<Permission> {
    try {
      this.logger.log("START::PermissionService::update", id, updateDto);
      // step 1: check if permission exists
      const permission = await this.findOne(id);

      // step 2: check for duplicate key if updating
      if (updateDto.key && updateDto.key !== permission.key) {
        const existingPerm = await this.permRepo.findOne({
          where: { key: updateDto.key },
        });
        if (existingPerm) {
          throw new ConflictException('Permission key already exists');
        }
      }

      // step 3: update permission
      Object.assign(permission, updateDto);
      const saved = await this.permRepo.save(permission);
      // step 4: log activity
      this.systemActivityService.logUpdated("permission", id, saved.key).catch(() => { });
      this.logger.log("SUCCESS::PermissionService::update", id, updateDto);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::PermissionService::update", error, id, updateDto);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::PermissionService::remove", id);
      const permission = await this.findOne(id);
      const permKey = permission.key;
      await this.permRepo.remove(permission);
      this.systemActivityService.logDeleted("permission", id, permKey).catch(() => { });
      this.logger.log("SUCCESS::PermissionService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::PermissionService::remove", error, id);
      throw error;
    }
  }

  async getModules(): Promise<string[]> {
    try {
      this.logger.log("START::PermissionService::getModules");

      const result = await this.permRepo
        .createQueryBuilder('permission')
        .select('DISTINCT permission.module', 'module')
        .orderBy('permission.module', 'ASC')
        .getRawMany();

      this.logger.log("SUCCESS::PermissionService::getModules");

      return result.map((r) => r.module);
    } catch (error) {
      this.logger.error("ERROR::PermissionService::getModules", error);
      throw error;
    }
  }
}