import { forwardRef, Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { Device } from "../../entities/device.entity";
import { DeviceLog } from "../../entities/device-log.entity";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";
import { TenantApiService } from "../tenant-api/tenant-api.service";
import { SystemActivityService } from "../system-activity/system-activity.service";
import { MqttService } from "../mqtt/mqtt.service";
import { DeviceService } from "./device.service";

const TENANT_API_BASE_URL = process.env.TENANT_API_BASE_URL || "https://tenant-api.sandbox.sandgrain.io/api";
const MQTT_RETRY_ATTEMPTS = 2;
const MQTT_RETRY_DELAY_MS = 3000;
const WHITELIST_CHUNK_SIZE = 1000;

@Injectable()
export class DeviceAuthService implements OnModuleInit {
  private readonly logger = new Logger(DeviceAuthService.name);
  /**
   * In-memory attempt tracker for gateway sessions NOT triggered via run_auth_init
   * (e.g. direct ./test_gw runs). Maps deviceId → current attempt_number for the
   * active gateway session so all cycles within one session share the same attempt.
   */
  private readonly _gwSessionAttempt = new Map<number, number>();
  /**
   * Device IDs currently enrolled in a lifecycle bulk-auth run.
   * When terminal auth event fires for these devices, is_active is set accordingly.
   */
  private readonly lifecycleDeviceIds = new Set<number>();
  /** Prevents overlapping lifecycle scans */
  private lifecycleScanRunning = false;

  /**
   * Schedules the next lifecycle auth for a device based on its profile's auth_frequency.
   * Called when a device first becomes authenticated or after each lifecycle auth.
   */
  async scheduleNextLifecycleAuth(deviceId: number): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { device_id: deviceId },
      relations: ["deviceProfile"],
    });
    if (!device) return;
    const authFrequency = device.deviceProfile?.auth_frequency ?? 60;
    const nextAuthAt = new Date(Date.now() + authFrequency * 1000);
    await this.deviceRepo.update(deviceId, {
      next_lifecycle_auth_at: nextAuthAt,
      failed_auth_attempts: 0,
    });
  }

  registerForLifecycleAuth(deviceId: number): void {
    this.lifecycleDeviceIds.add(deviceId);
  }

  constructor(
    @InjectRepository(Device)
    private deviceRepo: Repository<Device>,
    @InjectRepository(DeviceLog)
    private logRepo: Repository<DeviceLog>,
    @InjectRepository(DeviceProfile)
    private deviceProfileRepo: Repository<DeviceProfile>,
    private httpService: HttpService,
    private tenantApiService: TenantApiService,
    private systemActivityService: SystemActivityService,
    private mqttService: MqttService,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
  ) { }

  onModuleInit(): void {
    // Register presence callbacks so MqttService can notify us when devices come online/offline
    this.mqttService.registerPresenceCallbacks(
      (tid) => this.handleDeviceOnline(tid).catch(() => { }),
      (tid) => this.handleDeviceOffline(tid).catch(() => { }),
    );

    // Register gateway log callback so gateway step/retry/result events appear in TrustBridge logs
    this.mqttService.registerGwLogCallback(
      (tid, log) => this.handleGwLog(tid, log).catch(() => { }),
    );

    // Register claim callback: in the device flow the cloud forwards the
    // CyberRock claim_token_id here so BE runs its tenant-api claim flow
    // (auto-claim). Standalone has no cloud->BE forward, so claiming stays manual.
    this.mqttService.registerClaimCallback(
      (tid, claimTokenId) => this.handleCloudClaim(tid, claimTokenId).catch(() => { }),
    );

    this.mqttService.registerGatewayStatusCallback(() => {
      this.publishWhitelist().catch((err) =>
        this.logger.error(`Failed to publish whitelist: ${err.message}`),
      );
    });

    // Start periodic lifecycle auth scanner (runs every 10s, near-zero load)
    setInterval(() => this.runLifecycleAuthScan().catch(() => { }), 10_000);
    this.logger.log("Lifecycle auth scanner started (10s interval)");
  }

  // ─── Lifecycle Auth Scanner ────────────────────────────────────────────────

  /**
   * Scans for active devices whose next_lifecycle_auth_at <= now.
   * For each due device:
   *  - If offline → count as failure (active devices should not be offline)
   *  - If online → run auth
   *  - Auth OK → reset failed_auth_attempts to 0
   *  - Auth fail → increment failed_auth_attempts
   *  - If failed_auth_attempts >= profile.max_failed_auth_attempts → set is_active = false
   *  - Schedule next_lifecycle_auth_at = now + profile.auth_frequency
   */
  private async runLifecycleAuthScan(): Promise<void> {
    if (this.lifecycleScanRunning) return;
    this.lifecycleScanRunning = true;
    try {
      const now = new Date();
      const dueDevices = await this.deviceRepo.find({
        where: {
          is_active: true,
          status: "authenticated",
          next_lifecycle_auth_at: LessThanOrEqual(now),
        },
        relations: ["deviceGroup", "deviceProfile"],
      });

      if (dueDevices.length === 0) return;

      this.logger.log(`Lifecycle scan: ${dueDevices.length} device(s) due for re-auth`);

      for (const device of dueDevices) {
        try {
          await this.processLifecycleAuth(device);
        } catch (err: any) {
          this.logger.error(`Lifecycle auth error for device ${device.device_id}: ${err.message}`);
        }
      }
    } finally {
      this.lifecycleScanRunning = false;
    }
  }

  /**
  *  just handles the failure dont add any logic to handle the success
  *  In Future we will pull retry attemps from above layer or sdk
   */


  // TODO: handle retry logic here 
  private async handleLifecycleAuthFailure(deviceId: number): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { device_id: deviceId },
      relations: ["deviceProfile"],
    });
    if (!device) return;

    const newFailures = (device.failed_auth_attempts ?? 0) + 1;
    const maxFailed = device.deviceProfile?.max_failed_auth_attempts ?? 5;
    const authFrequency = device.deviceProfile?.auth_frequency ?? 60;

    await this.deviceRepo.update(deviceId, {
      failed_auth_attempts: newFailures,
      next_lifecycle_auth_at: new Date(Date.now() + authFrequency * 1000),
    });

    if (newFailures >= maxFailed) {
      await this.deviceRepo.update(deviceId, { is_active: false });
      await this.updateDeviceStatus(deviceId, "authenticated", `Moved to inactive after ${newFailures} consecutive lifecycle auth failures`);
      this.logger.warn(
        `Lifecycle auth: device ${deviceId} moved to INACTIVE (${newFailures}/${maxFailed} consecutive failures)`,
      );
      this.systemActivityService
        .logDeviceFailed(deviceId, device.device_name, `Moved to inactive after ${newFailures} consecutive lifecycle auth failures`)
        .catch(() => { });
    } else {
      // Keep authenticated, schedule next check
      await this.updateDeviceStatus(deviceId, "authenticated", `Lifecycle auth failed (${newFailures}/${maxFailed})`);
      this.logger.warn(
        `Lifecycle auth: device ${deviceId} failed (${newFailures}/${maxFailed}), next check scheduled`,
      );
    }
  }


  private async publishWhitelist(): Promise<void> {
    const tids = await this.deviceService.getEnrolledTids();
    if (!tids || tids.length === 0) return;
    this.handleWhiteListInChunk(tids);
    this.logger.log(`Published whitelist (${tids.length} TIDs) to gw`);
  }


  publishEnrolledTids(tids: string[]): void {
    if (!tids || tids.length === 0) return;
    this.handleWhiteListInChunk(tids);
    this.logger.log(`Published enrolled TIDs (${tids.length} TIDs) to gw`);
  }


  private async handleWhiteListInChunk(tids: string[]): Promise<void> {
    for (let i = 0; i < tids.length; i += WHITELIST_CHUNK_SIZE) {
      const chunk = tids.slice(i, i + WHITELIST_CHUNK_SIZE);
      this.mqttService.publish("sandgrain/v1/gw/whitelist", chunk.join("\n"));
    }
  }


  /**
   * Runs a single lifecycle auth check for an active device.
   * Registers the device for lifecycle handling, then triggers auth.
   * The actual result is handled asynchronously by handleGwLog / handleAuthFailure
   * via the lifecycleDeviceIds set and handleLifecycleAuthFailure.
   */
  private async processLifecycleAuth(device: Device): Promise<void> {
    // If device is offline, count as failure immediately (active devices should not be offline)
    const isOnline = this.mqttService.isDeviceOnline(device.token_id);
    if (!isOnline) {
      this.logger.warn(`Lifecycle auth: device ${device.device_id} is offline`);
      await this.handleLifecycleAuthFailure(device.device_id);
      return;
    }

    // Register for lifecycle result handling (callbacks will check this set)
    this.lifecycleDeviceIds.add(device.device_id);

    // Temporarily set next_lifecycle_auth_at far ahead to prevent re-scanning during auth
    await this.deviceRepo.update(device.device_id, {
      next_lifecycle_auth_at: new Date(Date.now() + 3600_000),
    });

    // Trigger auth — result will be handled by handleGwLog (terminal OK/fail)
    // or handleAuthFailure (catch blocks), which check lifecycleDeviceIds
    const freshDevice = await this.deviceRepo.findOne({
      where: { device_id: device.device_id },
      relations: ["deviceGroup"],
    });
    if (!freshDevice) {
      this.lifecycleDeviceIds.delete(device.device_id);
      return;
    }

    this.logger.log(`Lifecycle auth: triggering re-auth for device ${device.device_id}`);
    this.processOnlineDeviceAuth(freshDevice).catch(() => { });
  }

  /**
   * Writes a DeviceLog entry for each gateway step/retry/result event.
   * Associates the log with the current in_progress attempt for that device.
   */
  private async handleGwLog(
    tid: string,
    log: { step: string; status: string; message: string; attempt: number },
  ): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { token_id: tid } as any,
    });
    if (!device) {
      this.logger.warn(`GW log: device not found for TID=${tid}`);
      return;
    }

    const deviceId = device.device_id;

    // ── Find run_auth_init log (TrustBridge-triggered runs) ───────────────────
    // Query specifically for run_auth_init — do NOT use "most recent in_progress"
    // because gateway steps (gw:err_mgt etc.) create newer in_progress logs that
    // would shadow run_auth_init and prevent it from being closed.
    const runAuthInitLog = await this.logRepo.findOne({
      where: { device_id: deviceId, step: "run_auth_init", status: "in_progress" } as any,
      order: { created_at: "DESC" },
    });

    // ── Determine attempt_number ──────────────────────────────────────────────
    let attemptNumber: number;
    if (runAuthInitLog) {
      // TrustBridge-triggered run — all cycles share the run_auth_init attempt_number
      attemptNumber = runAuthInitLog.attempt_number;
    } else if (log.step === "1/6" && log.attempt === 1) {
      // First cycle of a gateway session started outside TrustBridge (e.g. ./test_gw)
      attemptNumber = await this.nextAttemptNumber(deviceId, "authentication");
      this._gwSessionAttempt.set(deviceId, attemptNumber);
    } else {
      // Subsequent cycle in the same session — reuse cached attempt_number
      attemptNumber = this._gwSessionAttempt.get(deviceId) ?? log.attempt;
    }

    // ── Map gateway status to DB log status ──────────────────────────────────
    const logStatus =
      log.status === "ok" ? "success" :
        log.status === "fail" ? "failed" :
          "in_progress";

    await this.createLog(
      deviceId,
      `gw:${log.step}`,
      logStatus,
      `[Gateway] ${log.message}`,
      undefined,
      undefined,
      attemptNumber,
      "authentication",
    );

    // ── Terminal event detection ──────────────────────────────────────────────
    // "6/6 ok"      = auth succeeded on this cycle
    // "err_mgt ok"  = error management recovered → auth succeeded (fault injection)
    // "failed fail" = all retry cycles exhausted → auth failed
    const isTerminalOk =
      (log.step === "6/6" && log.status === "ok") ||
      (log.step === "err_mgt" && log.status === "ok");
    const isTerminalFail = log.step === "failed" && log.status === "fail";

    if (isTerminalOk || isTerminalFail) {
      this._gwSessionAttempt.delete(deviceId);

      // Close run_auth_init log (TrustBridge-triggered runs)
      if (runAuthInitLog) {
        await this.updateLog(
          deviceId,
          "run_auth_init",
          isTerminalOk ? "success" : "failed",
          `[Gateway] ${log.message}`,
        );
      }

      // Write auth_result log so FE shows the terminal outcome
      await this.createLog(
        deviceId,
        "auth_result",
        isTerminalOk ? "success" : "failed",
        isTerminalOk
          ? "AUTH_OK — authentication completed successfully"
          : "AUTH_NOT_OK — authentication failed",
        undefined,
        undefined,
        attemptNumber,
        "authentication",
      );

      // Update device status and is_active based on auth result
      if (isTerminalOk) {
        await this.deviceRepo.update(deviceId, { is_approved: true, failed_auth_attempts: 0, is_active: true });

        // Resolve final status in one step — skip the intermediate "claimed" for lifecycle devices
        const isLifecycle = this.lifecycleDeviceIds.has(deviceId);
        if (isLifecycle) {
          this.lifecycleDeviceIds.delete(deviceId);
        }
        const finalStatus = isLifecycle ? "authenticated" : "claimed";
        await this.updateDeviceStatus(deviceId, finalStatus);

        // Schedule first lifecycle auth when device becomes authenticated
        if (finalStatus === "authenticated") {
          await this.scheduleNextLifecycleAuth(deviceId);
        }
        if (isLifecycle) {
          this.logger.log(`Lifecycle auth completed for device ${deviceId}: is_active=true`);
        }
      } else {
        // Fall back to persistent DB state when the in-memory Set is stale
        // (e.g. after a BE restart or a race condition). An already-active
        // authenticated device IS in lifecycle mode and must use the
        // threshold-based failure handling — never immediate demotion.
        const persisted = await this.deviceRepo.findOne({
          where: { device_id: deviceId },
        });
        const isLifecycle =
          this.lifecycleDeviceIds.has(deviceId) ||
          (persisted?.is_active === true && persisted?.status === "authenticated");
        this.lifecycleDeviceIds.delete(deviceId);

        if (isLifecycle) {
          await this.handleLifecycleAuthFailure(deviceId);
        } else {
          await this.deviceRepo.update(deviceId, {
            failed_auth_attempts: () => "failed_auth_attempts + 1",
            is_active: false,
          });
          await this.updateDeviceStatus(deviceId, "rejected", "Authentication failed");
        }
      }
    }
  }

  /**
   * Main entry point for device authentication.
   * - If device has offline_cw + offline_rw → offline flow (factory Excel)
   * - Otherwise → online flow: wait for device chip to come online via MQTT presence
   */
  async processDeviceAuth(device: Device): Promise<void> {
    if (device.offline_cw && device.offline_rw) {
      await this.processOfflineDeviceAuth(
        device,
        device.offline_cw,
        device.offline_rw,
      );
    }
    // Online devices: do nothing here — handleDeviceOnline() fires when chip connects.
  }

  /**
   * OFFLINE FLOW — uses pre-computed CW + RW from factory Excel.
   * 1. Call requestCW to get a fresh transactionId from CyberRock
   * 2. Skip requestRW (chip already computed RW in factory)
   * 3. Call replyRW with Excel CW + Excel RW + fresh transactionId
   */
  async processOfflineDeviceAuth(
    device: Device,
    offlineCw: string,
    offlineRw: string,
  ): Promise<void> {
    const attemptNumber = await this.nextAttemptNumber(device.device_id);

    await this.createLog(
      device.device_id,
      "init",
      "in_progress",
      "Offline auth started (factory Excel data)",
      undefined,
      undefined,
      attemptNumber,
    );

    try {
      if (!device.profile_id) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          "No device profile assigned",
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          "No device profile",
        );
        return;
      }

      if (!device.deviceGroup) {
        const loaded = await this.deviceRepo.findOne({
          where: { device_id: device.device_id },
          relations: ["deviceGroup"],
        });
        if (loaded?.deviceGroup) device.deviceGroup = loaded.deviceGroup;
      }

      const credential = await this.tenantApiService.getCredentials(
        device.tenant_id,
      );

      try {
        this.validateCredentials(device, credential);
      } catch (validationError: any) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          validationError.message,
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          validationError.message,
        );
        return;
      }

      await this.updateLog(
        device.device_id,
        "init",
        "success",
        "Credentials validated — offline flow",
      );

      const credentials = {
        device_username: device.deviceGroup.group_name,
        device_password: device.deviceGroup.password,
        tenant_email: credential.email,
        tenant_password: credential.password,
        cf_access_client_id: credential.cf_access_client_id,
        cf_access_client_secret: credential.cf_access_client_secret,
      };

      const TID = device.token_id.toLowerCase();

      // Step 1: requestCW — only to get a fresh transactionId
      await this.createLog(
        device.device_id,
        "request_cw",
        "in_progress",
        "Getting transactionId from CyberRock",
        undefined,
        undefined,
        attemptNumber,
      );
      let cwResponse: any;
      const t1 = Date.now();
      try {
        cwResponse = await this.mqttRequestWithRetry(
          TID,
          "requestCW",
          0,
          { TID },
          credentials,
        );
      } catch (err: any) {
        await this.updateLog(
          device.device_id,
          "request_cw",
          "failed",
          err.message,
          undefined,
          Date.now() - t1,
        );
        throw err;
      }
      if (cwResponse?.status?.code !== 0) {
        const msg = `requestCW failed: ${cwResponse?.status?.result || "unknown error"}`;
        await this.updateLog(
          device.device_id,
          "request_cw",
          "failed",
          msg,
          JSON.stringify(cwResponse),
          Date.now() - t1,
        );
        throw new Error(msg);
      }
      const { transactionId } = cwResponse.payload;
      await this.updateLog(
        device.device_id,
        "request_cw",
        "success",
        "transactionId received (using factory CW+RW)",
        JSON.stringify({ transactionId }),
        Date.now() - t1,
      );

      // Step 2: replyRW with factory CW + factory RW (skip requestRW — chip did this in factory)
      await this.createLog(
        device.device_id,
        "reply_rw",
        "in_progress",
        "Submitting factory RW to CyberRock",
        undefined,
        undefined,
        attemptNumber,
      );
      let replyResponse: any;
      const t3 = Date.now();
      try {
        replyResponse = await this.mqttRequestWithRetry(
          TID,
          "replyRW",
          1,
          { TID, CW: offlineCw, RW: offlineRw, transactionId },
          credentials,
        );
      } catch (err: any) {
        await this.updateLog(
          device.device_id,
          "reply_rw",
          "failed",
          err.message,
          undefined,
          Date.now() - t3,
        );
        throw err;
      }
      if (replyResponse?.status?.code !== 0) {
        const msg = `replyRW failed: ${replyResponse?.status?.result || "unknown error"}`;
        await this.updateLog(
          device.device_id,
          "reply_rw",
          "failed",
          msg,
          JSON.stringify(replyResponse),
          Date.now() - t3,
        );
        throw new Error(msg);
      }
      const { auth_status, claimTokenId } = replyResponse.payload;
      await this.updateLog(
        device.device_id,
        "reply_rw",
        "success",
        `Auth status: ${auth_status}`,
        JSON.stringify(replyResponse.payload),
        Date.now() - t3,
      );

      await this.handleAuthResult(device, auth_status, claimTokenId, credential, attemptNumber);
    } catch (error: any) {
      await this.handleAuthFailure(device, error.message);
    }
  }

  /**
   * ONLINE CLOUD FLOW — existing flow.
   * requestCW → requestRW (cloud computes RW) → replyRW
   */
  async processOnlineCloudAuth(device: Device): Promise<void> {
    const attemptNumber = await this.nextAttemptNumber(device.device_id);

    await this.createLog(
      device.device_id,
      "init",
      "in_progress",
      "Online cloud auth started",
      undefined,
      undefined,
      attemptNumber,
    );

    try {
      if (!device.profile_id) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          "No device profile assigned",
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          "No device profile",
        );
        this.systemActivityService
          .logDeviceFailed(
            device.device_id,
            device.device_name,
            "No device profile",
          )
          .catch(() => { });
        return;
      }

      if (!device.deviceGroup) {
        const loaded = await this.deviceRepo.findOne({
          where: { device_id: device.device_id },
          relations: ["deviceGroup"],
        });
        if (loaded?.deviceGroup) device.deviceGroup = loaded.deviceGroup;
      }

      const credential = await this.tenantApiService.getCredentials(
        device.tenant_id,
      );

      try {
        this.validateCredentials(device, credential);
      } catch (validationError: any) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          validationError.message,
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          validationError.message,
        );
        this.systemActivityService
          .logDeviceFailed(
            device.device_id,
            device.device_name,
            validationError.message,
          )
          .catch(() => { });
        return;
      }

      await this.updateLog(
        device.device_id,
        "init",
        "success",
        `Credentials validated — group: ${device.deviceGroup?.group_name}`,
      );
      // Keep status as "inprogress" until full authentication completes
      // Status will be updated to "claimed" in handleAuthResult after successful auth

      const credentials = {
        device_username: device.deviceGroup.group_name,
        device_password: device.deviceGroup.password,
        tenant_email: credential.email,
        tenant_password: credential.password,
        cf_access_client_id: credential.cf_access_client_id,
        cf_access_client_secret: credential.cf_access_client_secret,
      };

      const TID = device.token_id.toLowerCase();

      // Step 1: Request CW
      await this.createLog(device.device_id, "request_cw", "in_progress", "Requesting challenge word from SDK", undefined, undefined, attemptNumber);
      let cwResponse: any;
      const t1 = Date.now();
      try {
        cwResponse = await this.mqttRequestWithRetry(TID, "requestCW", 0, { TID }, credentials);
      } catch (err: any) {
        await this.updateLog(device.device_id, "request_cw", "failed", err.message, undefined, Date.now() - t1);
        throw err;
      }
      if (cwResponse?.status?.code !== 0) {
        const msg = `requestCW failed: ${cwResponse?.status?.result || "unknown error"}`;
        await this.updateLog(device.device_id, "request_cw", "failed", msg, JSON.stringify(cwResponse), Date.now() - t1);
        throw new Error(msg);
      }
      const { CW, transactionId } = cwResponse.payload;
      await this.updateLog(device.device_id, "request_cw", "success", "Challenge word received", JSON.stringify(cwResponse.payload), Date.now() - t1);

      // Step 2: Request RW (cloud computes)
      await this.createLog(device.device_id, "request_rw", "in_progress", "Requesting response word from SDK", undefined, undefined, attemptNumber);
      let rwResponse: any;
      const t2 = Date.now();
      try {
        rwResponse = await this.mqttRequestWithRetry(TID, "requestRW", 2, { TID, CW }, credentials);
      } catch (err: any) {
        await this.updateLog(device.device_id, "request_rw", "failed", err.message, undefined, Date.now() - t2);
        throw err;
      }
      if (rwResponse?.status?.code !== 0) {
        const msg = `requestRW failed: ${rwResponse?.status?.result || "unknown error"}`;
        await this.updateLog(device.device_id, "request_rw", "failed", msg, JSON.stringify(rwResponse), Date.now() - t2);
        throw new Error(msg);
      }
      const { RW } = rwResponse.payload;
      await this.updateLog(device.device_id, "request_rw", "success", "Response word received", JSON.stringify(rwResponse.payload), Date.now() - t2);

      // Step 3: Reply RW
      await this.createLog(device.device_id, "reply_rw", "in_progress", "Submitting response word to SDK", undefined, undefined, attemptNumber);
      let replyResponse: any;
      const t3 = Date.now();
      try {
        replyResponse = await this.mqttRequestWithRetry(TID, "replyRW", 1, { TID, CW, RW, transactionId }, credentials);
      } catch (err: any) {
        await this.updateLog(device.device_id, "reply_rw", "failed", err.message, undefined, Date.now() - t3);
        throw err;
      }
      if (replyResponse?.status?.code !== 0) {
        const msg = `replyRW failed: ${replyResponse?.status?.result || "unknown error"}`;
        await this.updateLog(device.device_id, "reply_rw", "failed", msg, JSON.stringify(replyResponse), Date.now() - t3);
        throw new Error(msg);
      }
      const { auth_status, claimTokenId } = replyResponse.payload;
      await this.updateLog(device.device_id, "reply_rw", "success", `Auth status: ${auth_status}`, JSON.stringify(replyResponse.payload), Date.now() - t3);

      await this.handleAuthResult(device, auth_status, claimTokenId, credential, attemptNumber);
    } catch (error: any) {
      await this.handleAuthFailure(device, error.message);
    }
  }

  /**
   * ONLINE DEVICE FLOW — device is physically online with chip connected.
   * 1. requestCW → get CW + transactionId from CyberRock
   * 2. Send CW to physical device via MQTT → device chip computes real RW
   * 3. replyRW with real RW from chip → AUTH_OK
   */
  async nextAttemptNumber(deviceId: number, processType = "authentication"): Promise<number> {
    const result = await this.logRepo
      .createQueryBuilder("log")
      .select("MAX(log.attempt_number)", "max")
      .where("log.device_id = :deviceId", { deviceId })
      .andWhere("log.process_type = :type", { type: processType })
      .getRawOne();
    return (result?.max ?? 0) + 1;
  }

  /** Creates the initial in_progress log entry when a run_auth is triggered from TrustBridge. */
  async createRunAuthLog(deviceId: number, label: string, attemptNumber: number): Promise<void> {
    await this.createLog(
      deviceId,
      "run_auth_init",
      "in_progress",
      `Run authentication triggered — ${label}`,
      undefined,
      undefined,
      attemptNumber,
      "authentication",
    );

    // The v3 device SDK never publishes the auth result back via MQTT,
    // so we auto-close this log after 90s if it is still in_progress.
    setTimeout(async () => {
      try {
        const log = await this.logRepo.findOne({
          where: {
            device_id: deviceId,
            step: "run_auth_init",
            attempt_number: attemptNumber,
            status: "in_progress",
          } as any,
        });
        if (log) {
          await this.updateLog(
            deviceId,
            "run_auth_init",
            "failed",
            "Authentication timed out — no result received from device",
            undefined,
            90000,
          );
          this.logger.warn(
            `run_auth_init timed out for device=${deviceId} attempt=${attemptNumber}`,
          );

          // Also move the device itself to a terminal failure state — same as
          // handleGwLog does when it sees `failed fail`. Without this, the log
          // entry shows "Authentication timed out" but the device stays in
          // inprogress/idle and never appears in the Rejected Devices card.
          // handleAuthFailure handles lifecycle vs non-lifecycle correctly,
          // bumps failed_auth_attempts, flips is_active=false, and writes the
          // top-level SystemActivity entry.
          const deviceRow = await this.deviceRepo.findOne({
            where: { device_id: deviceId },
          });
          if (deviceRow) {
            await this.handleAuthFailure(
              deviceRow,
              "Authentication timed out — no result received from device",
            );
          }
        }
      } catch (e) {
        // ignore — best effort cleanup
      }
    }, 90_000);
  }

  async processOnlineDeviceAuth(device: Device, faultMode: 0 | 1 | 2 = 0, attemptNumber?: number): Promise<void> {
    const FAULT_LABELS = ["Normal Flow", "Fault Injection", "Error Stress"];
    if (attemptNumber === undefined) {
      attemptNumber = await this.nextAttemptNumber(device.device_id, "authentication");
    }

    await this.createLog(
      device.device_id,
      "init",
      "in_progress",
      `Online device auth started — ${FAULT_LABELS[faultMode]}`,
      undefined,
      undefined,
      attemptNumber,
    );

    try {
      if (!device.profile_id) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          "No device profile assigned",
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          "No device profile",
        );
        return;
      }

      if (!device.deviceGroup) {
        const loaded = await this.deviceRepo.findOne({
          where: { device_id: device.device_id },
          relations: ["deviceGroup"],
        });
        if (loaded?.deviceGroup) device.deviceGroup = loaded.deviceGroup;
      }

      const credential = await this.tenantApiService.getCredentials(
        device.tenant_id,
      );

      try {
        this.validateCredentials(device, credential);
      } catch (validationError: any) {
        await this.updateLog(
          device.device_id,
          "init",
          "failed",
          validationError.message,
        );
        await this.updateDeviceStatus(
          device.device_id,
          "rejected",
          validationError.message,
        );
        return;
      }

      await this.updateLog(
        device.device_id,
        "init",
        "success",
        "Credentials validated — online device flow",
      );
      // Keep status as "inprogress" until full authentication completes
      // Status will be updated to "claimed" in handleAuthResult after successful auth

      const TID = device.token_id.toLowerCase();

      // Unified PoC_SDK_v3 flow: trigger the v3 device SDK over MQTT. The device
      // + gateway run the full mutual-auth + error-management flow themselves and
      // report progress/result via gw_log/auth_result, which handleGwLog()
      // resolves (enrollment -> "claimed", lifecycle -> "authenticated").
      // Replaces the legacy two-SDK path (poc_sdk_fw computeRW chip-drive +
      // cloud requestCW/replyRW); now everything goes through sandgrain-sdk's
      // PoC_SDK_v3, same as the manual "Authenticate" action.
      await this.createRunAuthLog(device.device_id, FAULT_LABELS[faultMode], attemptNumber);
      this.mqttService.publish(
        `sandgrain/v1/${TID}/cmd/run_auth`,
        JSON.stringify({ mode: faultMode + 1 }),
      );
      this.logger.log(
        `Triggered run_auth mode=${faultMode + 1} for TID=${TID} (PoC_SDK_v3) — result via gw_log/auth_result`,
      );
    } catch (error: any) {
      await this.handleAuthFailure(device, error.message);
    }
  }

  /**
   * Handles a failed auth attempt during onboarding.
   * Immediately rejects the device — no automatic retry.
   * For lifecycle devices, delegates to handleLifecycleAuthFailure instead.
   */
  private async handleAuthFailure(
    device: Device,
    errorMessage: string,
  ): Promise<void> {
    // Fall back to persistent DB state when the in-memory Set is stale
    // (BE restart, race condition). An already-active authenticated device
    // must use the threshold-based handling, never one-shot demotion.
    const persisted = await this.deviceRepo.findOne({
      where: { device_id: device.device_id },
    });
    const isLifecycle =
      this.lifecycleDeviceIds.has(device.device_id) ||
      (persisted?.is_active === true && persisted?.status === "authenticated");
    this.lifecycleDeviceIds.delete(device.device_id);

    if (isLifecycle) {
      await this.handleLifecycleAuthFailure(device.device_id);
      return;
    }

    const latestDevice = await this.deviceRepo.findOne({
      where: { device_id: device.device_id },
    });
    const currentFailures = (latestDevice?.failed_auth_attempts ?? 0) + 1;
    await this.deviceRepo.update(device.device_id, {
      failed_auth_attempts: currentFailures,
    });

    this.logger.error(
      `Device ${device.device_id} auth failed: ${errorMessage}`,
    );
    await this.updateDeviceStatus(device.device_id, "rejected", errorMessage);
    this.systemActivityService
      .logDeviceFailed(device.device_id, device.device_name, errorMessage)
      .catch(() => { });
  }



  /**
   * Called by MqttService when a device announces itself online.
   * Triggers online device auth if device exists and is not yet approved.
   */
  async handleDeviceOnline(tid: string): Promise<void> {
    tid = tid.toLowerCase();
    this.logger.log(`Device online: TID=${tid}`);

    // Use case-insensitive query to find device by token_id
    let device = await this.deviceRepo.findOne({
      where: { token_id: tid },
      relations: ["deviceGroup"],
    });

    // If not found with exact match, try case-insensitive search
    if (!device) {
      device = await this.deviceRepo
        .createQueryBuilder("device")
        .where("LOWER(device.token_id) = :tid", { tid })
        .leftJoinAndSelect("device.deviceGroup", "deviceGroup")
        .getOne();
    }

    if (!device) {
      this.logger.warn(`Device online TID=${tid} not found in DB — ignoring`);
      return;
    }

    this.logger.log(
      `Device TID=${tid} - current status: ${device.status}, is_approved: ${device.is_approved}`,
    );

    // Update connectivity status
    await this.deviceRepo.update(device.device_id, {
      is_online: true,
      last_seen_at: new Date(),
      status_message: "Device online - checking authentication",
    });

    // Re-fetch device to get latest status after update (case-insensitive)
    let updatedDevice = await this.deviceRepo.findOne({
      where: { token_id: tid },
    });
    if (!updatedDevice) {
      updatedDevice = await this.deviceRepo
        .createQueryBuilder("device")
        .where("LOWER(device.token_id) = :tid", { tid })
        .getOne();
    }

    // Skip if device is already approved (lifecycle scanner handles re-auth)
    // or an auth run is currently in progress. Otherwise trigger auth — this
    // covers idle, rejected, and any stuck state left behind by a phantom
    // auth attempt (e.g. from a stale retained "online" that fired auth
    // before the real SDK was actually running).
    if (updatedDevice?.is_approved) {
      this.logger.log(`Device TID=${tid} already approved — skipping auth`);
      return;
    }
    if (updatedDevice?.status === "inprogress") {
      this.logger.log(`Device TID=${tid} auth already in progress — skipping`);
      return;
    }

    this.logger.log(`Triggering online device auth for TID=${tid}`);
    this.processOnlineDeviceAuth(device).catch(() => { });
  }

  /**
   * Called by MqttService when a device goes offline.
   */
  async handleDeviceOffline(tid: string): Promise<void> {
    tid = tid.toLowerCase();
    this.logger.log(`Device offline: TID=${tid}`);

    // Use case-insensitive query to find device by token_id
    let device = await this.deviceRepo.findOne({ where: { token_id: tid } });
    if (!device) {
      device = await this.deviceRepo
        .createQueryBuilder("device")
        .where("LOWER(device.token_id) = :tid", { tid })
        .getOne();
    }
    if (!device) return;

    await this.deviceRepo.update(device.device_id, {
      is_online: false,
      status_message: "Device offline",
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async handleAuthResult(
    device: Device,
    auth_status: string,
    claimTokenId: string | undefined,
    credential: TenantUserCredential,
    attemptNumber: number,
  ): Promise<void> {
    if (auth_status === "AUTH_OK") {
      const isLifecycle = this.lifecycleDeviceIds.has(device.device_id);
      if (isLifecycle) this.lifecycleDeviceIds.delete(device.device_id);

      await this.createLog(
        device.device_id,
        "auth_result",
        "success",
        "AUTH_OK — device authenticated",
        undefined,
        undefined,
        attemptNumber,
      );
      await this.deviceRepo.update(device.device_id, {
        is_approved: true,
        failed_auth_attempts: 0,
      });

      if (isLifecycle) {
        await this.updateDeviceStatus(device.device_id, "authenticated");
        await this.scheduleNextLifecycleAuth(device.device_id);
        this.logger.log(`Lifecycle auth OK for device ${device.device_id}`);
      } else {
        await this.updateDeviceStatus(device.device_id, "claimed");
        await this.createLog(
          device.device_id,
          "claim_token",
          "success",
          "Device claimed successfully",
          undefined,
          undefined,
          attemptNumber,
        );
        this.systemActivityService
          .logDeviceApproved(device.device_id, device.device_name)
          .catch(() => { });
      }
    } else if (claimTokenId) {
      const isLifecycle = this.lifecycleDeviceIds.has(device.device_id);
      if (isLifecycle) this.lifecycleDeviceIds.delete(device.device_id);

      await this.deviceRepo.update(device.device_id, {
        claim_token_id: claimTokenId,
        is_approved: true,
        failed_auth_attempts: 0,
      });
      await this.createLog(
        device.device_id,
        "auth_result",
        "success",
        `Claim token received: ${claimTokenId}`,
        undefined,
        undefined,
        attemptNumber,
      );

      if (isLifecycle) {
        await this.updateDeviceStatus(device.device_id, "authenticated");
        await this.scheduleNextLifecycleAuth(device.device_id);
      } else {
        await this.updateDeviceStatus(device.device_id, "claimed");
        try {
          await this.stepClaimToken(device, claimTokenId, credential, attemptNumber);
        } catch {
          await this.updateDeviceStatus(device.device_id, "claimed");
        }
      }
    } else if (auth_status === "NOT_READY") {
      await this.createLog(
        device.device_id,
        "auth_result",
        "info",
        "NOT_READY — device not yet provisioned",
        undefined,
        undefined,
        attemptNumber,
      );
      await this.updateDeviceStatus(device.device_id, "idle");
    } else {
      const msg = `Auth failed: ${auth_status}`;
      await this.createLog(device.device_id, "auth_result", "failed", msg, undefined, undefined, attemptNumber);
      await this.handleAuthFailure(device, msg);
    }
  }

  /**
   * Auto-claim entry point for the DEVICE flow.
   *
   * The cloud SDK forwards the CyberRock claim_token_id over MQTT
   * (sandgrain/v1/{tid}/claim) only in trustbridge mode. We look up the device +
   * tenant credentials and run the same tenant-api claim flow BE uses in the
   * online-cloud path (stepClaimToken). No-op if the device/credentials are
   * unknown. Standalone never forwards, so claiming stays manual there.
   */
  async handleCloudClaim(tid: string, claimTokenId: string): Promise<void> {
    const device = await this.deviceRepo.findOne({
      where: { token_id: tid } as any,
    });
    if (!device) {
      this.logger.warn(`Cloud claim: no device for TID=${tid} — ignoring`);
      return;
    }

    let credential: TenantUserCredential;
    try {
      credential = await this.tenantApiService.getCredentials(device.tenant_id);
    } catch (e: any) {
      this.logger.error(
        `Cloud claim: no tenant credentials for device=${device.device_id} (tenant=${device.tenant_id}): ${e?.message}`,
      );
      return;
    }



    try {
      await this.stepClaimToken(device, claimTokenId, credential, 1);
      await this.deviceRepo.update(device.device_id, {
        claim_token_id: claimTokenId,
        is_approved: true,
        failed_auth_attempts: 0,
      });
      await this.updateDeviceStatus(device.device_id, "claimed");
      this.logger.log(
        `Cloud claim OK: device=${device.device_id} claim_token_id=${claimTokenId}`,
      );
    } catch (e: any) {
      // Device is already marked claimed; the claim_token POST failure is logged
      // by stepClaimToken. Surface it but don't crash the MQTT handler.
      this.logger.error(`Cloud claim failed for device=${device.device_id}: ${e?.message}`);
    }
  }

  private async mqttRequestWithRetry(
    tid: string,
    action: string,
    msgType: number,
    payload: Record<string, any>,
    credentials: Record<string, string>,
  ): Promise<any> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MQTT_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.mqttService.request(
          tid,
          action,
          msgType,
          payload,
          credentials,
        );
      } catch (err: any) {
        lastError = err;
        if (attempt < MQTT_RETRY_ATTEMPTS) {
          this.logger.warn(
            `MQTT ${action} attempt ${attempt} failed, retrying in ${MQTT_RETRY_DELAY_MS}ms...`,
          );
          await new Promise((res) => setTimeout(res, MQTT_RETRY_DELAY_MS));
        }
      }
    }
    throw (
      lastError ??
      new Error(`MQTT ${action} failed after ${MQTT_RETRY_ATTEMPTS} attempts`)
    );
  }

  private validateCredentials(
    device: Device,
    credential: TenantUserCredential,
  ): void {
    if (!device.token_id) throw new Error("Missing TID (token_id) on device");
    if (!device.deviceGroup)
      throw new Error("Device group not found — assign a device group first");
    if (!device.deviceGroup.group_name)
      throw new Error("Missing device group username (group_name)");
    if (!device.deviceGroup.password)
      throw new Error("Missing device group password");
    if (!credential.email)
      throw new Error("Missing tenant email in credentials");
    if (!credential.password)
      throw new Error("Missing tenant password in credentials");
    if (!credential.cf_access_client_id)
      throw new Error("Missing CF Access Client ID");
    if (!credential.cf_access_client_secret)
      throw new Error("Missing CF Access Client Secret");
  }

  private async stepClaimToken(
    device: Device,
    claimTokenId: string,
    credential: TenantUserCredential,
    attemptNumber: number,
  ): Promise<void> {
    const step = "claim_token";
    const { token: tenantToken } = await this.tenantApiService.getAccessToken(
      device.tenant_id,
    );
    const requestBody = { claimTokenId };

    await this.createLog(
      device.device_id,
      step,
      "in_progress",
      `Claiming token ${claimTokenId}`,
      JSON.stringify(requestBody),
      undefined,
      attemptNumber,
    );
    const t = Date.now();

    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${TENANT_API_BASE_URL}/tenantApi/claim-token`,
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
              accept: "application/json",
              Authorization: `Bearer ${tenantToken}`,
              "CF-Access-Client-Id": credential.cf_access_client_id,
              "CF-Access-Client-Secret": credential.cf_access_client_secret,
            },
          },
        ),
      );
      await this.updateLog(
        device.device_id,
        step,
        "success",
        "Token claimed successfully",
        JSON.stringify(data),
        Date.now() - t,
      );
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message;
      await this.updateLog(
        device.device_id,
        step,
        "failed",
        `Claim failed: ${errorMsg}`,
        JSON.stringify(error.response?.data),
        Date.now() - t,
      );
      throw new Error(`Claim token failed: ${errorMsg}`);
    }
  }

  async updateDeviceStatus(
    deviceId: number,
    status: string,
    statusMessage?: string,
  ): Promise<void> {
    // "authenticated" is a terminal state — never let a concurrent auth flow
    // (cloud path completing after the gateway path already finished) clobber it.
    if (status !== "authenticated") {
      const current = await this.deviceRepo.findOne({
        where: { device_id: deviceId },
        select: ["device_id", "status"],
      });
      if (current?.status === "authenticated") {
        this.logger.log(
          `Device ${deviceId} already authenticated — skipping status downgrade to "${status}"`,
        );
        return;
      }
    }

    const updateData: any = { status };
    if (statusMessage) updateData.status_message = statusMessage;
    await this.deviceRepo.update(deviceId, updateData);
    this.logger.log(`Device ${deviceId} status → ${status}`);
  }

  async updateDeviceStatusMessage(
    deviceId: number,
    message: string,
  ): Promise<void> {
    await this.deviceRepo.update(deviceId, { status_message: message });
  }

  private async createLog(
    deviceId: number,
    step: string,
    status: string,
    message: string,
    requestData?: string,
    durationMs?: number,
    attemptNumber = 1,
    processType = "authentication",
  ): Promise<DeviceLog> {
    this.logger.log(`[${step}] ${status} — ${message}`);
    const log = this.logRepo.create({
      device_id: deviceId,
      process_type: processType,
      step,
      status,
      message,
      request_data: requestData || null,
      duration_ms: durationMs ?? null,
      attempt_number: attemptNumber,
    });
    const savedLog = await this.logRepo.save(log);
    await this.updateDeviceStatusMessage(deviceId, message);
    return savedLog;
  }

  private async updateLog(
    deviceId: number,
    step: string,
    status: string,
    message: string,
    responseData?: string,
    durationMs?: number,
  ): Promise<void> {
    this.logger.log(
      `[${step}] ${status} — ${message}${durationMs != null ? ` (${durationMs}ms)` : ""}`,
    );
    const log = await this.logRepo.findOne({
      where: { device_id: deviceId, step },
      order: { created_at: "DESC" },
    });
    if (log) {
      log.status = status;
      log.message = message;
      if (responseData) log.response_data = responseData;
      if (durationMs != null) log.duration_ms = durationMs;
      await this.logRepo.save(log);
      await this.updateDeviceStatusMessage(deviceId, message);
    } else {
      await this.createLog(
        deviceId,
        step,
        status,
        message,
        undefined,
        durationMs,
      );
    }
  }

  /**
   * FW VERIFICATION FLOW
   * 1. Request device chip to compute SHA-256 of FW + chip RW → get FW_OK/NOK + RW
   * 2. Send fwVerification to cloud SDK → cloud SDK stores permission state
   */
  async processFwVerification(device: Device): Promise<void> {
    const PT = "fw_verification";

    const credential = await this.tenantApiService.getCredentials(device.tenant_id);
    if (!device.deviceGroup) {
      const loaded = await this.deviceRepo.findOne({
        where: { device_id: device.device_id },
        relations: ["deviceGroup"],
      });
      if (loaded?.deviceGroup) device.deviceGroup = loaded.deviceGroup;
    }

    const credentials = {
      device_username: device.deviceGroup?.group_name ?? "",
      device_password: device.deviceGroup?.password ?? "",
      tenant_email: credential.email,
      tenant_password: credential.password,
      cf_access_client_id: credential.cf_access_client_id,
      cf_access_client_secret: credential.cf_access_client_secret,
    };

    const TID = device.token_id.toLowerCase();

    await this.createLog(device.device_id, "init", "in_progress", "FW Verification started", undefined, undefined, 1, PT);

    // Step 1: ask chip to compute FW verification
    await this.createLog(device.device_id, "compute_fw_verification", "in_progress", "Sending FW verification request to device chip", undefined, undefined, 1, PT);
    let fwResult: { fw_verify: string; rw: string };
    const t1 = Date.now();
    try {
      fwResult = await this.mqttService.requestComputeFWVerification(TID);
    } catch (err: any) {
      await this.createLog(device.device_id, "compute_fw_verification", "failed", err.message, undefined, Date.now() - t1, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, "FW Verification failed — chip error");
      return;
    }
    await this.createLog(
      device.device_id, "compute_fw_verification", "success",
      `Chip returned FW_VERIFY=${fwResult.fw_verify}`,
      JSON.stringify(fwResult), Date.now() - t1, 1, PT,
    );

    // Step 2: relay to cloud SDK
    await this.createLog(device.device_id, "fw_verification_cloud", "in_progress", "Sending FW verification result to cloud SDK", undefined, undefined, 1, PT);
    let cloudResponse: any;
    const t2 = Date.now();
    try {
      cloudResponse = await this.mqttRequestWithRetry(
        TID, "fwVerification", 5,
        { TID, FW_VERIFY: fwResult.fw_verify, RW: fwResult.rw },
        credentials,
      );
    } catch (err: any) {
      await this.createLog(device.device_id, "fw_verification_cloud", "failed", err.message, undefined, Date.now() - t2, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, "FW Verification failed — cloud error");
      return;
    }

    if (cloudResponse?.status?.code !== 0) {
      const msg = `fwVerification cloud failed: ${cloudResponse?.status?.result || "unknown"}`;
      await this.createLog(device.device_id, "fw_verification_cloud", "failed", msg, JSON.stringify(cloudResponse), Date.now() - t2, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, msg);
      return;
    }

    const permission = cloudResponse.payload?.permission;
    const verificationRW = cloudResponse.payload?.verificationRW;
    await this.createLog(
      device.device_id, "fw_verification_cloud", "success",
      `FW Verification recorded — permission=${permission}`,
      JSON.stringify(cloudResponse.payload), Date.now() - t2, 1, PT,
    );
    await this.updateDeviceStatus(
      device.device_id, device.status,
      `FW Verification complete: ${fwResult.fw_verify} (permission=${permission})`,
    );
    this.logger.log(`FW Verification done device=${device.device_id} fw_verify=${fwResult.fw_verify} verificationRW=${verificationRW}`);
  }

  /**
   * INSTALLATION FLOW
   * Requires a prior successful FW Verification on the cloud SDK.
   * 1. Ask device chip to compute CW_install (RW_verify || RW_verify) + RW_install
   * 2. Send fwInstallation to cloud SDK → validates FW verify store + CyberRock auth
   */
  async processInstallation(device: Device, verificationRW: string): Promise<void> {
    const PT = "installation";

    const credential = await this.tenantApiService.getCredentials(device.tenant_id);
    if (!device.deviceGroup) {
      const loaded = await this.deviceRepo.findOne({
        where: { device_id: device.device_id },
        relations: ["deviceGroup"],
      });
      if (loaded?.deviceGroup) device.deviceGroup = loaded.deviceGroup;
    }

    const credentials = {
      device_username: device.deviceGroup?.group_name ?? "",
      device_password: device.deviceGroup?.password ?? "",
      tenant_email: credential.email,
      tenant_password: credential.password,
      cf_access_client_id: credential.cf_access_client_id,
      cf_access_client_secret: credential.cf_access_client_secret,
    };

    const TID = device.token_id.toLowerCase();

    await this.createLog(device.device_id, "init", "in_progress", "Installation auth started", undefined, undefined, 1, PT);

    // Step 1: ask chip to compute CW_install + RW_install
    await this.createLog(device.device_id, "compute_installation", "in_progress", "Sending installation request to device chip", undefined, undefined, 1, PT);
    let installResult: { cw: string; rw: string };
    const t1 = Date.now();
    try {
      installResult = await this.mqttService.requestComputeInstallation(TID, verificationRW);
    } catch (err: any) {
      await this.createLog(device.device_id, "compute_installation", "failed", err.message, undefined, Date.now() - t1, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, "Installation failed — chip error");
      return;
    }
    await this.createLog(
      device.device_id, "compute_installation", "success",
      "Chip returned installation CW+RW",
      undefined, Date.now() - t1, 1, PT,
    );

    // Step 2: relay to cloud SDK
    await this.createLog(device.device_id, "installation_cloud", "in_progress", "Sending installation request to cloud SDK", undefined, undefined, 1, PT);
    let cloudResponse: any;
    const t2 = Date.now();
    try {
      cloudResponse = await this.mqttRequestWithRetry(
        TID, "fwInstallation", 6,
        { TID, CW: installResult.cw, RW: installResult.rw },
        credentials,
      );
    } catch (err: any) {
      await this.createLog(device.device_id, "installation_cloud", "failed", err.message, undefined, Date.now() - t2, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, "Installation failed — cloud error");
      return;
    }

    if (cloudResponse?.status?.code !== 0) {
      const msg = `fwInstallation cloud failed: ${cloudResponse?.status?.result || "unknown"}`;
      await this.createLog(device.device_id, "installation_cloud", "failed", msg, JSON.stringify(cloudResponse), Date.now() - t2, 1, PT);
      await this.updateDeviceStatus(device.device_id, device.status, msg);
      return;
    }

    const fwInstallation = cloudResponse.payload?.FW_INSTALLATION;
    await this.createLog(
      device.device_id, "installation_cloud", fwInstallation === "OK" ? "success" : "failed",
      `Installation result: ${fwInstallation}`,
      JSON.stringify(cloudResponse.payload), Date.now() - t2, 1, PT,
    );
    await this.updateDeviceStatus(
      device.device_id, device.status,
      `Installation ${fwInstallation === "OK" ? "authorized" : "denied"}`,
    );
  }

  async findAllLogs(): Promise<DeviceLog[]> {
    return this.logRepo.find({ order: { created_at: "DESC" } });
  }

  async findLogsByDeviceId(deviceId: number): Promise<DeviceLog[]> {
    return this.logRepo.find({
      where: { device_id: deviceId },
      order: { log_id: "DESC" },
    });
  }
}
