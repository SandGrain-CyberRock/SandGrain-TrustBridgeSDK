import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { TenantApiService } from "./tenant-api.service";
import { SaveTenantCredentialsDto } from "./dto/save-credentials.dto";
import {
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
} from "../../common/guards";
import {
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
} from "../../common/dto";
import { Request } from "express";

@ApiTags("Tenant API")
@ApiBearerAuth("JWT-auth")
@Controller("tenant-api")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TenantApiController {
  constructor(private readonly tenantApiService: TenantApiService) {}

  // Static routes MUST come before dynamic :tenantId routes
  @Get("heartbeat")
  @ApiOperation({
    summary: "Get tenant heartbeat/me info (includes username prefix)",
  })
  @ApiResponse({
    status: 200,
    description: "Heartbeat info retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  async heartbeatMe(@Req() req: any) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    if (!tenantIds.length) {
      return { data: null, message: "No tenant configured for this organization" };
    }
    const data = await this.tenantApiService.heartbeatMe(tenantIds[0]);
    return { data, message: "Heartbeat info retrieved successfully" };
  }

  @Get(":tenantId/login")
  @ApiOperation({
    summary: "Login to tenant API",
    description:
      "Authenticate with the tenant API using stored credentials. Returns an access token from the tenant system.",
  })
  @ApiParam({
    name: "tenantId",
    type: String,
    description: "Tenant ID",
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
  })
  @ApiResponse({
    status: 200,
    description: "Tenant login successful, returns access token",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "No credentials found for tenant",
    type: NotFoundResponseDto,
  })
  async login(@Param("tenantId") tenantId: string) {
    const accessToken = await this.tenantApiService.login(tenantId);
    return { accessToken };
  }

  @Post(":tenantId/list-iot")
  @ApiOperation({
    summary: "List IoT devices for tenant user",
    description:
      "Fetch the list of IoT devices for a tenant user from the tenant API.",
  })
  @ApiParam({
    name: "tenantId",
    type: String,
    description: "Tenant ID",
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
  })
  @ApiResponse({
    status: 200,
    description: "IoT devices list retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "No credentials found for tenant",
    type: NotFoundResponseDto,
  })
  async listIotForTenantUser(
    @Param("tenantId") tenantId: string,
    @Body()
    body: { page: number; limit: number; searchData?: { iotUser?: string } },
  ) {
    return this.tenantApiService.listIotForTenantUser(tenantId, body);
  }

  @Post(":tenantId/create-iot")
  @ApiOperation({
    summary: "Create a new IoT device credential",
    description: "Create a new IoT user/device in the Sandgrain tenant system.",
  })
  @ApiParam({ name: "tenantId", type: String, description: "Tenant ID" })
  @ApiResponse({ status: 201, description: "IoT device created successfully" })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  async createIot(
    @Param("tenantId") tenantId: string,
    @Body() body: { username: string; password: string },
  ) {
    const data = await this.tenantApiService.createIot(tenantId, body);
    return { data, message: "IoT device created successfully" };
  }

  @Get(":tenantId/heartbeat")
  @ApiOperation({ summary: "Get tenant heartbeat/me info by tenantId" })
  @ApiParam({ name: "tenantId", type: String, description: "Tenant ID" })
  @ApiResponse({
    status: 200,
    description: "Heartbeat info retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  async heartbeatMeById(@Param("tenantId") tenantId: string) {
    const data = await this.tenantApiService.heartbeatMe(tenantId);
    return { data, message: "Heartbeat info retrieved successfully" };
  }

  @Get(":tenantId/user-me")
  @ApiOperation({
    summary: "Get tenant user profile",
    description: "Fetch the authenticated user profile from the tenant API.",
  })
  @ApiParam({
    name: "tenantId",
    type: String,
    description: "Tenant ID",
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
  })
  @ApiResponse({
    status: 200,
    description: "Tenant user profile retrieved successfully",
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "No credentials found for tenant",
    type: NotFoundResponseDto,
  })
  async getUserMe(@Param("tenantId") tenantId: string) {
    return this.tenantApiService.getUserMe(tenantId);
  }

  // New endpoints for multi-org credential management
  @Post("credentials")
  @ApiOperation({
    summary: "Save tenant credentials for organization",
    description:
      "Save Cloudflare and tenant credentials for the admin's organization. Call this on first login.",
  })
  @ApiResponse({ status: 201, description: "Credentials saved successfully" })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  async saveCredentials(
    @Body() dto: SaveTenantCredentialsDto,
    @Req() req: Request,
  ) {
    // Get user's organization from JWT
    const user = req.user as any;
    const ouId = user?.ou_id;

    if (!ouId) {
      throw new ForbiddenException("User not associated with an organization");
    }

    return this.tenantApiService.saveCredentials(ouId, dto);
  }

  @Get("credentials")
  @ApiOperation({ summary: "Get current org tenant credentials (masked)" })
  @ApiResponse({ status: 200, description: "Credentials retrieved" })
  async getCredentials(@Req() req: Request) {
    const user = req.user as any;
    const ouId = user?.ou_id;
    if (!ouId) return { data: null, message: "No organization" };
    const data = await this.tenantApiService.getCredentialsByOuId(ouId);
    return { data, message: "Credentials retrieved successfully" };
  }

  @Patch("credentials")
  @ApiOperation({ summary: "Update tenant credentials for current org" })
  @ApiResponse({ status: 200, description: "Credentials updated" })
  async updateCredentials(@Req() req: Request, @Body() dto: any) {
    const user = req.user as any;
    const ouId = user?.ou_id;
    if (!ouId) {
      throw new ForbiddenException("User not associated with an organization");
    }
    const result = await this.tenantApiService.updateCredentialsByOuId(ouId, dto);
    return result;
  }

  @Get("credentials/status")
  @ApiOperation({
    summary: "Check if credentials are configured",
    description:
      "Returns whether credentials have been set up for the user's organization",
  })
  @ApiResponse({ status: 200, description: "Credentials status retrieved" })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  async checkCredentialsStatus(@Req() req: Request) {
    const user = req.user as any;
    const userId = user?.user_id;

    if (!userId) {
      return { configured: false };
    }

    const configured =
      await this.tenantApiService.areCredentialsConfigured(userId);
    return { configured };
  }
}
