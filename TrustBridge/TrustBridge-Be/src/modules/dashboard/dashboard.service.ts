import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Repository } from "typeorm";

import { DashboardStats } from "./types";
import { DeviceLog } from "../../entities/device-log.entity";
import { Device } from "../../entities/device.entity";
import { SystemActivity } from "../../entities/system-activity.entity";

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
  ) { }

  private applyTenantFilter(qb: any, tenantIds: string[], alias = "d") {
    if (tenantIds.length > 0) {
      qb.andWhere(`${alias}.tenant_id IN (:...tenantIds)`, { tenantIds });
    }
    return qb;
  }

  async getStats(tenantIds: string[] = []): Promise<DashboardStats> {
    try {
      this.logger.log("START::DashboardService::getStats", tenantIds);
      const hasFilter = tenantIds.length > 0;

      const deviceQb = () => {
        const qb = this.deviceRepo.createQueryBuilder("d");
        if (hasFilter) qb.where("d.tenant_id IN (:...tenantIds)", { tenantIds });
        return qb;
      };

      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      // single query: device status counts + active/inactive breakdown
      const deviceCountsPromise = deviceQb()
        .select("d.status", "status")
        .addSelect("d.is_active", "is_active")
        .addSelect("COUNT(*)", "cnt")
        .where("d.deleted_at IS NULL")
        .groupBy("d.status")
        .addGroupBy("d.is_active")
        .getRawMany<{ status: string; is_active: number | boolean; cnt: string }>();

      // single query: auth log counts (total / success / error)
      const authLogQb = this.logRepo
        .createQueryBuilder("l")
        .select("l.status", "status")
        .addSelect("COUNT(*)", "cnt")
        .where("l.step = :step", { step: "auth_result" })
        .groupBy("l.status");

      if (hasFilter) {
        authLogQb
          .leftJoin("l.device", "device")
          .andWhere("device.tenant_id IN (:...tenantIds)", { tenantIds });
      }

      const authLogCountsPromise = authLogQb.getRawMany<{ status: string; cnt: string }>();

      // recent events
      const actQb = this.activityRepo
        .createQueryBuilder("activity")
        .leftJoin("activity.device", "device")
        .leftJoin("activity.deviceGroup", "deviceGroup")
        .where("activity.created_at > :yesterday", { yesterday });

      if (hasFilter) {
        actQb.andWhere(
          "(device.tenant_id IN (:...tenantIds) OR deviceGroup.tenant_id IN (:...tenantIds))",
          { tenantIds },
        );
      }

      const [deviceCountRows, authLogRows, recentEvents] = await Promise.all([
        deviceCountsPromise,
        authLogCountsPromise,
        actQb.getCount(),
      ]);

      // aggregate device counts
      let total = 0, claimed = 0, newDevices = 0, rejectedDevices = 0;
      let activeDevices = 0, inactiveDevices = 0;

      for (const row of deviceCountRows) {
        const cnt = parseInt(row.cnt, 10);
        total += cnt;
        if (row.status === "claimed") claimed += cnt;
        if (row.status === "idle") newDevices += cnt;
        if (row.status === "rejected") rejectedDevices += cnt;
        if (row.status === "authenticated") {
          const isActive = row.is_active === 1 || row.is_active === true;
          if (isActive) activeDevices += cnt;
          else inactiveDevices += cnt;
        }
      }

      // aggregate auth log counts
      let totalAuthLogs = 0, successAuthLogs = 0, failedAuthLogs = 0;
      for (const row of authLogRows) {
        const cnt = parseInt(row.cnt, 10);
        totalAuthLogs += cnt;
        if (row.status === "success") successAuthLogs = cnt;
        if (row.status === "error") failedAuthLogs = cnt;
      }

      const authSuccessRate =
        totalAuthLogs > 0 ? (successAuthLogs / totalAuthLogs) * 100 : 0;

      this.logger.log("SUCCESS::DashboardService::getStats", tenantIds);
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
    } catch (error) {
      this.logger.error("ERROR::DashboardService::getStats", error, tenantIds);
      throw error;
    }
  }

  async getDeviceStatusChart(tenantIds: string[] = []) {
    try {
      this.logger.log("START::DashboardService::getDeviceStatusChart", tenantIds);
      const statuses = ["idle", "inprogress", "claimed", "authenticated", "rejected"];
      const rows = await this.applyTenantFilter(
        this.deviceRepo
          .createQueryBuilder("d")
          .select("d.status", "status")
          .addSelect("COUNT(*)", "count")
          .where("d.status IN (:...statuses)", { statuses })
          .groupBy("d.status"),
        tenantIds,
      ).getRawMany();

      this.logger.log("SUCCESS::DashboardService::getDeviceStatusChart", tenantIds);

      return statuses.map((status) => ({
        status,
        count: parseInt(rows.find((r) => r.status === status)?.count ?? "0", 10),
      }));
    } catch (error) {
      this.logger.error("ERROR::DashboardService::getDeviceStatusChart", error, tenantIds);
      throw error;
    }
  }

  async getAuthenticationTrend(days: number = 7, tenantIds: string[] = []) {
    try {
      this.logger.log("START::DashboardService::getAuthenticationTrend", days, tenantIds);
      const hasFilter = tenantIds.length > 0;

      const from = new Date();
      from.setDate(from.getDate() - (days - 1));
      from.setHours(0, 0, 0, 0);

      const to = new Date();
      to.setHours(23, 59, 59, 999);

      const qb = this.logRepo
        .createQueryBuilder("l")
        .select("DATE(l.created_at)", "date")
        .addSelect("SUM(CASE WHEN l.status = 'success' THEN 1 ELSE 0 END)", "success")
        .addSelect("SUM(CASE WHEN l.status = 'error' THEN 1 ELSE 0 END)", "failed")
        .where("l.step = :step", { step: "auth_result" })
        .andWhere("l.created_at BETWEEN :from AND :to", { from, to })
        .groupBy("DATE(l.created_at)")
        .orderBy("DATE(l.created_at)", "ASC");

      if (hasFilter) {
        qb.leftJoin("l.device", "device").andWhere(
          "device.tenant_id IN (:...tenantIds)",
          { tenantIds },
        );
      }

      const rows = await qb.getRawMany<{ date: string; success: string; failed: string }>();

      // fill in any days with zero activity so the caller always gets `days` entries
      const result: { date: string; success: number; failed: number }[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const row = rows.find((r) => r.date === dateStr);
        result.push({
          date: dateStr,
          success: row ? parseInt(row.success, 10) : 0,
          failed: row ? parseInt(row.failed, 10) : 0,
        });
      }
      this.logger.log("SUCCESS::DashboardService::getAuthenticationTrend", days, tenantIds);
      return result;
    } catch (error) {
      this.logger.error("ERROR::DashboardService::getAuthenticationTrend", error, days, tenantIds);
      throw error;
    }
  }

  async getRecentDevices(limit: number = 5, tenantIds: string[] = []) {
    try {
      this.logger.log("START::DashboardService::getRecentDevices", limit, tenantIds);
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
      this.logger.log("SUCCESS::DashboardService::getRecentDevices", limit, tenantIds);
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
    } catch (error) {
      this.logger.error("ERROR::DashboardService::getRecentDevices", error, limit, tenantIds);
      throw error;
    }
  }
}