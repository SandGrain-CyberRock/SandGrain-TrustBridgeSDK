import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repository, Like, In } from "typeorm";

import { CreateDeviceGroupDto } from "./dto/create-device-group.dto";
import { UpdateDeviceGroupDto } from "./dto/update-device-group.dto";
import { DeviceGroup } from "../../entities/device-group.entity";
import { SystemActivityService } from "../system-activity/system-activity.service";
import { TenantApiService } from "../tenant-api/tenant-api.service";

@Injectable()
export class DeviceGroupService {
  private readonly logger = new Logger(DeviceGroupService.name);
  constructor(
    @InjectRepository(DeviceGroup)
    private deviceGroupRepo: Repository<DeviceGroup>,
    private systemActivityService: SystemActivityService,
    private tenantApiService: TenantApiService,
  ) { }

  async create(
    createDto: CreateDeviceGroupDto,
    tenantIds: string[],
  ): Promise<DeviceGroup> {
    try {
      this.logger.log("START::DeviceGroupService::create", createDto, tenantIds);
      // step 1: Check for duplicate device group name
      const existingGroup = await this.deviceGroupRepo.findOne({
        where: { group_name: createDto.group_name },
      });

      if (existingGroup) {
        throw new ConflictException(
          `Device group with name "${createDto.group_name}" already exists`,
        );
      }

      const tenantId = createDto.tenant_id || tenantIds[0];

      // step 2: Create the IoT device in Sandgrain and get the iotId back
      const iotResponse = await this.tenantApiService.createIot(tenantId, {
        username: createDto.group_name,
        password: createDto.password,
      });
      const group_id =
        iotResponse?.iotId ?? iotResponse?.id ?? iotResponse?.deviceId ?? "";

      // step 3: Create the device group
      const group = this.deviceGroupRepo.create({
        group_id,
        group_name: createDto.group_name,
        password: createDto.password,
        tenant_id: tenantId,
      });
      const saved = await this.deviceGroupRepo.save(group);

      // step 3: Log device group creation activity
      this.systemActivityService
        .logDeviceGroupCreated(saved.device_group_id, saved.group_name)
        .catch(() => { });

      this.logger.log("SUCCESS::DeviceGroupService::create", createDto, tenantIds);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::DeviceGroupService::create", error, createDto, tenantIds);
      throw error;
    }
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    tenantIds?: string[],
  ): Promise<{ data: DeviceGroup[]; total: number }> {
    try {
      this.logger.log("START::DeviceGroupService::findAll", page, limit, search, status, tenantIds);
      const skip = (page - 1) * limit;

      // Build where conditions
      const conditions: Record<string, any> = {};
      if (search) conditions.group_name = Like(`%${search}%`);
      if (status) conditions.status = status;

      // Filter by tenant_ids if provided (organization-based filtering)
      if (tenantIds && tenantIds.length > 0) {
        conditions.tenant_id = In(tenantIds);
      }

      const [data, total] = await this.deviceGroupRepo.findAndCount({
        where: conditions,
        order: { created_at: "DESC" },
        skip,
        take: limit,
      });

      this.logger.log("SUCCESS::DeviceGroupService::findAll", page, limit, search, status, tenantIds);
      return { data, total };
    } catch (error) {
      this.logger.error("ERROR::DeviceGroupService::findAll", error, page, limit, search, status, tenantIds);
      throw error;
    }
  }

  async findOne(id: number): Promise<DeviceGroup> {
    try {
      this.logger.log("START::DeviceGroupService::findOne", id);
      const group = await this.deviceGroupRepo.findOne({
        where: { device_group_id: id },
      });
      if (!group) {
        throw new NotFoundException(`Device group with ID ${id} not found`);
      }
      this.logger.log("SUCCESS::DeviceGroupService::findOne", id);
      return group;
    } catch (error) {
      this.logger.error("ERROR::DeviceGroupService::findOne", error, id);
      throw error;
    }
  }

  async update(
    id: number,
    updateDto: UpdateDeviceGroupDto,
  ): Promise<DeviceGroup> {
    try {
      this.logger.log("START::DeviceGroupService::update", id, updateDto);
      const group = await this.findOne(id);
      const passwordChanged =
        updateDto.password && updateDto.password !== group.password;

      if (updateDto.group_name && updateDto.group_name !== group.group_name) {
        const existingGroup = await this.deviceGroupRepo.findOne({
          where: { group_name: updateDto.group_name },
        });

        if (existingGroup) {
          throw new ConflictException(
            `Device group with name "${updateDto.group_name}" already exists`,
          );
        }
      }

      Object.assign(group, updateDto);
      const saved = await this.deviceGroupRepo.save(group);

      // Log password change activity
      if (passwordChanged) {
        this.systemActivityService
          .logDeviceGroupPasswordChanged(saved.device_group_id, saved.group_name)
          .catch(() => { });
      }

      this.logger.log("SUCCESS::DeviceGroupService::update", id, updateDto);
      return saved;
    } catch (error) {
      this.logger.error("ERROR::DeviceGroupService::update", error, id, updateDto);
      throw error;
    }
  }

  async remove(id: number): Promise<void> {
    try {
      this.logger.log("START::DeviceGroupService::remove", id);
      const group = await this.findOne(id);
      await this.deviceGroupRepo.softRemove(group);
      this.systemActivityService.logDeleted("device_group", id, group.group_name).catch(() => { });
      this.logger.log("SUCCESS::DeviceGroupService::remove", id);
    } catch (error) {
      this.logger.error("ERROR::DeviceGroupService::remove", error, id);
      throw error;
    }
  }
}