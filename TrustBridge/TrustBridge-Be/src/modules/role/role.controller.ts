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
  HttpCode,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";

import { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { RoleService } from "./role.service";
import { Roles, Permissions } from "../../common/decorators";
import {
  RoleResponseDto,
  RoleListResponseDto,
  PermissionListResponseDto,
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

@ApiTags("Roles")
@ApiBearerAuth("JWT-auth")
@Controller("roles")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) { }

  @Post()
  @Roles("TRUST_ADMIN", "ADMINISTRATOR")
  @Permissions("role:create")
  @ApiOperation({
    summary: "Create a new role",
    description: `Create a new role with optional permissions.

**Required Roles:** \`TRUST_ADMIN\` or \`ADMINISTRATOR\`
**Required Permission:** \`role:create\``,
  })
  @ApiBody({ type: CreateRoleDto })
  @ApiResponse({
    status: 201,
    description: "Role created successfully",
    type: RoleResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Admin access required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Role name already exists",
    type: ConflictResponseDto,
  })
  async create(@Body() createDto: CreateRoleDto) {
    const data = await this.roleService.create(createDto);
    return { data, message: `Role '${data.label}' created successfully` };
  }

  @Get()
  @Permissions("role:retrieve")
  @ApiOperation({
    summary: "Get all roles",
    description: `Retrieve a list of all roles in the system.

**Required Permission:** \`role:retrieve\``,
  })
  @ApiResponse({
    status: 200,
    description: "List of roles retrieved successfully",
    type: RoleListResponseDto,
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
  async findAll(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("module") module?: string,
  ) {
    const data = await this.roleService.findAll(search, status, module);
    return { data, message: "Roles retrieved successfully" };
  }

  @Get(":id")
  @Permissions("role:retrieve")
  @ApiOperation({
    summary: "Get role by ID",
    description: `Retrieve a specific role by its ID.

**Required Permission:** \`role:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Role ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Role found",
    type: RoleResponseDto,
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
    description: "Role not found",
    type: NotFoundResponseDto,
  })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.roleService.findOne(id);
    return { data, message: "Role retrieved successfully" };
  }

  @Patch(":id")
  @Roles("TRUST_ADMIN", "ADMINISTRATOR")
  @Permissions("role:update")
  @ApiOperation({
    summary: "Update role",
    description: `Update an existing role's information.

**Required Roles:** \`TRUST_ADMIN\` or \`ADMINISTRATOR\`
**Required Permission:** \`role:update\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Role ID",
    example: 1,
  })
  @ApiBody({ type: UpdateRoleDto })
  @ApiResponse({
    status: 200,
    description: "Role updated successfully",
    type: RoleResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Admin access required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Role not found",
    type: NotFoundResponseDto,
  })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdateRoleDto,
  ) {
    const data = await this.roleService.update(id, updateDto);
    const message = updateDto.status
      ? `Role '${data.label}' status updated to ${updateDto.status.toLowerCase()}`
      : `Role '${data.label}' updated successfully`;
    return { data, message };
  }

  @Delete(":id")
  @Roles("TRUST_ADMIN")
  @Permissions("role:delete")
  @ApiOperation({
    summary: "Delete role",
    description: `Delete a role from the system. **Requires TRUST_ADMIN role.**

**Warning:** This will remove the role from all users who have it assigned.`,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Role ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Role deleted successfully",
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
    description: "Role not found",
    type: NotFoundResponseDto,
  })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.roleService.remove(id);
    return { data: null, message: "Role deleted successfully" };
  }

  @Get(":id/permissions")
  @Permissions("role:retrieve")
  @ApiOperation({
    summary: "Get role permissions",
    description: `Retrieve all permissions assigned to a specific role.

**Required Permission:** \`role:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Role ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Role permissions retrieved successfully",
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
  @ApiResponse({
    status: 404,
    description: "Role not found",
    type: NotFoundResponseDto,
  })
  async getRolePermissions(@Param("id", ParseIntPipe) id: number) {
    const data = await this.roleService.getRolePermissions(id);
    return { data, message: "Role permissions retrieved successfully" };
  }

  @Post("clear-all-permissions")
  @Roles("TRUST_ADMIN")
  @ApiOperation({ summary: "Clear all role permissions" })
  @ApiResponse({ status: 200, description: "All permissions cleared" })
  async clearAllPermissions() {
    await this.roleService.clearAllPermissions();
    return { data: null, message: "All role permissions cleared" };
  }

  @Post(":id/permissions")
  @Roles("TRUST_ADMIN", "ADMINISTRATOR")
  @Permissions("role:update")
  @ApiOperation({
    summary: "Assign permissions to role",
    description: `Assign a set of permissions to a role. This replaces all existing permission assignments.

**Required Roles:** \`TRUST_ADMIN\` or \`ADMINISTRATOR\`
**Required Permission:** \`role:update\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Role ID",
    example: 1,
  })
  @ApiBody({ type: AssignPermissionsDto })
  @ApiResponse({
    status: 200,
    description: "Permissions assigned successfully",
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Admin access required",
    type: ForbiddenResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Role not found",
    type: NotFoundResponseDto,
  })
  @HttpCode(200)
  async assignPermissions(
    @Param("id", ParseIntPipe) id: number,
    @Body() assignPermissionsDto: AssignPermissionsDto,
  ) {
    await this.roleService.assignPermissions(
      id,
      assignPermissionsDto.permission_ids,
    );
    return { data: null, message: "Permissions assigned successfully" };
  }
}
