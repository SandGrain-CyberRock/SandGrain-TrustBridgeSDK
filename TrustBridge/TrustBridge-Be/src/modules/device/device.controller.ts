import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
  Query,
  Res,
  StreamableFile,
  Req,
} from "@nestjs/common";
import { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
  ApiQuery,
} from "@nestjs/swagger";
import { DeviceService } from "./device.service";
import { DeviceAuthService } from "./device-auth.service";
import { CreateDeviceDto } from "./dto/create-device.dto";
import { UpdateDeviceDto } from "./dto/update-device.dto";
import {
  BulkImportDeviceDto,
  BulkImportResponseDto,
} from "./dto/bulk-import-device.dto";
import { parseBulkImport } from "./utils/parse-bulk-import";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";
import { Permissions, Public } from "../../common/decorators";
import {
  DeviceResponseDto,
  DeviceListResponseDto,
  MessageResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ErrorResponseDto,
  ConflictResponseDto,
} from "../../common/dto";

@ApiTags("Devices")
@ApiBearerAuth("JWT-auth")
@Controller("devices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly deviceAuthService: DeviceAuthService,
  ) {}

  @Post()
  @Permissions("device:create")
  @ApiOperation({
    summary: "Register a new device",
    description:
      "Register a new device. The device starts in `idle` status. Requires `device:create` permission.",
  })
  @ApiBody({ type: CreateDeviceDto })
  @ApiResponse({
    status: 201,
    description: "Device registered successfully",
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Device with this name already exists",
    type: ConflictResponseDto,
  })
  async create(@Req() req: any, @Body() createDto: CreateDeviceDto) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.deviceService.create(createDto, tenantIds);
    return {
      data,
      message: `Device '${data.device_name}' created successfully`,
    };
  }

  @Post("bulk-import")
  @Permissions("device:create")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Bulk import devices",
    description:
      "Import devices from a JSON file using the TrustBridge Device Import V1.0 format. " +
      "The JSON contains batch metadata and a devices array with per-device group, tenant, profile, and credentials. " +
      "Existing devices (matched by TID) can be updated via overwrite_existing flags per section. " +
      "Background auth runs for each device after import (unless cr-already_used is true). " +
      "Requires `device:create` permission.",
  })
  @ApiBody({ type: BulkImportDeviceDto })
  @ApiResponse({
    status: 201,
    description: "Devices imported successfully",
    type: BulkImportResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Validation failed - invalid file or device data",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  async bulkImport(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const tenantId = tenantIds[0];

    if (!file) {
      throw new BadRequestException("File is required.");
    }
    if (!tenantId) {
      throw new BadRequestException(
        "No tenant configured for your organization.",
      );
    }

    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (ext !== "json") {
      throw new BadRequestException("Only .json files are supported.");
    }

    const parsed = parseBulkImport(file.buffer);

    const result = await this.deviceService.bulkImportV2(parsed, tenantId);
    return {
      data: {
        count: result.count,
        batch_no: parsed.batch_no,
        batch_description: parsed.batch_description,
        ...(result.errors.length > 0 ? { errors: result.errors } : {}),
      },
      message: `${result.count} devices imported successfully${result.errors.length > 0 ? `. ${result.errors.length} device(s) skipped.` : ""}`,
    };
  }

  @Post("lifecycle/bulk-auth")
  @Permissions("device:create")
  @ApiOperation({
    summary: "Bulk lifecycle authentication",
    description:
      "Trigger Option-2 (Fault Injection) auth for all claimed devices (or supplied IDs) in the background. " +
      "When auth completes per device, is_active is set: auth_ok → true, auth_fail → false.",
  })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        device_ids: {
          type: "array",
          items: { type: "number" },
          description: "Optional specific device IDs — omit to process all claimed devices.",
        },
      },
    },
  })
  async bulkLifecycleAuth(@Body() body: { device_ids?: number[] }) {
    const result = await this.deviceService.bulkLifecycleAuth(body?.device_ids);
    return {
      data: result,
      message: `Lifecycle authentication queued for ${result.queued} device(s)`,
    };
  }

  @Post("bulk-authenticate")
  @Permissions("device:create")
  @ApiOperation({
    summary: "Bulk authenticate idle/rejected devices",
    description:
      "Trigger background re-authentication for idle and/or rejected devices. " +
      "Supply optional filters (device_ids, device_group_id, profile_id, statuses) to scope which devices are processed. " +
      "Defaults to all idle + rejected devices when no filters are provided. Requires `device:create` permission.",
  })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        device_ids: {
          type: "array",
          items: { type: "number" },
          description: "Specific device IDs to authenticate (optional).",
        },
        device_group_id: {
          type: "number",
          description: "Filter by device group ID (optional).",
        },
        profile_id: {
          type: "number",
          description: "Filter by device profile ID (optional).",
        },
        statuses: {
          type: "array",
          items: { type: "string", enum: ["idle", "rejected"] },
          description:
            "Which statuses to target. Defaults to [idle, rejected].",
        },
      },
    },
  })
  async bulkAuthenticate(
    @Body()
    body: {
      device_ids?: number[];
      device_group_id?: number;
      profile_id?: number;
      statuses?: string[];
    },
  ) {
    const result = await this.deviceService.bulkAuthenticate(body ?? {});
    return {
      data: result,
      message: `Authentication queued for ${result.queued} device(s), ${result.skipped} skipped`,
    };
  }

  @Post(":id/authenticate")
  @Permissions("device:create")
  @ApiOperation({
    summary: "Re-authenticate a device",
    description:
      "Trigger the background authentication process again for an existing device. Resets device status to `idle` and runs all auth steps. Requires `device:create` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Authentication process triggered",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Device not found",
    type: NotFoundResponseDto,
  })
  async authenticate(@Param("id", ParseIntPipe) id: number) {
    return this.deviceService.reAuthenticate(id);
  }

  @Post(":id/run-process")
  @Permissions("device:create")
  @ApiOperation({
    summary: "Run a post-enrollment process on a claimed device",
    description:
      "Trigger one of the available processes: `authentication`, `fw_verification`, or `installation`. " +
      "For `installation`, also provide `verification_rw` from the prior FW Verification log. Requires `device:create` permission.",
  })
  @ApiParam({ name: "id", type: Number, description: "Device ID" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["process_type"],
      properties: {
        process_type: {
          type: "string",
          enum: ["authentication", "fw_verification", "installation"],
          example: "fw_verification",
        },
        verification_rw: {
          type: "string",
          description: "Required only for installation — the verificationRW from the prior FW Verification",
          example: "a1b2c3d4e5f60718...",
        },
        auth_option: {
          type: "number",
          enum: [1, 2, 3],
          description: "Authentication mode: 1=Normal Flow, 2=Fault Injection, 3=Error Stress. Only for authentication process_type.",
          example: 1,
        },
      },
    },
  })
  async runProcess(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: {
      process_type: "authentication" | "fw_verification" | "installation";
      verification_rw?: string;
      auth_option?: 1 | 2 | 3;
    },
  ) {
    if (!["authentication", "fw_verification", "installation"].includes(body.process_type)) {
      throw new BadRequestException(`Invalid process_type: ${body.process_type}`);
    }
    const result = await this.deviceService.runProcess(id, body.process_type, {
      verification_rw: body.verification_rw,
      auth_option: body.auth_option,
    });
    return { data: result, message: result.message };
  }

  @Post("move/to-authenticated")
  @Permissions("device:update")
  @ApiOperation({
    summary: "Move approved devices to authenticated",
    description:
      "Move approved devices to authenticated status. Pass optional `device_ids` array in body to move specific devices, or omit to move all approved devices. Only devices in `approved` status can be moved. Requires `device:update` permission.",
  })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        device_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "Optional array of device IDs to move. If omitted, all approved devices are moved.",
          example: [1, 2, 3],
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Move process completed",
    schema: {
      type: "object",
      properties: {
        moved: { type: "number", description: "Total devices processed" },
        success: {
          type: "number",
          description: "Successfully moved devices",
        },
        failed: { type: "number", description: "Failed moves" },
        logs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              device_id: { type: "number" },
              device_name: { type: "string" },
              status: { type: "string", enum: ["success", "failed"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "One or more devices not in approved status",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  async moveToAuthenticated(@Body() body: { device_ids?: number[] }) {
    return this.deviceService.moveToAuthenticated(body?.device_ids);
  }

  @Public()
  @Get("credentials-by-tid")
  @ApiOperation({
    summary: "Get device credentials by TID (internal SDK use)",
    description: "Returns device group credentials for a given TID. Used by the cloud SDK to authenticate with CyberRock. No JWT required.",
  })
  async getCredentialsByTid(@Query("tid") tid: string) {
    return this.deviceService.getCredentialsByTid(tid);
  }

  @Public()
  @Get("whitelist")
  @ApiOperation({
    summary: "Get gateway whitelist (internal SDK use)",
    description: "Returns all enrolled device TIDs as plain text (one per line). Used by the local gateway to load its whitelist on startup. No JWT required.",
  })
  async getWhitelist(@Res() res: Response) {
    const tids = await this.deviceService.getEnrolledTids();
    res.setHeader("Content-Type", "text/plain");
    res.send(tids.join("\n"));
  }

  @Get("by-status")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get devices by status",
    description:
      "Retrieve devices filtered by status. Pass comma-separated status values in query parameter. Requires `device:retrieve` permission.",
  })
  @ApiResponse({
    status: 200,
    description: "Devices retrieved successfully",
    type: DeviceListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Status query parameter is required",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden",
    type: ForbiddenResponseDto,
  })
  getByStatus(@Query("status") statusQuery: string) {
    const statuses = statusQuery
      ? statusQuery.split(",").map((s) => s.trim())
      : [];
    if (statuses.length === 0) {
      throw new BadRequestException("status query parameter is required");
    }
    return this.deviceService.findByStatus(statuses);
  }

  @Get()
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get all devices",
    description:
      "Retrieve devices with pagination and optional search. Requires `device:retrieve` permission.",
  })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Search by device ID, token ID, or device name",
  })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description:
      "Filter by connection status (e.g., 'authenticated', '!authenticated' to exclude)",
  })
  @ApiQuery({ name: "device_group_id", required: false, type: Number })
  @ApiQuery({ name: "profile_id", required: false, type: Number })
  @ApiQuery({ name: "is_active", required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: "Paginated list of devices retrieved successfully",
    type: DeviceListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  findAll(
    @Req() req: any,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("device_group_id") deviceGroupId?: string,
    @Query("profile_id") profileId?: string,
    @Query("is_active") isActiveRaw?: string,
  ) {
    const is_active =
      isActiveRaw === "true"
        ? true
        : isActiveRaw === "false"
          ? false
          : undefined;
    // Get tenant_ids from JWT user (set by jwtstrategy)
    const tenantIds = req?.user?.tenant_ids || [];
    return this.deviceService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      search,
      status,
      deviceGroupId ? parseInt(deviceGroupId, 10) : undefined,
      profileId ? parseInt(profileId, 10) : undefined,
      is_active,
      tenantIds,
    );
  }

  @Get("by-tenant")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get devices by tenant",
    description:
      "Retrieve devices for a specific tenant using query parameter `tenant_id`. Requires `device:retrieve` permission.",
  })
  @ApiResponse({
    status: 200,
    description: "Devices retrieved successfully for tenant",
    type: DeviceListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "tenant_id query parameter is required",
    type: ErrorResponseDto,
  })
  findByTenant(@Query("tenant_id") tenantId: string) {
    if (!tenantId) {
      throw new BadRequestException("tenant_id query parameter is required");
    }
    return this.deviceService.findByTenant(tenantId);
  }

  @Get("export")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Export devices",
    description:
      "Export all devices (or filtered by status) to a downloadable file. Supports Excel (.xlsx), CSV, and JSON formats. Requires `device:retrieve` permission.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "Comma-separated status values to filter (e.g. approved,claimed). If omitted, all devices are exported.",
  })
  @ApiQuery({
    name: "format",
    required: false,
    enum: ["xlsx", "csv", "json"],
    description: "Export format: xlsx (default), csv, or json.",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by device ID, name, or token",
  })
  @ApiQuery({ name: "device_group_id", required: false, type: Number })
  @ApiQuery({
    name: "profile_id",
    required: false,
    type: Number,
    description: "0 = unassigned",
  })
  @ApiResponse({
    status: 200,
    description: "File downloaded",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden",
    type: ForbiddenResponseDto,
  })
  async exportDevices(
    @Query("status") statusQuery: string,
    @Query("format") format: string,
    @Query("search") search: string,
    @Query("device_group_id") deviceGroupId: string,
    @Query("profile_id") profileId: string,
    @Res() res: Response,
  ) {
    const status = statusQuery || undefined;
    const groupId = deviceGroupId ? parseInt(deviceGroupId, 10) : undefined;
    const profId = profileId ? parseInt(profileId, 10) : undefined;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "csv") {
      const buffer = await this.deviceService.exportDevicesToCsv(
        search,
        status,
        groupId,
        profId,
      );
      res.set({
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=devices-export-${timestamp}.csv`,
      });
      res.send(buffer);
    } else if (format === "json") {
      const buffer = await this.deviceService.exportDevicesToJson(
        search,
        status,
        groupId,
        profId,
      );
      res.set({
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=devices-export-${timestamp}.json`,
      });
      res.send(buffer);
    } else {
      const buffer = await this.deviceService.exportDevicesToExcel(
        search,
        status,
        groupId,
        profId,
      );
      res.set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=devices-export-${timestamp}.xlsx`,
      });
      res.send(buffer);
    }
  }

  @Get("search")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Search devices",
    description:
      "Search devices by device ID, token ID, or device name. Requires `device:retrieve` permission.",
  })
  @ApiQuery({
    name: "q",
    required: true,
    description:
      "Search term to match against device_id, token_id, or device_name",
  })
  @ApiResponse({
    status: 200,
    description: "Search results",
    type: DeviceListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Search query is required",
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden",
    type: ForbiddenResponseDto,
  })
  async searchDevices(@Query("q") query: string) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException("q query parameter is required");
    }
    const data = await this.deviceService.searchDevices(query.trim());
    return { data, message: "Devices search results retrieved successfully" };
  }

  @Get("status-counts")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get device status counts",
    description:
      "Get the count of devices grouped by status (idle, claimed, rejected). Requires `device:retrieve` permission.",
  })
  @ApiResponse({
    status: 200,
    description: "Status counts retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden",
    type: ForbiddenResponseDto,
  })
  getStatusCounts() {
    return this.deviceService.getStatusCounts();
  }

  @Get("logs")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get all device authentication logs",
    description:
      "Retrieve all authentication process logs across all devices. Requires `device:retrieve` permission.",
  })
  @ApiResponse({
    status: 200,
    description: "All device logs retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  findAllLogs() {
    return this.deviceAuthService.findAllLogs();
  }

  // ── Lifecycle GET helpers (literal routes — must precede :id/* routes) ──────

  @Get("lifecycle/tenant-users")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "List tenant users (for lifecycle transfer)",
    description: "Returns all tenant users available for transfer via the SandGrain API.",
  })
  @ApiQuery({ name: "device_id", required: true, type: Number, description: "Any claimed/authenticated device ID to resolve tenant credentials" })
  async getLifecycleTenantUsers(@Query("device_id") deviceId: string) {
    if (!deviceId) throw new BadRequestException("device_id is required");
    const data = await this.deviceService.getLifecycleTenantUsers(parseInt(deviceId, 10));
    return { data, message: "Tenant users retrieved successfully" };
  }

  @Get("lifecycle/iot-users")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "List IoT users / device groups (for lifecycle transfer)",
    description: "Returns IoT users for the given tenant user IDs.",
  })
  @ApiQuery({ name: "device_id", required: true, type: Number })
  @ApiQuery({ name: "tenant_user_ids", required: true, type: String, description: "Comma-separated tenant user IDs" })
  async getLifecycleIotUsers(
    @Query("device_id") deviceId: string,
    @Query("tenant_user_ids") tenantUserIdsRaw: string,
  ) {
    if (!deviceId) throw new BadRequestException("device_id is required");
    if (!tenantUserIdsRaw) throw new BadRequestException("tenant_user_ids is required");
    const tenantUserIds = tenantUserIdsRaw.split(",").map((s) => s.trim());
    const data = await this.deviceService.getLifecycleIotUsers(parseInt(deviceId, 10), tenantUserIds);
    return { data, message: "IoT users retrieved successfully" };
  }

  // ── :id routes ───────────────────────────────────────────────────────────

  @Get(":id/logs")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get device authentication logs by device ID",
    description:
      "Retrieve authentication process logs for a specific device. Use this to monitor background auth progress. Requires `device:retrieve` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Device logs retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  findLogs(@Param("id", ParseIntPipe) id: number) {
    return this.deviceAuthService.findLogsByDeviceId(id);
  }

  @Get(":id/tid-status")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get TID lifecycle status from SandGrain",
    description: "Calls the SandGrain search-by-tid API and returns the current token serial status.",
  })
  @ApiParam({ name: "id", type: Number, description: "Device ID" })
  async getTidStatus(@Param("id", ParseIntPipe) id: number) {
    const data = await this.deviceService.getTidStatus(id);
    return { data, message: "TID status retrieved successfully" };
  }

  @Put(":id/lifecycle")
  @Permissions("device:update")
  @ApiOperation({
    summary: "Update device lifecycle status",
    description:
      "Sends the new status to SandGrain (PUT token-serials/{tid}) and mirrors is_active locally. " +
      "Active: AssetStatusActive, AssetOwnedAndActive. Inactive: AssetNonActive, ReadyForHandOver, AssetEndOfLife.",
  })
  @ApiParam({ name: "id", type: Number, description: "Device ID" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", example: "AssetNonActive" },
        applyToAllDelegates: { type: "boolean", example: false },
        iotId: { type: "string", description: "IoT user ID for transfer (optional)" },
      },
    },
  })
  async updateLifecycle(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { status: string; applyToAllDelegates?: boolean; iotId?: string },
  ) {
    const data = await this.deviceService.updateDeviceLifecycle(id, body);
    return { data, message: `Device lifecycle updated to ${body.status}` };
  }

  @Get(":id")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Get device by ID",
    description:
      "Retrieve a specific device by its ID. Requires `device:retrieve` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Device found",
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Device not found",
    type: NotFoundResponseDto,
  })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.deviceService.findOne(id);
    return {
      data,
      message: "Device details retrieved successfully",
    };
  }

  @Get(":id/connectivity")
  @Permissions("device:retrieve")
  @ApiOperation({
    summary: "Check device connectivity",
    description:
      "Check if a device is currently online via MQTT. Requires `device:retrieve` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Device connectivity status",
    schema: {
      example: {
        data: {
          is_online: true,
          last_seen_at: "2024-01-15T10:30:00.000Z",
        },
        message: "Device connectivity checked",
      },
    },
  })
  @ApiResponse({ status: 404, description: "Device not found" })
  async checkConnectivity(@Param("id", ParseIntPipe) id: number) {
    const data = await this.deviceService.checkConnectivity(id);
    return {
      data,
      message: "Device connectivity checked",
    };
  }

  @Patch(":id")
  @Permissions("device:update")
  @ApiOperation({
    summary: "Update device",
    description:
      "Update an existing device. Can be used to change status (approve/reject). Requires `device:update` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiBody({ type: UpdateDeviceDto })
  @ApiResponse({
    status: 200,
    description: "Device updated successfully",
    type: DeviceResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Device not found",
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Device with this name already exists",
    type: ConflictResponseDto,
  })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdateDeviceDto,
  ) {
    const data = await this.deviceService.update(id, updateDto);
    return {
      data,
      message: `Device '${data.device_name}' updated successfully`,
    };
  }

  @Delete(":id")
  @Permissions("device:delete")
  @ApiOperation({
    summary: "Delete device",
    description: "Soft delete a device. Requires `device:delete` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Device deleted successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Missing required permission",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Device not found",
    type: NotFoundResponseDto,
  })
  async remove(@Param("id", ParseIntPipe) id: number) {
    const device = await this.deviceService.findOne(id);
    await this.deviceService.remove(id);
    return {
      data: { deleted: true },
      message: `Device '${device.device_name}' deleted successfully`,
    };
  }
}
