import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, In } from "typeorm";
import { DeviceGroup } from "../../entities/device-group.entity";
import { CreateDeviceGroupDto } from "./dto/create-device-group.dto";
import { UpdateDeviceGroupDto } from "./dto/update-device-group.dto";
import { SystemActivityService } from "../system-activity/system-activity.service";
import { TenantApiService } from "../tenant-api/tenant-api.service";

@Injectable()
export class DeviceGroupService {
  constructor(
    @InjectRepository(DeviceGroup)
    private deviceGroupRepo: Repository<DeviceGroup>,
    private systemActivityService: SystemActivityService,
    private tenantApiService: TenantApiService,
  ) {}

  async create(
    createDto: CreateDeviceGroupDto,
    tenantIds: string[],
  ): Promise<DeviceGroup> {
    const existingGroup = await this.deviceGroupRepo.findOne({
      where: { group_name: createDto.group_name },
    });

    if (existingGroup) {
      throw new ConflictException(
        `Device group with name "${createDto.group_name}" already exists`,
      );
    }

    const tenantId = createDto.tenant_id || tenantIds[0];

    // Create the IoT device in Sandgrain and get the iotId back
    const iotResponse = await this.tenantApiService.createIot(tenantId, {
      username: createDto.group_name,
      password: createDto.password,
    });
    const group_id =
      iotResponse?.iotId ?? iotResponse?.id ?? iotResponse?.deviceId ?? "";

    const group = this.deviceGroupRepo.create({
      group_id,
      group_name: createDto.group_name,
      password: createDto.password,
      tenant_id: tenantId,
    });
    const saved = await this.deviceGroupRepo.save(group);

    // Log device group creation activity
    this.systemActivityService
      .logDeviceGroupCreated(saved.device_group_id, saved.group_name)
      .catch(() => {});

    return saved;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    tenantIds?: string[],
  ): Promise<{ data: DeviceGroup[]; total: number }> {
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

    return { data, total };
  }

  async findOne(id: number): Promise<DeviceGroup> {
    const group = await this.deviceGroupRepo.findOne({
      where: { device_group_id: id },
    });
    if (!group) {
      throw new NotFoundException(`Device group with ID ${id} not found`);
    }
    return group;
  }

  async update(
    id: number,
    updateDto: UpdateDeviceGroupDto,
  ): Promise<DeviceGroup> {
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
        .catch(() => {});
    }

    return saved;
  }

  async remove(id: number): Promise<void> {
    const group = await this.findOne(id);
    await this.deviceGroupRepo.softRemove(group);
    this.systemActivityService.logDeleted("device_group", id, group.group_name).catch(() => {});
  }
}
