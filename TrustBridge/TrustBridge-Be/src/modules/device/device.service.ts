import * as fs from "fs";
import * as path from "path";

import { InjectQueue } from "@nestjs/bullmq";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";

import { Queue } from "bullmq";
import { Workbook } from "exceljs";
import { JOB_OFFLINE_DEVICE_AUTH, JOB_ONLINE_DEVICE_AUTH, QUEUE_OFFLINE_DEVICE_AUTH, QUEUE_ONLINE_DEVICE_AUTH } from "src/common/queue/auth/constant";
import { DataSource, In, Repository, IsNull } from "typeorm";

import { DeviceAuthService } from "./device-auth.service";
import { CreateDeviceDto } from "./dto/create-device.dto";
import { UpdateDeviceDto } from "./dto/update-device.dto";
import type { ParsedBulkImport } from "./utils/parse-bulk-import";
import { DeviceGroup } from "../../entities/device-group.entity";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { Device } from "../../entities/device.entity";
import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";
import { MqttService } from "../mqtt/mqtt.service";
import { SystemActivityService } from "../system-activity/system-activity.service";
import { TenantApiService } from "../tenant-api/tenant-api.service";

@Injectable()
export class DeviceService implements OnModuleInit {
  private readonly logger = new Logger(DeviceService.name);

  private static readonly ONLINE_RECHECK_DELAY_MS = 3000;
  private static readonly BULK_IMPORT_INSERT_CHUNK = 500;
  private static readonly BULK_IMPORT_UPDATE_CONCURRENCY = 20;

  onModuleInit(): void {
    // Write whitelist + credentials on startup so the gateway always has up-to-date files
    this.syncGatewayWhitelist().catch(() => { });
    this.syncGatewayCredentials().catch(() => { });
  }

  constructor(
    @InjectRepository(Device)
    private deviceRepo: Repository<Device>,
    @InjectRepository(DeviceGroup)
    private deviceGroupRepo: Repository<DeviceGroup>,
    @InjectRepository(DeviceProfile)
    private deviceProfileRepo: Repository<DeviceProfile>,
    @InjectRepository(TenantUserCredential)
    private credentialRepo: Repository<TenantUserCredential>,
    private dataSource: DataSource,
    @Inject(forwardRef(() => DeviceAuthService))
    private deviceAuthService: DeviceAuthService,
    private systemActivityService: SystemActivityService,
    private mqttService: MqttService,
    private tenantApiService: TenantApiService,
    @InjectQueue(QUEUE_ONLINE_DEVICE_AUTH) private onlineAuthQueue: Queue,
    @InjectQueue(QUEUE_OFFLINE_DEVICE_AUTH) private offlineAuthQueue: Queue,
  ) { }

  async create(
    createDto: CreateDeviceDto,
    tenantIds: string[],
  ): Promise<Device> {
    // Check for duplicate device name
    const existingDevice = await this.deviceRepo.findOne({
      where: [
        { device_name: createDto.device_name, deleted_at: IsNull() },
        { token_id: createDto.token_id, deleted_at: IsNull() }
      ],
    });

    if (existingDevice) {
      if (existingDevice.device_name === createDto.device_name) {
        throw new ConflictException(
          `Device with name "${createDto.device_name}" already exists`,
        );
      }

      if (existingDevice.token_id === createDto.token_id) {
        throw new ConflictException(
          `Device with token ID "${createDto.token_id}" already exists`,
        );
      }
    }

    const group = await this.deviceGroupRepo.findOne({
      where: { device_group_id: createDto.device_group_id },
    });
    if (!group) {
      throw new NotFoundException(
        `Device group with ID ${createDto.device_group_id} not found`,
      );
    }

    if (createDto.profile_id) {
      const profile = await this.deviceProfileRepo.findOne({
        where: { profile_id: createDto.profile_id },
      });
      if (!profile) {
        throw new NotFoundException(
          `Device profile with ID ${createDto.profile_id} not found`,
        );
      }
    } else {
      const defaultProfile = await this.deviceProfileRepo.findOne({
        where: { is_default: true },
      });
      if (defaultProfile) {
        createDto.profile_id = defaultProfile.profile_id;
      }
    }

    // Normalize TID to lowercase — SDK always publishes lowercase TIDs
    if (createDto.token_id) {
      createDto.token_id = createDto.token_id.toLowerCase();
    }

    // Always use tenant_id from JWT, never trust the client
    createDto.tenant_id = tenantIds[0] ?? null;

    const device = this.deviceRepo.create(createDto);
    const saved = await this.deviceRepo.save(device);

    // Load relation for auth process
    saved.deviceGroup = group;

    // Sync gateway whitelist + credentials so the new device is immediately authorized
    this.syncGatewayWhitelist().catch(() => { });
    this.syncGatewayCredentials().catch(() => { });

    // publish the enrolled TID to the gateway
    this.deviceAuthService.publishEnrolledTids([saved.token_id]);

    // Log device creation activity
    this.systemActivityService
      .logDeviceCreated(saved.device_id, saved.device_name)
      .catch(() => {
        // Log activity error silently
      });

    await this.routeDeviceAuth(saved);


    return saved;
  }

