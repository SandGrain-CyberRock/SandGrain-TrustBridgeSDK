import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";

import { CreateOrganizationDto } from "./dto/create-organization.dto";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { OrganizationService } from "./organization.service";
import { Roles, Permissions } from "../../common/decorators";
import {
  OrganizationResponseDto,
  OrganizationListResponseDto,
  TenantResponseDto,
  TenantListResponseDto,
  MessageResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
} from "../../common/dto";
import {
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
} from "../../common/guards";

@ApiTags("Organizations")
@ApiBearerAuth("JWT-auth")
@Controller("organizations")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  @Roles("TRUST_ADMIN")
  @Permissions("org:create")
  @ApiOperation({
    summary: "Create organization",
    description: "Create a new organization. **Requires TRUST_ADMIN role.**",
  })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiResponse({
    status: 201,
    description: "Organization created successfully",
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - TRUST_ADMIN role required",
    type: ForbiddenResponseDto,
  })
  create(@Body() createDto: CreateOrganizationDto) {
    return this.orgService.create(createDto);
  }

  @Get()
  @Permissions("org:retrieve")
  @ApiOperation({
    summary: "Get all organizations",
    description: "Retrieve a list of all organizations. Requires `org:retrieve` permission.",
  })
  @ApiResponse({
    status: 200,
    description: "List of organizations retrieved successfully",
    type: OrganizationListResponseDto,
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
  findAll() {
    return this.orgService.findAll();
  }

  @Get(":id")
  @Permissions("org:retrieve")
  @ApiOperation({
    summary: "Get organization by ID",
    description: "Retrieve a specific organization by its ID. Requires `org:retrieve` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Organization found",
    type: OrganizationResponseDto,
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
    description: "Organization not found",
    type: NotFoundResponseDto,
  })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.orgService.findOne(id);
  }

  @Patch(":id")
  @Roles("TRUST_ADMIN")
  @Permissions("org:update")
  @ApiOperation({
    summary: "Update organization",
    description: "Update an existing organization. **Requires TRUST_ADMIN role.**",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiResponse({
    status: 200,
    description: "Organization updated successfully",
    type: OrganizationResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - TRUST_ADMIN role required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Organization not found",
    type: NotFoundResponseDto,
  })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdateOrganizationDto,
  ) {
    return this.orgService.update(id, updateDto);
  }

  @Delete(":id")
  @Roles("TRUST_ADMIN")
  @Permissions("org:delete")
  @ApiOperation({
    summary: "Delete organization",
    description: "Delete an organization. **Requires TRUST_ADMIN role.** This is a soft delete operation.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Organization deleted successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - TRUST_ADMIN role required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Organization not found",
    type: NotFoundResponseDto,
  })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.orgService.remove(id);
  }

  // ============================================
  // Tenant Management
  // ============================================

  @Post(":id/tenants")
  @Roles("TRUST_ADMIN")
  @Permissions("org:update")
  @ApiOperation({
    summary: "Add tenant to organization",
    description:
      "Add a new tenant with API credentials to an organization. **Requires TRUST_ADMIN role.**",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiBody({ type: CreateTenantDto })
  @ApiResponse({
    status: 201,
    description: "Tenant added successfully",
    type: TenantResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - TRUST_ADMIN role required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Organization not found",
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Tenant already exists",
    type: ConflictResponseDto,
  })
  async addTenant(
    @Param("id", ParseIntPipe) orgId: number,
    @Body() dto: CreateTenantDto,
  ) {
    const tenant = await this.orgService.addTenant(orgId, dto);
    return { data: tenant, message: "Tenant added successfully" };
  }

  @Get(":id/tenants")
  @Permissions("org:retrieve")
  @ApiOperation({
    summary: "List tenants for organization",
    description:
      "Retrieve all tenants belonging to an organization. Requires `org:retrieve` permission.",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Tenants retrieved successfully",
    type: TenantListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Organization not found",
    type: NotFoundResponseDto,
  })
  async findTenants(@Param("id", ParseIntPipe) orgId: number) {
    const tenants = await this.orgService.findTenants(orgId);
    return { data: tenants, message: "Tenants retrieved successfully" };
  }

  @Delete(":id/tenants/:tenantId")
  @Roles("TRUST_ADMIN")
  @Permissions("org:delete")
  @ApiOperation({
    summary: "Remove tenant from organization",
    description:
      "Remove a tenant and its credentials from an organization. **Requires TRUST_ADMIN role.**",
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Organization ID",
    example: 1,
  })
  @ApiParam({
    name: "tenantId",
    type: String,
    description: "Tenant ID (UUID)",
    example: "7c8d7ea7-882e-4427-ab93-c010ffc809db",
  })
  @ApiResponse({
    status: 200,
    description: "Tenant removed successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - TRUST_ADMIN role required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Tenant not found",
    type: NotFoundResponseDto,
  })
  async removeTenant(
    @Param("id", ParseIntPipe) orgId: number,
    @Param("tenantId") tenantId: string,
  ) {
    await this.orgService.removeTenant(orgId, tenantId);
    return { message: "Tenant removed successfully" };
  }
}
