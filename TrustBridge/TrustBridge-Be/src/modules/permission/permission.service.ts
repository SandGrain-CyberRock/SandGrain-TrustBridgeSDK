import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../../entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { SystemActivityService } from '../system-activity/system-activity.service';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private permRepo: Repository<Permission>,
    private systemActivityService: SystemActivityService,
  ) {}

  async create(createDto: CreatePermissionDto): Promise<Permission> {
    // Check if permission key already exists
    const existingPerm = await this.permRepo.findOne({
      where: { key: createDto.key },
    });

    if (existingPerm) {
      throw new ConflictException('Permission key already exists');
    }

    const permission = this.permRepo.create(createDto);
    const saved = await this.permRepo.save(permission);
    this.systemActivityService.logCreated("permission", saved.id, saved.key).catch(() => {});
    return saved;
  }

  async findAll(): Promise<Permission[]> {
    return this.permRepo.find({
      order: { module: 'ASC', action: 'ASC' },
    });
  }

  async findByModule(module: string): Promise<Permission[]> {
    return this.permRepo.find({
      where: { module },
      order: { action: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.permRepo.findOne({ where: { id } });
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return permission;
  }

  async update(
    id: number,
    updateDto: UpdatePermissionDto,
  ): Promise<Permission> {
    const permission = await this.findOne(id);

    // Check for duplicate key if updating
    if (updateDto.key && updateDto.key !== permission.key) {
      const existingPerm = await this.permRepo.findOne({
        where: { key: updateDto.key },
      });
      if (existingPerm) {
        throw new ConflictException('Permission key already exists');
      }
    }

    Object.assign(permission, updateDto);
    const saved = await this.permRepo.save(permission);
    this.systemActivityService.logUpdated("permission", id, saved.key).catch(() => {});
    return saved;
  }

  async remove(id: number): Promise<void> {
    const permission = await this.findOne(id);
    const permKey = permission.key;
    await this.permRepo.remove(permission);
    this.systemActivityService.logDeleted("permission", id, permKey).catch(() => {});
  }

  async getModules(): Promise<string[]> {
    const result = await this.permRepo
      .createQueryBuilder('permission')
      .select('DISTINCT permission.module', 'module')
      .orderBy('permission.module', 'ASC')
      .getRawMany();

    return result.map((r) => r.module);
  }
}
