import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import * as mqtt from "mqtt";
import { TraceLogService } from "src/common/trace-logs/trace-log.service";
import { CloudLogInput } from "src/common/trace-logs/types";

import { SHARE_GROUP } from "./constant";

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private readonly listeners = new Map<string, (payload: any) => void>();
  private connected = false;

  // Presence callbacks registered by DeviceAuthService
  private onDeviceOnlineCb: ((tid: string) => void) | null = null;
  private onDeviceOfflineCb: ((tid: string) => void) | null = null;

  // Gateway status callback registered by DeviceAuthService
  private onGatewayStatusCb: (() => void) | null = null;


  // Gateway log callback registered by DeviceAuthService
  private onGwLogCb: ((tid: string, log: { step: string; status: string; message: string; attempt: number }) => void) | null = null;

  // Auth result callback — fired when cloud SDK publishes fault-injection auth result
  private onAuthResultCb: ((tid: string, authStatus: string) => void) | null = null;

  // Claim callback — fired when the cloud SDK forwards a CyberRock claim_token_id
  // (device flow, trustbridge mode). BE runs its tenant-api claim flow.
  private onClaimCb: ((tid: string, claimTokenId: string) => void) | null = null;

  // Tracks TIDs that are currently online.
  // Updated only via explicit "online"/"offline" MQTT status messages.
  // No time-based expiry — the SDK publishes "online" once on connect and
  // "offline" on disconnect. Expiring by time would cause devices added after
  // the SDK has been running >60s to get stuck in "idle" with no trigger.
  private readonly onlineTids = new Set<string>();


  constructor(private readonly traceLogService: TraceLogService) { }


  onModuleInit(): void {
    const host = process.env.MQTT_HOST || "localhost";
    const port = process.env.MQTT_PORT || "1883";

    this.client = mqtt.connect(`mqtt://${host}:${port}`);

    this.client.on("connect", () => {
      this.connected = true;
      this.logger.log(`Connected to MQTT broker at ${host}:${port}`);


      // Subscribe to gateway status topic
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/gw_status`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to device presence: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to device presence: sandgrain/v1/+/status",
            );
        },
      );


      // Subscribe to auth result notifications from cloud SDK (fault injection flow)
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/cloud_log`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to cloud logs: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to cloud logs: sandgrain/v1/+/cloud_log",
            );
        },
      );




      // Subscribe to device presence topic (all devices)
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/status`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to device presence: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to device presence: sandgrain/v1/+/status",
            );
        },
      );

      // Subscribe to gateway log topic (all devices)
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/gw_log`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to gateway logs: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to gateway logs: sandgrain/v1/+/gw_log",
            );
        },
      );

      // Subscribe to auth result notifications from cloud SDK (fault injection flow)
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/auth_result`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to auth results: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to auth results: sandgrain/v1/+/auth_result",
            );
        },
      );

      // Subscribe to claim-token forwards from the cloud SDK (device flow auto-claim)
      this.client.subscribe(
        `$share/${SHARE_GROUP}/sandgrain/v1/+/claim`,
        { qos: 0 },
        (err) => {
          if (err)
            this.logger.error(
              `Failed to subscribe to claim forwards: ${err.message}`,
            );
          else
            this.logger.log(
              "Subscribed to claim forwards: sandgrain/v1/+/claim",
            );
        },
      );
    });

    this.client.on("message", (topic: string, message: Buffer) => {
      console.log("message received", topic, message);
      console.log("message", message.toString());
      // Handle device presence messages
      if (this.isPresenceTopic(topic)) {
        this.handlePresenceMessage(topic, message);
        return;
      }

      // Handle cloud log messages
      if (this.isCloudLogTopic(topic)) {
        this.handleCloudLogMessage(topic, message);
        return;
      }

      // Handle gateway log messages
      if (this.isGwLogTopic(topic)) {
        this.handleGwLogMessage(topic, message);
        return;
      }

      // Handle auth result notifications from cloud SDK
      if (this.isAuthResultTopic(topic)) {
        this.handleAuthResultMessage(topic, message);
        return;
      }

      // Handle claim-token forwards from cloud SDK (device flow auto-claim)
      if (this.isClaimTopic(topic)) {
        this.handleClaimMessage(topic, message);
        return;
      }

      // Handle gateway status messages
      if (this.isGatewayStatusTopic(topic)) {
        this.handleGatewayStatusMessage(topic, message);
        return;
      }

      // Handle request/response listeners (one-time)
      const handler = this.listeners.get(topic);
      if (handler) {
        try {
          handler(JSON.parse(message.toString()));
        } catch {
          handler({ error: "Invalid JSON response from SDK" });
        }
        this.listeners.delete(topic);
        this.client.unsubscribe(topic);
      }
    });

    this.client.on("error", (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on("disconnect", () => {
      this.connected = false;
      this.logger.warn("MQTT disconnected");
    });
  }

  onModuleDestroy(): void {
    this.client?.end();
  }

  /**
   * Register callbacks for device presence events.
   * Called by DeviceAuthService on init.
   */
  registerPresenceCallbacks(
    onOnline: (tid: string) => void,
    onOffline: (tid: string) => void,
  ): void {
    this.onDeviceOnlineCb = onOnline;
    this.onDeviceOfflineCb = onOffline;
  }

  /**
   * Register a callback for gateway log messages.
   * Called by DeviceAuthService on init.
   */
  registerGwLogCallback(
    onGwLog: (tid: string, log: { step: string; status: string; message: string; attempt: number }) => void,
  ): void {
    this.onGwLogCb = onGwLog;
  }


  registerGatewayStatusCallback(cb: () => void): void {
    this.onGatewayStatusCb = cb;
  }

  /**
   * Send a request to the SDK app and wait for the response.
   * Subscribes to the response topic BEFORE publishing to avoid race conditions.
   *
   * @param tid       Device TID — used in topic routing
   * @param action    MQTT action: requestCW | requestRW | replyRW
   * @param msgType   Numeric type: 0=requestCW, 2=requestRW, 1=replyRW
   * @param payload   Action-specific fields (TID, CW, RW, transactionId)
   * @param credentials  Credentials from TrustBridge DB — passed to SDK
   * @param timeoutMs Response timeout in ms (default 60s)
   */
  async request(
    tid: string,
    action: string,
    msgType: number,
    payload: Record<string, any>,
    credentials: Record<string, string>,
    timeoutMs = 60_000,
  ): Promise<any> {
    const reqTopic = `sandgrain/v1/${tid}/req/${action}`;
    const rspTopic = `sandgrain/v1/${tid}/rsp/${action}`;

    // Subscribe FIRST then publish — avoids race where response arrives before listener is set
    const responsePromise = this._waitForResponse(rspTopic, timeoutMs);

    this.client.publish(
      reqTopic,
      JSON.stringify({ type: msgType, payload, credentials }),
    );

    this.logger.log(`Published ${action} for TID=${tid}`);
    return responsePromise;
  }

  async checkHealth(): Promise<boolean> {
    return this.connected;
  }

  /**
   * Send CW to physical device chip and wait for real RW back.
   * Used in online device auth flow.
   *
   * Device C SDK listens on: sandgrain/v1/{tid}/req/computeRW
   * Device C SDK responds on: sandgrain/v1/{tid}/rsp/computeRW
   */
  async requestComputeRW(
    tid: string,
    cw: string,
    faultMode: 0 | 1 | 2 = 0,
    timeoutMs = 60_000,
  ): Promise<string> {
    const reqTopic = `sandgrain/v1/${tid}/req/computeRW`;
    const rspTopic = `sandgrain/v1/${tid}/rsp/computeRW`;
    const start = Date.now();

    const responsePromise = this._waitForResponse(rspTopic, timeoutMs);
    const requestData = { type: 4, payload: { CW: cw, fault_mode: faultMode } };
    this.client.publish(
      reqTopic,
      JSON.stringify(requestData),
      { qos: 1 },
    );

    this.logger.log(`Published computeRW for TID=${tid} fault_mode=${faultMode}`);

    const response = await responsePromise;

    if (response?.status?.code !== 0) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "authentication", step: "request_rw", status: "failed",
        request_data: requestData,
        message: response?.status?.result || "unknown error",
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
      });
      throw new Error(
        `computeRW failed: ${response?.status?.result || "unknown error"}`,
      );
    }

    if (!response?.payload?.RW) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "authentication", step: "request_rw", status: "failed",
        message: "computeRW response missing RW",
        request_data: requestData,
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
      });
      throw new Error("computeRW response missing RW");
    }

    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      process_type: "authentication", step: "request_rw", status: "success",
      request_data: requestData,
      response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
    });

    return response.payload.RW as string;
  }

  /**
   * Ask the physical device chip to perform FW verification.
   * Device computes SHA-256 of its FW image, gets chip RW, and reports FW_OK/FW_NOK.
   *
   * Device listens on: sandgrain/v1/{tid}/req/computeFWVerification
   * Device responds on: sandgrain/v1/{tid}/rsp/computeFWVerification
   */
  async requestComputeFWVerification(
    tid: string,
    timeoutMs = 60_000,
  ): Promise<{ fw_verify: string; rw: string }> {
    const reqTopic = `sandgrain/v1/${tid}/req/computeFWVerification`;
    const rspTopic = `sandgrain/v1/${tid}/rsp/computeFWVerification`;
    const start = Date.now();

    const responsePromise = this._waitForResponse(rspTopic, timeoutMs);

    this.client.publish(reqTopic, JSON.stringify({ type: 5, payload: {} }), { qos: 1 });
    this.logger.log(`Published computeFWVerification for TID=${tid}`);

    const response = await responsePromise;

    if (response?.status?.code !== 0) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "fw_verification", step: "compute_fw_verification", status: "failed",
        message: response?.status?.result || 'unknown error',
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
      });
      throw new Error(
        `computeFWVerification failed: ${response?.status?.result || 'unknown error'}`,
      );
    }
    if (!response?.payload?.FW_VERIFY || !response?.payload?.RW) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "fw_verification", step: "compute_fw_verification", status: "failed",
        message: 'computeFWVerification response missing FW_VERIFY or RW',
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
      });
      throw new Error('computeFWVerification response missing FW_VERIFY or RW');
    }

    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      process_type: "fw_verification", step: "compute_fw_verification", status: "success",
      response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
    });


    return { fw_verify: response.payload.FW_VERIFY as string, rw: response.payload.RW as string };
  }

  /**
   * Ask the physical device chip to perform Installation auth computation.
   * Backend provides the FW_RW (from prior FW verification); device builds
   * CW_install = RW_verify || RW_verify and returns CW + RW for the cloud SDK.
   *
   * Device listens on: sandgrain/v1/{tid}/req/computeInstallation
   * Device responds on: sandgrain/v1/{tid}/rsp/computeInstallation
   */
  async requestComputeInstallation(
    tid: string,
    fwRw: string,
    timeoutMs = 60_000,
  ): Promise<{ cw: string; rw: string }> {
    const reqTopic = `sandgrain/v1/${tid}/req/computeInstallation`;
    const rspTopic = `sandgrain/v1/${tid}/rsp/computeInstallation`;
    const start = Date.now();

    const responsePromise = this._waitForResponse(rspTopic, timeoutMs);
    const requestData = { type: 6, payload: { FW_RW: fwRw } };
    this.client.publish(
      reqTopic,
      JSON.stringify(requestData),
      { qos: 1 },
    );
    this.logger.log(`Published computeInstallation for TID=${tid}`);

    const response = await responsePromise;

    if (response?.status?.code !== 0) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "installation", step: "compute_installation", status: "failed",
        message: response?.status?.result || 'unknown error',
        request_data: requestData,
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
      });
      throw new Error(
        `computeInstallation failed: ${response?.status?.result || 'unknown error'}`,
      );
    }
    if (!response?.payload?.CW || !response?.payload?.RW) {
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        process_type: "installation", step: "compute_installation", status: "failed",
        message: 'computeInstallation response missing CW or RW',
        response_data: response, duration_ms: Date.now() - start, attempt_number: 1,
        request_data: requestData,
      });
      throw new Error('computeInstallation response missing CW or RW');
    }

    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      process_type: "installation", step: "compute_installation", status: "success",
      response_data: response, request_data: requestData, duration_ms: Date.now() - start, attempt_number: 1,
    });

    return { cw: response.payload.CW as string, rw: response.payload.RW as string };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private isPresenceTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "status"
    );
  }


  private isGatewayStatusTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "gw_status"
    );
  }

  private isGwLogTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "gw_log"
    );
  }


  private isCloudLogTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "cloud_log"
    );
  }


  private isAuthResultTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "auth_result"
    );
  }

  private handleAuthResultMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    const tid = parts[2].toLowerCase();
    let payload: { auth_status: string, gateway_id: string, app_message_seq: number };
    try {
      payload = JSON.parse(message.toString());
    } catch {
      this.logger.warn(`Invalid JSON in auth_result from TID=${tid}`);
      return;
    }
    this.logger.log(`Auth result: TID=${tid} auth_status=${payload.auth_status}`);
    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      edge_node_id: payload.gateway_id ?? null,
      app_seq_scope: payload.app_message_seq !== undefined ? "leaf" : undefined,
      app_message_seq: payload.app_message_seq ?? undefined,
      process_type: "authentication",
      step: "auth_result",
      status: payload?.auth_status?.toLowerCase() === "auth_ok" ? "success" : "failed",
      response_data: payload,
      attempt_number: 1,
    });
    if (this.onAuthResultCb) this.onAuthResultCb(tid, payload.auth_status);
  }

  registerAuthResultCallback(
    onAuthResult: (tid: string, authStatus: string) => void,
  ): void {
    this.onAuthResultCb = onAuthResult;
  }

  private isClaimTopic(topic: string): boolean {
    const parts = topic.split("/");
    return (
      parts.length === 4 &&
      parts[0] === "sandgrain" &&
      parts[1] === "v1" &&
      parts[3] === "claim"
    );
  }

  private handleClaimMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    const tid = parts[2].toLowerCase();
    let payload: { claim_token_id?: string };
    try {
      payload = JSON.parse(message.toString());
    } catch {
      this.logger.warn(`Invalid JSON in claim forward from TID=${tid}`);
      return;
    }
    const claimTokenId = payload.claim_token_id;
    if (!claimTokenId) {
      this.logger.warn(`claim forward missing claim_token_id (TID=${tid})`);
      this.traceLogService.log({
        leaf_id: tid,
        event_scope: "leaf",
        response_data: JSON.parse(message.toString()),
        process_type: "installation",
        step: "claim",
        status: "failed",
        message: "claim forward missing claim_token_id",
        request_data: payload,
        attempt_number: 1,
      });
      return;
    }
    this.logger.log(`Claim forward: TID=${tid} claim_token_id=${claimTokenId}`);
    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      response_data: JSON.parse(message.toString()),
      process_type: "installation",
      step: "claim",
      status: "success",
      request_data: payload,
      attempt_number: 1,
    });
    if (this.onClaimCb) this.onClaimCb(tid, claimTokenId);
  }

  private handleGatewayStatusMessage(topic: string, message: Buffer): void {
    let status: string;
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(message.toString());
      status = (parsedPayload as any)?.status || String(parsedPayload);
    } catch {
      status = message.toString().trim();
      parsedPayload = status;
    }
    console.log("Gateway status message received", message.toString(), topic);
    if (status === "online") {
      if (this.onGatewayStatusCb) this.onGatewayStatusCb();
    } else if (status === "offline") {
      console.log("Gateway status message received", message.toString(), topic);
      // TODO: handle offline status
    }
    const parts = topic.split("/");
    const ipAddress = parts[2];
    this.traceLogService.log({
      edge_node_id: ipAddress ?? null,
      event_scope: "edge_node",
      response_data: parsedPayload,
      process_type: "authentication",
      step: "gw_status",
      status: status?.toLowerCase() === "online" ? "success" : "failed",
      message: `gateway ${status}`,
      attempt_number: 1,
    });
    return;
  }

  registerClaimCallback(
    onClaim: (tid: string, claimTokenId: string) => void,
  ): void {
    this.onClaimCb = onClaim;
  }

  private handleGwLogMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    const tid = parts[2].toLowerCase();

    let log: { step: string; status: string; message: string; attempt: number, gateway_id: string, app_message_seq: number };
    try {
      log = JSON.parse(message.toString());
    } catch {
      this.logger.warn(`Invalid JSON in gw_log from TID=${tid}`);
      return;
    }

    this.logger.log(
      `GW log: TID=${tid} step=${log.step} status=${log.status} attempt=${log.attempt} — ${log.message}`,
    );

    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "edge_node",
      edge_node_id: log.gateway_id ?? null,
      app_seq_scope: log.app_message_seq !== undefined ? "edge_node" : undefined,
      app_message_seq: log.app_message_seq ?? undefined,
      process_type: "authentication",
      step: `gw:${log?.step}`,
      status: log?.status?.toLowerCase() === "ok" ? "success" : "failed",
      message: `[Gateway] ${log?.message}`,
      response_data: JSON.parse(message.toString()),
      attempt_number: log?.attempt,
    });

    if (this.onGwLogCb) this.onGwLogCb(tid, log);
  }

  private handlePresenceMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    const tid = parts[2].toLowerCase();

    let status: string;
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(message.toString());
      status = (parsedPayload as any)?.status || String(parsedPayload);
    } catch {
      status = message.toString().trim();
      parsedPayload = status; // not valid JSON, fall back to the raw string
    }

    this.logger.log(`Device presence: TID=${tid} status=${status}`);

    if (status === "online") {
      this.onlineTids.add(tid);
      this.logger.log(
        `Added TID=${tid} to onlineTids. Current: ${JSON.stringify([...this.onlineTids])}`,
      );
      if (this.onDeviceOnlineCb) this.onDeviceOnlineCb(tid);
    } else if (status === "offline") {
      this.onlineTids.delete(tid);
      this.logger.log(
        `Removed TID=${tid} from onlineTids. Current: ${JSON.stringify([...this.onlineTids])}`,
      );
      if (this.onDeviceOfflineCb) this.onDeviceOfflineCb(tid);
    }

    this.traceLogService.log({
      leaf_id: tid,
      event_scope: "leaf",
      process_type: "authentication",
      step: "device_status",
      status: status?.toLowerCase() === "online" ? "success" : "failed",
      message: `device ${status}`,
      response_data: parsedPayload,
      attempt_number: 1,
    });
  }

  isDeviceOnline(tid: string): boolean {
    return this.onlineTids.has(tid.toLowerCase());
  }

  publish(topic: string, payload: string): void {
    this.client.publish(topic, payload, { qos: 0 });
  }

  /**
   * Get list of currently online TIDs (for debugging)
   */
  getOnlineTids(): string[] {
    return [...this.onlineTids];
  }

  private _waitForResponse(topic: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(topic);
        this.client.unsubscribe(topic);
        reject(new Error(`MQTT timeout waiting for response on ${topic}`));
      }, timeoutMs);

      this.client.subscribe(topic, (err) => {
        if (err) {
          clearTimeout(timer);
          reject(new Error(`MQTT subscribe failed: ${err.message}`));
          return;
        }
      });

      this.listeners.set(topic, (payload: any) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }


  // cloud log handler
  private handleCloudLogMessage(topic: string, message: Buffer): void {
    const parts = topic.split("/");
    const tid = parts[2].toLowerCase();

    let log: CloudLogInput;

    try {
      log = JSON.parse(message.toString());
    } catch {
      this.logger.warn(`Invalid JSON in cloud_log from TID=${tid}`);
      return;
    }

    this.logger.log(
      `Cloud log: TID=${tid} component=${log.component} action=${log.action} — ${log.message}`,
    );

    const status = this.resolveCloudLogStatus(log.status);
    if (!status) return;

    this.traceLogService.log({
      leaf_id: log.device_id?.toLowerCase() ?? tid,
      edge_node_id: log.gateway_id ?? null,
      event_scope: "cloud",
      app_seq_scope: log.app_seq_scope === "device" ? "leaf" : undefined,
      app_message_seq: log.app_message_seq ?? undefined,
      process_type: this.resolveCloudProcessType(log.action),
      step: `cloud:${log.component ?? "unknown"}:${log.action ?? "log"}`,
      status: status,
      message: log.message,
      request_data: log.request_data,
      response_data: log,
      duration_ms: log.dt_ms,
      attempt_number: log.app_message_seq ?? 1,
    });
  }

  private resolveCloudProcessType(
    action?: string,
  ): "authentication" | "fw_verification" | "installation" {
    if (!action) return "authentication";
    const a = action.toLowerCase();
    if (a.includes("fwverification")) return "fw_verification";
    if (a.includes("installation")) return "installation";
    return "authentication"; // requestCW, replyRW, requestRW, etc.
  }

  private resolveCloudLogStatus(status?: string): string {
    if (!status) return null;
    switch (status?.toLowerCase()) {
      case "success":
        return "success";
      case "failed":
        return "failed";
      case "in_progress":
        return "in_progress";
      default:
        return null;
    }
  }
}
