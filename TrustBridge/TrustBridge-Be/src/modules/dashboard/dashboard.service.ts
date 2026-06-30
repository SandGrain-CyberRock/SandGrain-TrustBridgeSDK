import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Device } from "../../entities/device.entity";
import { SystemActivity } from "../../entities/system-activity.entity";
import { DeviceLog } from "../../entities/device-log.entity";
import { Tenant } from "../../entities/tenant.entity";

export interface DashboardStats {
  total_devices: number;
  new_devices: number;
  rejected_devices: number;
  claimed_devices: number;
  active_devices: number;
  inactive_devices: number;
  failed_authentications: number;
  recent_events: number;
  auth_success_rate: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(Device)
    private deviceRepo: Repository<Device>,
    @InjectRepository(SystemActivity)
    private activityRepo: Repository<SystemActivity>,
    @InjectRepository(DeviceLog)
    private logRepo: Repository<DeviceLog>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    private dataSource: DataSource,
  ) {}

  private applyTenantFilter(qb: any, tenantIds: string[], alias = "d") {
    if (tenantIds && tenantIds.length > 0) {
      qb.andWhere(`${alias}.tenant_id IN (:...tenantIds)`, { tenantIds });
    }
    return qb;
  }

  async getStats(tenantIds: string[] = []): Promise<DashboardStats> {
    const hasFilter = tenantIds.length > 0;

    const baseQb = () =>
      this.applyTenantFilter(
        this.deviceRepo.createQueryBuilder("d"),
        tenantIds,
      );

    const total = await baseQb().getCount();
    const claimed = await baseQb()
      .andWhere("d.status = :status", { status: "claimed" })
      .getCount();
    const newDevices = await baseQb()
      .andWhere("d.status = :status", { status: "idle" })
      .getCount();
    const rejectedDevices = await baseQb()
      .andWhere("d.status = :rejStatus", { rejStatus: "rejected" })
      .getCount();

    // Use raw SQL for authenticated active/inactive counts (avoids TINYINT boolean param issues)
    const tenantWhere = hasFilter
      ? `AND tenant_id IN (${tenantIds.map((_, i) => `?`).join(",")})`
      : "";
    const [lifeCycleRow] = await this.dataSource.query<
      { active_count: string; inactive_count: string }[]
    >(
      `SELECT
         SUM(status = 'authenticated' AND is_active = 1 AND deleted_at IS NULL ${tenantWhere}) AS active_count,
         SUM(status = 'authenticated' AND is_active = 0 AND deleted_at IS NULL ${tenantWhere}) AS inactive_count
       FROM tb_device`,
      hasFilter ? [...tenantIds, ...tenantIds] : [],
    );
    const activeDevices = Number(lifeCycleRow?.active_count ?? 0);
    const inactiveDevices = Number(lifeCycleRow?.inactive_count ?? 0);

    // Recent events: filter activities via device or deviceGroup tenant_id
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    let actQb = this.activityRepo
      .createQueryBuilder("activity")
      .leftJoin("activity.device", "device")
      .leftJoin("activity.deviceGroup", "deviceGroup")
      .andWhere("activity.created_at > :yesterday", { yesterday });
    if (hasFilter) {
      actQb = actQb.andWhere(
        "(device.tenant_id IN (:...tenantIds) OR deviceGroup.tenant_id IN (:...tenantIds))",
        { tenantIds },
      );
    }
    const recentEvents = await actQb.getCount();

    // Auth success rate + failed authentications
    let logQb = () =>
      this.logRepo
        .createQueryBuilder("l")
        .leftJoin("l.device", "device")
        .where("l.step = :step", { step: "auth_result" });
    let totalAuthLogs: number;
    let successAuthLogs: number;
    let failedAuthLogs: number;
    if (hasFilter) {
      const withTenant = (qb: any) =>
        qb.andWhere("device.tenant_id IN (:...tenantIds)", { tenantIds });
      totalAuthLogs = await withTenant(logQb()).getCount();
      successAuthLogs = await withTenant(
        logQb().andWhere("l.status = :s", { s: "success" }),
      ).getCount();
      failedAuthLogs = await withTenant(
        logQb().andWhere("l.status = :s", { s: "error" }),
      ).getCount();
    } else {
      totalAuthLogs = await this.logRepo.count({
        where: { step: "auth_result" },
      });
      successAuthLogs = await this.logRepo.count({
        where: { step: "auth_result", status: "success" },
      });
      failedAuthLogs = await this.logRepo.count({
        where: { step: "auth_result", status: "error" },
      });
    }
    const authSuccessRate =
      totalAuthLogs > 0 ? (successAuthLogs / totalAuthLogs) * 100 : 0;

    return {
      total_devices: total,
      new_devices: newDevices,
      rejected_devices: rejectedDevices,
      claimed_devices: claimed,
      active_devices: activeDevices,
      inactive_devices: inactiveDevices,
      failed_authentications: failedAuthLogs,
      recent_events: recentEvents,
      auth_success_rate: Math.round(authSuccessRate * 100) / 100,
    };
  }

  async getDeviceStatusChart(tenantIds: string[] = []) {
    const statuses = ["idle", "inprogress", "claimed", "authenticated", "rejected"];
    const counts = await Promise.all(
      statuses.map((status) =>
        this.applyTenantFilter(
          this.deviceRepo
            .createQueryBuilder("d")
            .andWhere("d.status = :status", { status }),
          tenantIds,
        ).getCount(),
      ),
    );
    return statuses.map((status, i) => ({ status, count: counts[i] }));
  }

  async getAuthenticationTrend(days: number = 7, tenantIds: string[] = []) {
    const hasFilter = tenantIds.length > 0;
    const result: { date: string; success: number; failed: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const from = new Date();
      from.setDate(from.getDate() - i);
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setHours(23, 59, 59, 999);

      const baseLogQb = () => {
        const qb = this.logRepo
          .createQueryBuilder("l")
          .leftJoin("l.device", "device")
          .where("l.step = :step", { step: "auth_result" })
          .andWhere("l.created_at BETWEEN :from AND :to", { from, to });
        if (hasFilter) {
          qb.andWhere("device.tenant_id IN (:...tenantIds)", { tenantIds });
        }
        return qb;
      };

      const [success, failed] = await Promise.all([
        baseLogQb()
          .andWhere("l.status = :status", { status: "success" })
          .getCount(),
        baseLogQb()
          .andWhere("l.status = :status", { status: "error" })
          .getCount(),
      ]);

      result.push({ date: from.toISOString().split("T")[0], success, failed });
    }
    return result;
  }

  async getRecentDevices(limit: number = 5, tenantIds: string[] = []) {
    const qb = this.deviceRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.deviceGroup", "deviceGroup")
      .leftJoinAndSelect("d.deviceProfile", "deviceProfile")
      .orderBy("d.updated_at", "DESC")
      .take(limit);

    if (tenantIds.length > 0) {
      qb.where("d.tenant_id IN (:...tenantIds)", { tenantIds });
    }

    const devices = await qb.getMany();
    return devices.map((device) => ({
      device_id: device.device_id,
      device_name: device.device_name,
      status: device.status,
      is_active: device.is_active,
      created_at: device.created_at,
      deviceGroup: device.deviceGroup
        ? { group_name: device.deviceGroup.group_name }
        : null,
      deviceProfile: device.deviceProfile
        ? {
            profile_id: device.deviceProfile.profile_id,
            profile_name: device.deviceProfile.profile_name,
          }
        : null,
    }));
  }
}