  async bulkImport(
    parsed: ParsedBulkImport,
    jwtTenantId: string,
  ): Promise<{ count: number; errors: string[] }> {
    const { batch_no, devices } = parsed;
    const errors: string[] = [];

    // 1. Resolve group names (group_id string) → device_group_id (numeric FK)
    const uniqueGroupIds = [...new Set(devices.map((d) => d.group_id))];
    const groups = await this.deviceGroupRepo.find({
      where: { group_id: In(uniqueGroupIds) },
    });
    const groupMap = new Map(groups.map((g) => [g.group_id, g]));

    // 2. Resolve default profile
    const defaultProfile = await this.deviceProfileRepo.findOne({
      where: { is_default: true },
    });

    // 3. Validate profile IDs exist
    const profileIds = [
      ...new Set(devices.map((d) => d.profile_id).filter(Boolean)),
    ];
    const profileMap = new Map<number, DeviceProfile>();
    if (profileIds.length > 0) {
      const profiles = await this.deviceProfileRepo.findBy({
        profile_id: In(profileIds as number[]),
      });
      for (const p of profiles) profileMap.set(p.profile_id, p);
    }

    // 4. Process each device
    const processedDevices: Device[] = [];

    await this.dataSource.transaction(async (manager) => {
      // 1. Batch-fetch all existing devices in ONE query instead of N
      const tokenIds = devices.map((d) => d.token_id);
      const existingDevices = await manager.find(Device, {
        where: { token_id: In(tokenIds) },
      });
      const existingMap = new Map(existingDevices.map((d) => [d.token_id, d]));

      const toInsert: Device[] = [];
      const toUpdate: Device[] = [];

      for (let i = 0; i < devices.length; i++) {
        const entry = devices[i];
        const row = i + 1;

        const group = groupMap.get(entry.group_id);
        if (!group) {
          errors.push(`Device ${row}: group '${entry.group_id}' not found`);
          continue;
        }

        if (entry.profile_id && !profileMap.has(entry.profile_id)) {
          errors.push(`Device ${row}: profile ID ${entry.profile_id} not found`);
          continue;
        }

        const resolvedProfileId =
          entry.profile_id || defaultProfile?.profile_id || undefined;

        const existing = existingMap.get(entry.token_id);

        if (existing) {
          if (entry.overwrite_display) existing.device_name = entry.device_name;
          if (entry.overwrite_status && entry.device_status) existing.status = "idle";
          if (entry.overwrite_cr_linkage) {
            existing.tenant_id = jwtTenantId;
            existing.device_group_id = group.device_group_id;
            if (entry.offline_cw) existing.offline_cw = entry.offline_cw;
            if (entry.offline_rw) existing.offline_rw = entry.offline_rw;
          }
          if (entry.overwrite_profile) existing.profile_id = resolvedProfileId;
          if (entry.device_serial) existing.device_serial = entry.device_serial;
          existing.batch_no = batch_no;

          existing.deviceGroup = group;
          toUpdate.push(existing);
        } else {
          const device = manager.create(Device, {
            device_name: entry.device_name,
            device_serial: entry.device_serial || undefined,
            token_id: entry.token_id,
            device_group_id: group.device_group_id,
            tenant_id: jwtTenantId,
            profile_id: resolvedProfileId,
            offline_cw: entry.offline_cw || undefined,
            offline_rw: entry.offline_rw || undefined,
            status: "idle",
            batch_no,
          });
          device.deviceGroup = group;
          toInsert.push(device);
        }
      }

      // 2. Bulk insert new devices — one INSERT statement, chunked
      if (toInsert.length > 0) {
        const CHUNK = DeviceService.BULK_IMPORT_INSERT_CHUNK;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const chunk = toInsert.slice(i, i + CHUNK);
          const saved = await manager.save(Device, chunk); // save() with an array batches internally
          processedDevices.push(...saved);
        }
      }

      // 3. Updates run in parallel instead of sequential awaits
      if (toUpdate.length > 0) {
        const CONCURRENCY = DeviceService.BULK_IMPORT_UPDATE_CONCURRENCY;
        for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
          const chunk = toUpdate.slice(i, i + CONCURRENCY);
          const saved = await Promise.all(chunk.map((d) => manager.save(Device, d)));
          processedDevices.push(...saved);
        }
      }
    });
    // 5. Post-import auth (skip devices with cr_already_used)
    const devicesForAuth = processedDevices.filter((d) => {
      const entry = devices.find((e) => e.token_id === d.token_id);
      return !entry?.cr_already_used;
    });

    const offlineDevices = devicesForAuth.filter(
      (d) => d.offline_cw && d.offline_rw,
    );
    const onlineDevices = devicesForAuth.filter(
      (d) => !d.offline_cw || !d.offline_rw,
    );

    if (offlineDevices.length > 0) {
      this.processOfflineDevicesSequentially(offlineDevices).catch(() => { });
    }

    const alreadyOnline = onlineDevices.filter(
      (d) => d.token_id && this.mqttService.isDeviceOnline(d.token_id),
    );
    const waitingOnline = onlineDevices.filter(
      (d) => !d.token_id || !this.mqttService.isDeviceOnline(d.token_id),
    );

    for (const d of alreadyOnline) {
      await this.onlineAuthQueue.add(
        JOB_ONLINE_DEVICE_AUTH,
        { deviceId: d.device_id },
        { jobId: `online-auth-${d.device_id}`, removeOnComplete: true, removeOnFail: false },
      );
    }

    if (waitingOnline.length > 0) {
      await this.deviceRepo
        .createQueryBuilder()
        .update(Device)
        .set({ status_message: "Waiting for device to come online" })
        .whereInIds(waitingOnline.map((d) => d.device_id))
        .execute();
    }

    // publish the enrolled TIDs to the gateway
    this.deviceAuthService.publishEnrolledTids(processedDevices.map((d) => d.token_id));

    // 6. Sync gateway whitelist
    this.syncGatewayWhitelist().catch(() => { });

    // 7. Log activity
    for (const d of processedDevices) {
      this.systemActivityService
        .logDeviceCreated(d.device_id, d.device_name)
        .catch(() => { });
    }

    return { count: processedDevices.length, errors };
  }

  async reAuthenticate(id: number): Promise<{ message: string }> {
    const device = await this.findOne(id);
    await this.deviceRepo.update(id, { status: "idle" });
    device.status = "idle";

    // Fire background auth process (not awaited)
    this.deviceAuthService.processDeviceAuth(device).catch(() => {
      // Error already handled inside processDeviceAuth
    });

    return { message: `Authentication process triggered for device ${id}` };
  }

  /**
   * Trigger background re-authentication in bulk for idle/rejected devices.
   * Accepts optional filters (device_ids, device_group_id, profile_id, statuses).
   * Defaults to all idle + rejected devices when no filters are provided.
   */
  async bulkAuthenticate(params: {
    device_ids?: number[];
    device_group_id?: number;
    profile_id?: number;
    statuses?: string[];
  }): Promise<{
    queued: number;
    skipped: number;
    devices: { device_id: number; device_name: string; status: string }[];
  }> {
    const targetStatuses = params.statuses?.length
      ? params.statuses
      : ["idle", "rejected"];

    let devices: Device[];

    if (params.device_ids && params.device_ids.length > 0) {
      devices = await this.deviceRepo.find({
        where: params.device_ids.map((id) => ({ device_id: id })),
      });
      // Only process devices whose status is in targetStatuses
      devices = devices.filter((d) => targetStatuses.includes(d.status));
    } else {
      const qb = this.deviceRepo.createQueryBuilder("device");
      qb.where("device.status IN (:...statuses)", { statuses: targetStatuses });
      if (params.device_group_id) {
        qb.andWhere("device.device_group_id = :groupId", {
          groupId: params.device_group_id,
        });
      }
      if (params.profile_id) {
        qb.andWhere("device.profile_id = :profileId", {
          profileId: params.profile_id,
        });
      }
      devices = await qb.getMany();
    }

    const queued: { device_id: number; device_name: string; status: string }[] =
      [];
    let skipped = 0;

    for (const device of devices) {
      try {
        // Load deviceGroup relation — required by both auth flows
        const full = await this.deviceRepo.findOne({
          where: { device_id: device.device_id },
          relations: ["deviceGroup"],
        });
        if (!full) {
          skipped++;
          continue;
        }

        if (full.offline_cw && full.offline_rw) {
          // Offline flow — same as create()
          await this.deviceRepo.update(full.device_id, {
            status: "inprogress",
            status_message: "Processing offline authentication...",
          });
          await this.offlineAuthQueue.add(
            JOB_OFFLINE_DEVICE_AUTH,
            { deviceId: full.device_id, offlineCw: full.offline_cw, offlineRw: full.offline_rw },
            { jobId: `offline-auth-${full.device_id}`, removeOnComplete: true, removeOnFail: false },
          );
        } else {
          const tid = full.token_id?.toLowerCase();
          const isOnline = tid
            ? this.mqttService.isDeviceOnline(tid)
            : false;

          await this.deviceRepo.update(full.device_id, {
            status: "idle",
            status_message: "Waiting for device to come online",
          });

          if (isOnline) {
            await this.onlineAuthQueue.add(
              JOB_ONLINE_DEVICE_AUTH,
              { deviceId: full.device_id },
              { jobId: `online-auth-${full.device_id}`, removeOnComplete: true, removeOnFail: false },
            );
          } else {
            // Race-condition re-check after 3 s — same as create()
            const deviceId = full.device_id;
            const tokenId = full.token_id;
            setTimeout(async () => {
              if (this.mqttService.isDeviceOnline(tokenId)) {
                const fresh = await this.deviceRepo.findOne({
                  where: { device_id: deviceId },
                  relations: ["deviceGroup"],
                });
                if (
                  fresh &&
                  (fresh.status === "idle" || fresh.status === "rejected")
                ) {
                  await this.onlineAuthQueue.add(
                    JOB_ONLINE_DEVICE_AUTH,
                    { deviceId: fresh.device_id },
                    { jobId: `online-auth-${fresh.device_id}`, removeOnComplete: true, removeOnFail: false },
                  );
                }
              }
            }, DeviceService.ONLINE_RECHECK_DELAY_MS);
          }
        }

        queued.push({
          device_id: full.device_id,
          device_name: full.device_name,
          status: full.offline_cw && full.offline_rw ? "inprogress" : "idle",
        });
      } catch (err: unknown) {
        skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `bulkAuthenticate: skipped device ${device.device_id} — ${msg}`,
        );
      }
    }

    return { queued: queued.length, skipped, devices: queued };
  }

  async runProcess(
    id: number,
    processType: "authentication" | "fw_verification" | "installation",
    options?: { verification_rw?: string; auth_option?: 1 | 2 | 3 },
  ): Promise<{ message: string }> {
    const device = await this.deviceRepo.findOne({
      where: { device_id: id },
      relations: ["deviceGroup"],
    });

    if (!device) throw new Error(`Device ${id} not found`);

    if (processType === "authentication") {
      const mode = options?.auth_option ?? 1;
      const labels = ["Normal Flow", "Fault Injection", "Error Stress"];
      const label = labels[mode - 1];
      const tid = device.token_id?.toLowerCase();

      if (!tid) throw new Error(`Device ${id} has no token_id`);

      // Create initial in_progress log so the frontend spinner activates and polling kicks in
      const attemptNumber = await this.deviceAuthService.nextAttemptNumber(
        id,
        "authentication",
      );
      await this.deviceAuthService.createRunAuthLog(id, label, attemptNumber);

      // Publish trigger to v3 device SDK — it handles the full gateway flow
      const topic = `sandgrain/v1/${tid}/cmd/run_auth`;
      this.mqttService.publish(topic, JSON.stringify({ mode }));
      this.logger.log(
        `Published run_auth mode=${mode} (${label}) for TID=${tid}`,
      );

      return {
        message: `Authentication (${label}) triggered for device ${id}`,
      };
    }

    if (processType === "fw_verification") {
      this.deviceAuthService.processFwVerification(device).catch(() => { });
      return { message: `FW Verification process triggered for device ${id}` };
    }

    if (processType === "installation") {
      const verificationRW = options?.verification_rw;
      if (!verificationRW) {
        throw new Error(
          "installation process requires verification_rw from a prior FW Verification",
        );
      }
      this.deviceAuthService
        .processInstallation(device, verificationRW)
        .catch(() => { });
      return { message: `Installation process triggered for device ${id}` };
    }

    throw new Error(`Unknown process_type: ${processType}`);
  }

  private async processOfflineDevicesSequentially(
    devices: Device[],
  ): Promise<void> {
    for (const device of devices) {
      await this.offlineAuthQueue.add(
        JOB_OFFLINE_DEVICE_AUTH,
        { deviceId: device.device_id, offlineCw: device.offline_cw, offlineRw: device.offline_rw },
        { jobId: `offline-auth-${device.device_id}`, removeOnComplete: true, removeOnFail: false },
      );
    }
  }

  async moveToAuthenticated(deviceIds?: number[]): Promise<{
    moved: number;
    success: number;
    failed: number;
    logs: any[];
  }> {
    let approvedDevices: Device[];

    if (deviceIds && deviceIds.length > 0) {
      // Selection-based: find specific devices
      approvedDevices = await this.deviceRepo
        .createQueryBuilder("device")
        .where("device.device_id IN (:...ids)", { ids: deviceIds })
        .getMany();

      // Validate all are approved
      const notApproved = approvedDevices.filter(
        (d) => d.status !== "approved",
      );
      if (notApproved.length > 0) {
        throw new BadRequestException(
          `Only approved devices can be moved to authenticated. Devices not in approved status: ${notApproved.map((d) => d.device_id).join(", ")}`,
        );
      }
    } else {
      // Bulk: find all approved devices
      approvedDevices = await this.deviceRepo.find({
        where: { status: "approved", is_approved: true },
      });
    }

    if (approvedDevices.length === 0) {
      return { moved: 0, success: 0, failed: 0, logs: [] };
    }

    const results = {
      moved: approvedDevices.length,
      success: 0,
      failed: 0,
      logs: [] as any[],
    };

    for (const device of approvedDevices) {
      try {
        await this.deviceAuthService.updateDeviceStatus(
          device.device_id,
          "authenticated",
        );
        results.success++;
        results.logs.push({
          device_id: device.device_id,
          device_name: device.device_name,
          status: "success",
          message: "Device moved to authenticated",
        });
      } catch (error) {
        results.failed++;
        const errorMessage =
          error instanceof Error
            ? error.message
            : `Failed to move device '${device.device_name}' to authenticated status`;
        results.logs.push({
          device_id: device.device_id,
          device_name: device.device_name,
          status: "failed",
          message: errorMessage,
        });
      }
    }

    return results;
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    device_group_id?: number,
    profile_id?: number,
    is_active?: boolean,
    tenantIds?: string[],
  ): Promise<{ data: Device[]; total: number }> {
    const skip = (page - 1) * limit;

    const qb = this.deviceRepo
      .createQueryBuilder("device")
      .leftJoinAndSelect("device.tenant", "tenant")
      .leftJoinAndSelect("device.deviceGroup", "deviceGroup")
      .leftJoinAndSelect("device.deviceProfile", "deviceProfile");

    // Build WHERE conditions
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    // Filter by tenant_ids if provided (organization-based filtering)
    if (tenantIds && tenantIds.length > 0) {
      conditions.push("device.tenant_id IN (:...tenantIds)");
      parameters.tenantIds = tenantIds;
    }

    if (search) this.applySearchCondition(conditions, parameters, search);

    this.applyDeviceListFilters(conditions, parameters, { status, device_group_id, profile_id });

    if (is_active !== undefined && status && !status.includes(",")) {
      // Only filter by is_active for single-status queries (not multi-status like "authenticated,rejected")
      conditions.push("device.is_active = :is_active");
      parameters.is_active = is_active;
    }

    if (conditions.length > 0) {
      qb.where(conditions.join(" AND "), parameters);
    }

    qb.orderBy("device.created_at", "DESC").skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: number): Promise<Device> {
    const device = await this.deviceRepo.findOne({
      where: { device_id: id },
      relations: ["tenant", "deviceGroup", "deviceProfile"],
    });
    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }
    return device;
  }

  /**
   * Check if device is currently online via MQTT
   * Returns the current online status from MQTT connection state
   */
  async checkConnectivity(id: number): Promise<{
    is_online: boolean;
    last_seen_at: Date | null;
  }> {
    const device = await this.findOne(id);

    // Check MQTT connection status
    const isOnline = device.token_id
      ? this.mqttService.isDeviceOnline(device.token_id)
      : false;

    // Update the device record with current online status
    if (isOnline !== device.is_online) {
      await this.deviceRepo.update(id, {
        is_online: isOnline,
        last_seen_at: isOnline ? new Date() : device.last_seen_at,
      });
    }

    return {
      is_online: isOnline,
      last_seen_at: isOnline ? new Date() : device.last_seen_at,
    };
  }

  async update(id: number, updateDto: UpdateDeviceDto): Promise<Device> {
    const device = await this.findOne(id);

    // Check for duplicate device name if changing
    if (updateDto.device_name && updateDto.device_name !== device.device_name) {
      const existingDevice = await this.deviceRepo.findOne({
        where: { device_name: updateDto.device_name },
      });
      if (existingDevice) {
        throw new ConflictException(
          `Device with name "${updateDto.device_name}" already exists`,
        );
      }
    }

    if (updateDto.profile_id) {
      const profile = await this.deviceProfileRepo.findOne({
        where: { profile_id: updateDto.profile_id },
      });
      if (!profile) {
        throw new NotFoundException(
          `Device profile with ID ${updateDto.profile_id} not found`,
        );
      }
    }

    Object.assign(device, updateDto);
    await this.deviceRepo.save(device);

    // Reload with fresh relations to avoid stale relation objects in response
    const updatedDevice = await this.findOne(id);

    // Re-run authentication if device is in idle or rejected status
    if (
      updatedDevice.status === "idle" ||
      updatedDevice.status === "rejected"
    ) {
      this.deviceAuthService.processDeviceAuth(updatedDevice).catch(() => {
        // Error already handled inside processDeviceAuth
      });
    }

    return updatedDevice;
  }

  async findByStatus(statuses: string[]): Promise<Device[]> {
    if (statuses.length === 0) {
      return [];
    }
    return this.deviceRepo
      .createQueryBuilder("device")
      .leftJoinAndSelect("device.tenant", "tenant")
      .leftJoinAndSelect("device.deviceGroup", "deviceGroup")
      .leftJoinAndSelect("device.deviceProfile", "deviceProfile")
      .where("device.status IN (:...statuses)", { statuses })
      .orderBy("device.created_at", "DESC")
      .getMany();
  }

  async findByTenant(tenantId: string): Promise<Device[]> {
    if (!tenantId) return [];
    return this.deviceRepo.find({
      where: { tenant_id: tenantId },
      relations: ["tenant", "deviceGroup", "deviceProfile"],
      order: { created_at: "DESC" },
    });
  }

  async searchDevices(query: string): Promise<Device[]> {
    const qb = this.deviceRepo
      .createQueryBuilder("device")
      .leftJoinAndSelect("device.tenant", "tenant")
      .leftJoinAndSelect("device.deviceGroup", "deviceGroup")
      .leftJoinAndSelect("device.deviceProfile", "deviceProfile");

    const conditions: string[] = [];
    const parameters: Record<string, any> = {};
    this.applySearchCondition(conditions, parameters, query);
    qb.where(conditions.join(" AND "), parameters);

    return qb.orderBy("device.created_at", "DESC").getMany();
  }

  async getStatusCounts(): Promise<{
    data: Record<string, number>;
    message: string;
  }> {
    const results = await this.deviceRepo
      .createQueryBuilder("device")
      .select("device.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("device.status")
      .getRawMany();

    const total = await this.deviceRepo.count();

    const [lifeCycleRow] = await this.dataSource.query<
      { active_count: string; inactive_count: string }[]
    >(
      `SELECT
         SUM(status = 'authenticated' AND is_active = 1 AND deleted_at IS NULL) AS active_count,
         SUM(status = 'authenticated' AND is_active = 0 AND deleted_at IS NULL) AS inactive_count
       FROM tb_device`,
    );
    const activeCount = Number(lifeCycleRow?.active_count ?? 0);
    const inactiveCount = Number(lifeCycleRow?.inactive_count ?? 0);

    // Initialize all possible statuses with 0
    const counts: Record<string, number> = {
      total,
      idle: 0,
      inprogress: 0,
      claimed: 0,
      rejected: 0,
      active: activeCount,
      inactive: inactiveCount,
    };

    // Update counts with actual values from database
    for (const row of results) {
      counts[row.status] = Number(row.count);
    }

    return {
      data: counts,
      message: "Device status counts retrieved successfully",
    };
  }

  private mapDeviceToExportRow(device: Device) {
    return {
      device_name: device.device_name,
      token_id: device.token_id,
      device_type: device.device_type,
      device_group_id: device.device_group_id,
      tenant_id: device.tenant_id || "",
      profile_id: device.profile_id || "",
      profile_name: device.deviceProfile?.profile_name || "",
    };
  }

  private async getDevicesForExport(
    search?: string,
    status?: string,
    device_group_id?: number,
    profile_id?: number,
  ): Promise<Device[]> {
    const qb = this.deviceRepo
      .createQueryBuilder("device")
      .leftJoinAndSelect("device.tenant", "tenant")
      .leftJoinAndSelect("device.deviceGroup", "deviceGroup")
      .leftJoinAndSelect("device.deviceProfile", "deviceProfile")
      .orderBy("device.created_at", "DESC");

    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    if (search) this.applySearchCondition(conditions, parameters, search);

    this.applyDeviceListFilters(conditions, parameters, { status, device_group_id, profile_id });

    if (conditions.length > 0) {
      qb.where(conditions.join(" AND "), parameters);
    }

    return qb.getMany();
  }

  async exportDevicesToExcel(
    search?: string,
    status?: string,
    device_group_id?: number,
    profile_id?: number,
  ): Promise<Buffer> {
    const devices = await this.getDevicesForExport(
      search,
      status,
      device_group_id,
      profile_id,
    );

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Devices");

    worksheet.columns = [
      { header: "device_name", key: "device_name", width: 25 },
      { header: "token_id", key: "token_id", width: 30 },
      { header: "device_type", key: "device_type", width: 15 },
      { header: "device_group_id", key: "device_group_id", width: 15 },
      { header: "tenant_id", key: "tenant_id", width: 25 },
      { header: "profile_id", key: "profile_id", width: 15 },
      { header: "profile_name", key: "profile_name", width: 20 },
    ];

    worksheet.getRow(1).font = { bold: true };

    for (const device of devices) {
      worksheet.addRow(this.mapDeviceToExportRow(device));
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportDevicesToCsv(
    search?: string,
    status?: string,
    device_group_id?: number,
    profile_id?: number,
  ): Promise<Buffer> {
    const devices = await this.getDevicesForExport(
      search,
      status,
      device_group_id,
      profile_id,
    );

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Devices");

    worksheet.columns = [
      { header: "device_name", key: "device_name" },
      { header: "token_id", key: "token_id" },
      { header: "device_type", key: "device_type" },
      { header: "device_group_id", key: "device_group_id" },
      { header: "tenant_id", key: "tenant_id" },
      { header: "profile_id", key: "profile_id" },
      { header: "profile_name", key: "profile_name" },
    ];

    for (const device of devices) {
      worksheet.addRow(this.mapDeviceToExportRow(device));
    }

    const buffer = await workbook.csv.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportDevicesToJson(
    search?: string,
    status?: string,
    device_group_id?: number,
    profile_id?: number,
  ): Promise<Buffer> {
    const devices = await this.getDevicesForExport(
      search,
      status,
      device_group_id,
      profile_id,
    );
    const rows = devices.map((device) => this.mapDeviceToExportRow(device));
    return Buffer.from(JSON.stringify(rows, null, 2));
  }

  async remove(id: number): Promise<void> {
    const device = await this.findOne(id);
    await this.deviceRepo.softRemove(device);

    // Log device deletion activity
    this.systemActivityService
      .logDeviceDeleted(device.device_id, device.device_name)
      .catch(() => {
        // Log activity error silently
      });
  }

  /**
   * Write all enrolled device TIDs to the gateway whitelist file.
   * The gateway reads this file on startup — no recompilation needed.
   * File path: GW_WHITELIST_PATH env var, or ./trustbridge_whitelist.txt
   */
  async syncGatewayWhitelist(): Promise<void> {
    const filePath =
      process.env.GW_WHITELIST_PATH ??
      path.resolve(process.cwd(), "trustbridge_whitelist.txt");

    const devices = await this.deviceRepo.find({
      select: ["token_id"],
      where: { deleted_at: null } as any,
    });

    const tids = devices
      .map((d) => this.toValidLowerTid(d.token_id))
      .filter((t): t is string => t !== null);

    const content = tids.join("\n") + (tids.length ? "\n" : "");
    fs.writeFileSync(filePath, content, "utf8");
    this.logger.log(
      `Gateway whitelist synced — ${tids.length} device(s) → ${filePath}`,
    );
  }

  /**
   * Return all enrolled device TIDs — used by the local gateway whitelist endpoint.
   */
  async getEnrolledTids(): Promise<string[]> {
    const devices = await this.deviceRepo.find({
      select: ["token_id"],
      where: { deleted_at: null } as any,
    });
    return devices
      .map((d) => this.toValidLowerTid(d.token_id))
      .filter((t): t is string => t !== null);
  }

  /**
   * Return credentials for a single device TID — used by the cloud SDK
   * to authenticate with CyberRock without needing a local JSON file.
   */
  async getCredentialsByTid(tid: string): Promise<Record<string, string>> {
    const device = await this.deviceRepo.findOne({
      where: { token_id: tid } as any,
      relations: ["deviceGroup"],
    });
    if (!device || !device.deviceGroup) return {};

    const cred = await this.findTenantCredential(device.tenant_id);
    return this.buildCredentialPayload(device.deviceGroup, cred);
  }

  /**
   * Write device_credentials.json for the Python cloud SDK.
   * Keyed by lowercase TID — the cloud SDK reads this when the gateway sends
   * messages without inline credentials (poc_sdk_gateway C app).
   *
   * File path: GW_CREDENTIALS_PATH env var, or ./device_credentials.json
   */
  async syncGatewayCredentials(): Promise<void> {
    const filePath =
      process.env.GW_CREDENTIALS_PATH ??
      path.resolve(process.cwd(), "device_credentials.json");

    const devices = await this.deviceRepo.find({
      where: { deleted_at: null } as any,
      relations: ["deviceGroup"],
    });

    const result: Record<string, any> = {};

    for (const device of devices) {
      const tid = this.toValidLowerTid(device.token_id);
      if (!tid || !device.deviceGroup) continue;

      const cred = await this.findTenantCredential(device.tenant_id);
      result[tid] = this.buildCredentialPayload(device.deviceGroup, cred);
    }

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2), "utf8");
    this.logger.log(
      `Gateway credentials synced — ${Object.keys(result).length} device(s) → ${filePath}`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * "Move to Lifecycle" — trigger Option-3 (Error Stress) authentication in the
   * background for all claimed devices (or a specific subset). The Error Stress
   * mode exercises the gateway's bit-flip CW-candidate recovery path, which
   * acts as the gating test before the device is promoted to active lifecycle.
   * After this one-shot succeeds, the periodic lifecycle scanner runs the
   * default Option-1 (Normal Flow) on its schedule.
   *
   * Registers each device for lifecycle tracking so is_active is set when the
   * gateway auth_result comes back.
   */
  async bulkLifecycleAuth(deviceIds?: number[]): Promise<{
    queued: number;
    devices: { device_id: number; device_name: string }[];
  }> {
    let devices: Device[];
    if (deviceIds && deviceIds.length > 0) {
      devices = await this.deviceRepo.find({
        where: deviceIds.map((id) => ({ device_id: id })),
        relations: ["deviceGroup"],
      });
    } else {
      devices = await this.deviceRepo.find({
        where: { status: "claimed" },
        relations: ["deviceGroup"],
      });
    }

    const queued: { device_id: number; device_name: string }[] = [];

    for (const device of devices) {
      try {
        // Register device so terminal gateway event updates is_active
        this.deviceAuthService.registerForLifecycleAuth(device.device_id);
        // Trigger auth — runProcess publishes MQTT and returns immediately.
        // auth_option:3 → mode:3 = Error Stress (gateway bit-flip recovery).
        // This is the lifecycle-transition gating test; periodic scans after
        // this run as the default mode 1 (Normal Flow) on the auth_frequency
        // cadence (see runLifecycleAuthScan in device-auth.service.ts).
        await this.runProcess(device.device_id, "authentication", {
          auth_option: 3,
        });
        queued.push({
          device_id: device.device_id,
          device_name: device.device_name,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `bulkLifecycleAuth: skipped device ${device.device_id} — ${msg}`,
        );
      }
    }

    return { queued: queued.length, devices: queued };
  }

  async getTidStatus(deviceId: number): Promise<any> {
    const device = await this.getDeviceOrThrow(deviceId);
    return this.tenantApiService.searchByTid(device.tenant_id, device.token_id);
  }

  async getLifecycleTenantUsers(deviceId: number): Promise<any> {
    const device = await this.getDeviceOrThrow(deviceId);

    try {
      // Get real tenant ID from SandGrain source of truth
      const tidStatus = await this.tenantApiService.searchByTid(
        device.tenant_id,
        device.token_id,
      );
      if (tidStatus?.data?.tenantId) {
        return this.tenantApiService.listTenantUsers(tidStatus.data.tenantId);
      }
    } catch (e: any) {
      // Fallback to local tenant_id if SandGrain call fails
      this.logger.warn(
        "Falling back to local tenant_id for lifecycle users",
        e.message,
      );
    }

    return this.tenantApiService.listTenantUsers(device.tenant_id);
  }

  async getLifecycleIotUsers(
    deviceId: number,
    tenantUserIds: string[],
  ): Promise<any> {
    const device = await this.getDeviceOrThrow(deviceId);

    return this.tenantApiService.listIotUsers(device.tenant_id, tenantUserIds);
  }

  /**
   * Update the SandGrain lifecycle status of a device (via PUT token-serials/{tid})
   * and mirror is_active on the local device record.
   *
   * Active statuses  → is_active = true  : AssetStatusActive
   * Inactive statuses → is_active = false : AssetNonActive, ReadyForHandOver, AssetEndOfLife, AssetOwnedAndActive (keeps unchanged)
   */
  async updateDeviceLifecycle(
    deviceId: number,
    payload: {
      status: string;
      applyToAllDelegates?: boolean;
      iotId?: string;
    },
  ): Promise<any> {
    const device = await this.getDeviceOrThrow(deviceId);
    // Use direct tenant ID from database (no extra call needed)
    const result = await this.tenantApiService.updateTokenSerialLifecycle(
      device.tenant_id,
      device.token_id,
      {
        status: payload.status,
        applyToAllDelegates: payload.applyToAllDelegates ?? false,
        iotId: payload.iotId,
        tenantId: device.tenant_id,
      },
    );

    // Mirror is_active locally
    const activeStatuses = ["AssetStatusActive", "AssetOwnedAndActive"];
    const is_active = activeStatuses.includes(payload.status);
    await this.deviceRepo.update(deviceId, { is_active });

    // Register for lifecycle auth tracking: the next auth_ok for this device
    // will set status → "authenticated" instead of "claimed"
    if (is_active) {
      this.deviceAuthService.registerForLifecycleAuth(deviceId);
      // Schedule periodic lifecycle auth based on profile settings
      this.deviceAuthService.scheduleNextLifecycleAuth(deviceId).catch(() => { });
    }

    return { ...result, is_active };
  }



  private async routeDeviceAuth(device: Device): Promise<void> {
    if (device.offline_cw && device.offline_rw) {
      await this.deviceRepo.update(device.device_id, {
        status: "inprogress",
        status_message: "Processing offline authentication...",
      });
      await this.offlineAuthQueue.add(
        JOB_OFFLINE_DEVICE_AUTH,
        { deviceId: device.device_id, offlineCw: device.offline_cw, offlineRw: device.offline_rw },
        { jobId: `offline-auth-${device.device_id}`, removeOnComplete: true, removeOnFail: false },
      );
      return;
    }

    const tid = device.token_id?.toLowerCase();
    const isOnline = tid ? this.mqttService.isDeviceOnline(tid) : false;

    await this.deviceRepo.update(device.device_id, {
      status: "idle",
      status_message: "Waiting for device to come online",
    });

    if (isOnline) {
      await this.onlineAuthQueue.add(
        JOB_ONLINE_DEVICE_AUTH,
        { deviceId: device.device_id },
        { jobId: `online-auth-${device.device_id}`, removeOnComplete: true, removeOnFail: false },
      );
    } else {
      this.scheduleOnlineRecheck(device.device_id, device.token_id);
    }
  }

  private scheduleOnlineRecheck(deviceId: number, tokenId: string): void {
    setTimeout(async () => {
      if (!this.mqttService.isDeviceOnline(tokenId)) return;
      const fresh = await this.deviceRepo.findOne({
        where: { device_id: deviceId },
        relations: ["deviceGroup"],
      });
      if (fresh && (fresh.status === "idle" || fresh.status === "rejected")) {
        await this.onlineAuthQueue.add(
          JOB_ONLINE_DEVICE_AUTH,
          { deviceId: fresh.device_id },
          { jobId: `online-auth-${fresh.device_id}`, removeOnComplete: true, removeOnFail: false },
        );
      }
    }, DeviceService.ONLINE_RECHECK_DELAY_MS);
  }

  private applySearchCondition(
    conditions: string[],
    parameters: Record<string, any>,
    search: string,
  ): void {
    const isNumeric = /^\d+$/.test(search);
    if (isNumeric) {
      conditions.push("(device.device_id = :id OR device.token_id LIKE :q OR device.device_name LIKE :q)");
      parameters.id = Number(search);
    } else {
      conditions.push("(device.token_id LIKE :q OR device.device_name LIKE :q)");
    }
    parameters.q = `%${search}%`;
  }


  private applyDeviceListFilters(
    conditions: string[],
    parameters: Record<string, any>,
    filters: { status?: string; device_group_id?: number; profile_id?: number },
  ): void {
    const { status, device_group_id, profile_id } = filters;

    if (status) {
      if (status.startsWith("!")) {
        conditions.push("device.status != :status");
        parameters.status = status.substring(1);
      } else if (status.includes(",")) {
        conditions.push("device.status IN (:...statuses)");
        parameters.statuses = status.split(",").map((s) => s.trim());
      } else {
        conditions.push("device.status = :status");
        parameters.status = status;
      }
    }

    if (device_group_id !== undefined) {
      conditions.push(
        device_group_id === 0 ? "device.device_group_id IS NULL" : "device.device_group_id = :device_group_id",
      );
      if (device_group_id !== 0) parameters.device_group_id = device_group_id;
    }

    if (profile_id !== undefined) {
      conditions.push(profile_id === 0 ? "device.profile_id IS NULL" : "device.profile_id = :profile_id");
      if (profile_id !== 0) parameters.profile_id = profile_id;
    }
  }

  private async getDeviceOrThrow(deviceId: number): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { device_id: deviceId } });
    if (!device) throw new NotFoundException(`Device ${deviceId} not found`);
    if (!device.tenant_id) throw new BadRequestException("Device has no tenant_id");
    return device;
  }


  private async findTenantCredential(tenantId: string): Promise<TenantUserCredential | null> {
    try {
      return await this.credentialRepo.findOne({ where: { tenant_id: tenantId } as any });
    } catch {
      return null;
    }
  }

  private buildCredentialPayload(group: DeviceGroup, cred: TenantUserCredential | null) {
    return {
      device_username: group.group_name,
      device_password: group.password,
      tenant_email: cred?.email ?? "",
      tenant_password: cred?.password ?? "",
      cf_access_client_id: cred?.cf_access_client_id ?? "",
      cf_access_client_secret: cred?.cf_access_client_secret ?? "",
    };
  }

  toValidLowerTid(tokenId?: string): string | null {
    const tid = tokenId?.toLowerCase();
    return tid && tid.length === 64 ? tid : null;
  }
}
