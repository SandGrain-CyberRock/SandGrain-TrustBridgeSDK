import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repository } from "typeorm";

import { CreateActivityDto } from "./types";
import { SystemActivity } from "../../entities/system-activity.entity";



@Injectable()
export class SystemActivityService {
  constructor(
    @InjectRepository(SystemActivity)
    private activityRepo: Repository<SystemActivity>,
  ) { }

  async create(dto: CreateActivityDto): Promise<SystemActivity> {
    const activity = this.activityRepo.create({
      ...dto,
      severity: dto.severity || "info",
    });
    return this.activityRepo.save(activity);
  }

  private buildTenantQuery(tenantIds?: string[]) {
    const qb = this.activityRepo
      .createQueryBuilder("activity")
      .leftJoinAndSelect("activity.device", "device")
      .leftJoinAndSelect("activity.deviceGroup", "deviceGroup")
      .orderBy("activity.created_at", "DESC");

    if (tenantIds && tenantIds.length > 0) {
      qb.where(
        "(device.tenant_id IN (:...tenantIds) OR deviceGroup.tenant_id IN (:...tenantIds) OR (activity.device_id IS NULL AND activity.device_group_id IS NULL))",
        { tenantIds },
      );
    }

    return qb;
  }

  async findAll(
    limit: number = 50,
    offset: number = 0,
    tenantIds?: string[],
  ): Promise<{ data: SystemActivity[]; total: number }> {
    const qb = this.buildTenantQuery(tenantIds).take(limit).skip(offset);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findRecent(
    limit: number = 10,
    tenantIds?: string[],
  ): Promise<SystemActivity[]> {
    return this.buildTenantQuery(tenantIds).take(limit).getMany();
  }

  async findByEntityType(
    entityType: string,
    limit: number = 50,
    tenantIds?: string[],
  ): Promise<SystemActivity[]> {
    const qb = this.buildTenantQuery(tenantIds)
      .andWhere("activity.entity_type = :entityType", { entityType })
      .take(limit);
    return qb.getMany();
  }

  async findByDeviceId(
    deviceId: number,
    tenantIds?: string[],
  ): Promise<SystemActivity[]> {
    const qb = this.buildTenantQuery(tenantIds).andWhere(
      "activity.device_id = :deviceId",
      { deviceId },
    );
    return qb.getMany();
  }

  async findByDeviceGroupId(
    deviceGroupId: number,
    tenantIds?: string[],
  ): Promise<SystemActivity[]> {
    const qb = this.buildTenantQuery(tenantIds).andWhere(
      "activity.device_group_id = :deviceGroupId",
      { deviceGroupId },
    );
    return qb.getMany();
  }


  // helpers

  private entityLabel(entityType: string): string {
    return entityType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  async logCreated(
    entityType: string,
    entityId: number,
    name: string,
  ): Promise<SystemActivity> {
    const label = this.entityLabel(entityType);
    return this.create({
      activity_type: `${entityType}_created`,
      entity_type: entityType,
      entity_id: entityId,
      title: `${label} "${name}" created`,
      description: `New ${label.toLowerCase()} "${name}" has been created`,
      severity: "info",
      icon: "cpu",
    });
  }

  async logUpdated(
    entityType: string,
    entityId: number,
    name: string,
  ): Promise<SystemActivity> {
    const label = this.entityLabel(entityType);
    return this.create({
      activity_type: `${entityType}_updated`,
      entity_type: entityType,
      entity_id: entityId,
      title: `${label} "${name}" updated`,
      description: `${label} "${name}" has been updated`,
      severity: "info",
      icon: "edit",
    });
  }

  async logDeleted(
    entityType: string,
    entityId: number,
    name: string,
  ): Promise<SystemActivity> {
    const label = this.entityLabel(entityType);
    return this.create({
      activity_type: `${entityType}_deleted`,
      entity_type: entityType,
      entity_id: entityId,
      title: `${label} "${name}" deleted`,
      description: `${label} "${name}" has been removed`,
      severity: "warning",
      icon: "trash",
    });
  }

  // device-specific helpers
  async logDeviceCreated(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_created",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} created`,
      description: `New device "${deviceName}" has been registered`,
      severity: "info",
      icon: "cpu",
    });
  }

  async logDeviceAuthInProgress(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_auth_in_progress",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} authentication in progress`,
      description: `Device "${deviceName}" authentication has started`,
      severity: "warning",
      icon: "warning",
    });
  }

  async logDeviceAuthenticated(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_authenticated",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} authenticated successfully`,
      description: `Device "${deviceName}" has been authenticated`,
      severity: "success",
      icon: "TickSquare",
    });
  }

  async logDeviceFailed(
    deviceId: number,
    deviceName: string,
    reason?: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_failed",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Authentication failed for device ${deviceName}`,
      description: reason || `Device "${deviceName}" failed authentication`,
      severity: "error",
      icon: "danger",
    });
  }

  async logDeviceGroupCreated(
    deviceGroupId: number,
    groupName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_group_created",
      entity_type: "device_group",
      entity_id: deviceGroupId,
      device_group_id: deviceGroupId,
      title: `Device group ${groupName} created`,
      description: `New device group "${groupName}" has been created`,
      severity: "info",
      icon: "cpu",
    });
  }

  async logDeviceGroupPasswordChanged(
    deviceGroupId: number,
    groupName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_group_password_changed",
      entity_type: "device_group",
      entity_id: deviceGroupId,
      device_group_id: deviceGroupId,
      title: `Password changed for device group ${groupName}`,
      description: `Security credentials updated for "${groupName}"`,
      severity: "warning",
      icon: "lock",
    });
  }

  async logDeviceApproved(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_approved",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} approved successfully`,
      description: `Device "${deviceName}" has been approved successfully`,
      severity: "success",
      icon: "TickSquare",
    });
  }

  async logDeviceRejected(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_rejected",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} rejected`,
      description: `Device "${deviceName}" has been rejected`,
      severity: "warning",
      icon: "closeCircle",
    });
  }

  async logDeviceDeleted(
    deviceId: number,
    deviceName: string,
  ): Promise<SystemActivity> {
    return this.create({
      activity_type: "device_deleted",
      entity_type: "device",
      entity_id: deviceId,
      device_id: deviceId,
      title: `Device ${deviceName} deleted`,
      description: `Device "${deviceName}" has been removed`,
      severity: "warning",
      icon: "trash",
    });
  }
}
