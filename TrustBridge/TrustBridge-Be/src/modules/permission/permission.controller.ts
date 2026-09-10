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
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";

import { CreatePermissionDto } from "./dto/create-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import { PermissionService } from "./permission.service";
import { Roles, Permissions } from "../../common/decorators";
import {
  PermissionResponseDto,
  PermissionListResponseDto,
  ModuleListResponseDto,
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

@ApiTags("Permissions")
@ApiBearerAuth("JWT-auth")
@Controller("permissions")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @Roles("TRUST_ADMIN")
  @Permissions("permission:create")
  @ApiOperation({
    summary: "Create a new permission",
    description: `Create a new permission in the system. **Requires TRUST_ADMIN role.**

Permissions follow the format \`module:action\` (e.g., \`user:create\`, \`device:retrieve\`).`,
  })
  @ApiBody({ type: CreatePermissionDto })
  @ApiResponse({
    status: 201,
    description: "Permission created successfully",
    type: PermissionResponseDto,
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
    status: 409,
    description: "Permission key already exists",
    type: ConflictResponseDto,
  })
  create(@Body() createDto: CreatePermissionDto) {
    return this.permissionService.create(createDto);
  }

  @Get()
  @Permissions("permission:retrieve")
  @ApiOperation({
    summary: "Get all permissions",
    description: `Retrieve all permissions in the system. Optionally filter by module name.

**Required Permission:** \`permission:retrieve\``,
  })
  @ApiQuery({
    name: "module",
    required: false,
    type: String,
    description: "Filter permissions by module name (e.g., user, role, org, device)",
    example: "user",
  })
  @ApiResponse({
    status: 200,
    description: "List of permissions retrieved successfully",
    type: PermissionListResponseDto,
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
  findAll(@Query("module") module?: string) {
    if (module) {
      return this.permissionService.findByModule(module);
    }
    return this.permissionService.findAll();
  }

  @Get("modules")
  @Permissions("permission:retrieve")
  @ApiOperation({
    summary: "Get all module names",
    description: `Retrieve a list of all unique module names that have permissions defined.

**Required Permission:** \`permission:retrieve\`

Useful for building permission management UIs with module-based grouping.`,
  })
  @ApiResponse({
    status: 200,
    description: "List of unique module names retrieved successfully",
    type: ModuleListResponseDto,
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
  getModules() {
    return this.permissionService.getModules();
  }

  @Get(":id")
  @Permissions("permission:retrieve")
  @ApiOperation({
    summary: "Get permission by ID",
    description: `Retrieve a specific permission by its ID.

**Required Permission:** \`permission:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Permission ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Permission found",
    type: PermissionResponseDto,
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
    description: "Permission not found",
    type: NotFoundResponseDto,
  })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.permissionService.findOne(id);
  }

  @Patch(":id")
  @Roles("TRUST_ADMIN")
  @Permissions("permission:update")
  @ApiOperation({
    summary: "Update permission",
    description: `Update an existing permission. **Requires TRUST_ADMIN role.**

**Warning:** Changing permission keys may affect existing role assignments.`,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Permission ID",
    example: 1,
  })
  @ApiBody({ type: UpdatePermissionDto })
  @ApiResponse({
    status: 200,
    description: "Permission updated successfully",
    type: PermissionResponseDto,
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
    description: "Permission not found",
    type: NotFoundResponseDto,
  })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdatePermissionDto,
  ) {
    return this.permissionService.update(id, updateDto);
  }

  @Delete(":id")
  @Roles("TRUST_ADMIN")
  @Permissions("permission:delete")
  @ApiOperation({
    summary: "Delete permission",
    description: `Delete a permission from the system. **Requires TRUST_ADMIN role.**

**Warning:** This will remove the permission from all roles that have it assigned.`,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Permission ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Permission deleted successfully",
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
    description: "Permission not found",
    type: NotFoundResponseDto,
  })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.permissionService.remove(id);
  }
}
