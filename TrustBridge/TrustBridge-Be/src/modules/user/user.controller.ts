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
  Res,
  Req,
  BadRequestException,
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
import { Response } from "express";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import {
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
} from "../../common/guards";
import { Permissions } from "../../common/decorators";
import {
  UserResponseDto,
  UserListResponseDto,
  RoleResponseDto,
  MessageResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
} from "../../common/dto";

@ApiTags("Users")
@ApiBearerAuth("JWT-auth")
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Permissions("user:create")
  @ApiOperation({
    summary: "Create a new user",
    description: `Create a new user and send an invitation email with a link to set their password.

**Required Permission:** \`user:create\`

**Note:** The user will receive an email with an invitation link that expires in 7 days.`,
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: "User created and invitation email sent",
    type: UserResponseDto,
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
    description: "Username or email already exists",
    type: ConflictResponseDto,
  })
  async create(@Body() createDto: CreateUserDto) {
    const data = await this.userService.create(createDto);
    return {
      data,
      message: `User '${data.name || data.username}' created successfully`,
    };
  }

  @Get()
  @Permissions("user:retrieve")
  @ApiOperation({
    summary: "Get all users with pagination and search",
    description: `Retrieve a paginated list of users. Supports search and filtering.

**Required Permission:** \`user:retrieve\``,
  })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number",
    example: 1,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page",
    example: 10,
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Search by username, email, name, or company title",
    example: "john",
  })
  @ApiQuery({
    name: "ou_id",
    required: false,
    type: Number,
    description: "Filter users by organization ID",
    example: 1,
  })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "Filter by status (ACTIVE/INACTIVE)",
    example: "ACTIVE",
  })
  @ApiQuery({
    name: "role",
    required: false,
    type: String,
    description: "Filter by role name",
    example: "admin",
  })
  @ApiResponse({
    status: 200,
    description: "Users retrieved successfully",
    type: UserListResponseDto,
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
    @Req() req: any,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("role") role?: string,
  ) {
    // Org users always see only their org's users (from JWT)
    const ouId: number | undefined = req?.user?.ou_id || undefined;
    const data = await this.userService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      search,
      ouId,
      status,
      role,
    );
    return {
      data,
      message: "Users retrieved successfully",
    };
  }

  @Get("search")
  @Permissions("user:retrieve")
  @ApiOperation({
    summary: "Search users",
    description: `Search users by username, email, name, or company title.

**Required Permission:** \`user:retrieve\``,
  })
  @ApiQuery({
    name: "q",
    required: true,
    type: String,
    description: "Search query",
    example: "john",
  })
  @ApiQuery({
    name: "ou_id",
    required: false,
    type: Number,
    description: "Filter by organization ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Users search results retrieved successfully",
  })
  @ApiResponse({
    status: 400,
    description: "Bad Request - Missing search query",
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
  async searchUsers(
    @Req() req: any,
    @Query("q") query: string,
  ) {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException("q query parameter is required");
    }
    const ouId: number | undefined = req?.user?.ou_id || undefined;
    const data = await this.userService.searchUsers(query.trim(), ouId);
    return { data, message: "Users search results retrieved successfully" };
  }

  @Get("export")
  @Permissions("user:retrieve")
  @ApiOperation({
    summary: "Export users",
    description: `Export users to Excel, CSV, or JSON format.

**Required Permission:** \`user:retrieve\``,
  })
  @ApiQuery({
    name: "format",
    required: false,
    enum: ["xlsx", "csv", "json"],
    description: "Export format (default: xlsx)",
    example: "xlsx",
  })
  @ApiQuery({
    name: "ou_id",
    required: false,
    type: Number,
    description: "Filter by organization ID",
    example: 1,
  })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "Filter by status (ACTIVE/INACTIVE)",
    example: "ACTIVE",
  })
  @ApiResponse({
    status: 200,
    description: "Users exported successfully",
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
  async exportUsers(
    @Req() req: any,
    @Query("format") format: string,
    @Query("status") status?: string,
    @Res() res?: Response,
  ) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ouIdNum: number | undefined = req?.user?.ou_id || undefined;

    if (format === "csv") {
      const buffer = await this.userService.exportUsersToCsv(ouIdNum, status);
      res.set({
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=users-export-${timestamp}.csv`,
      });
      res.send(buffer);
    } else if (format === "json") {
      const buffer = await this.userService.exportUsersToJson(ouIdNum, status);
      res.set({
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=users-export-${timestamp}.json`,
      });
      res.send(buffer);
    } else {
      const buffer = await this.userService.exportUsersToExcel(ouIdNum, status);
      res.set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=users-export-${timestamp}.xlsx`,
      });
      res.send(buffer);
    }
  }

  @Get(":id")
  @Permissions("user:retrieve")
  @ApiOperation({
    summary: "Get user by ID",
    description: `Retrieve a specific user by their ID, including their organization and assigned roles.

**Required Permission:** \`user:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "User details retrieved successfully",
    type: UserResponseDto,
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
    description: "User not found",
    type: NotFoundResponseDto,
  })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.userService.findOne(id);
    return {
      data,
      message: "User details retrieved successfully",
    };
  }

  @Patch(":id")
  @Permissions("user:update")
  @ApiOperation({
    summary: "Update user",
    description: `Update user information such as name, company title, status, or role.

**Required Permission:** \`user:update\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: "User updated successfully",
    type: UserResponseDto,
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
    description: "User not found",
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Username or email already exists",
    type: ConflictResponseDto,
  })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdateUserDto,
  ) {
    const data = await this.userService.update(id, updateDto);
    return {
      data,
      message: `User '${data.name || data.username}' updated successfully`,
    };
  }

  @Delete(":id")
  @Permissions("user:delete")
  @ApiOperation({
    summary: "Delete user",
    description: `Soft delete a user. The user will be marked as deleted but data is retained.

**Required Permission:** \`user:delete\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "User deleted successfully",
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
    description: "User not found",
    type: NotFoundResponseDto,
  })
  async remove(@Param("id", ParseIntPipe) id: number) {
    const user = await this.userService.findOne(id);
    await this.userService.remove(id);
    return {
      data: { deleted: true },
      message: `User '${user.name || user.username}' deleted successfully`,
    };
  }

  @Post(":id/resend-invitation")
  @Permissions("user:create")
  @ApiOperation({
    summary: "Resend invitation email",
    description: `Resend the invitation email to a user who hasn't set their password yet. Generates a new invitation token with a 7-day expiration.

**Required Permission:** \`user:create\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Invitation email resent successfully",
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
    description: "User not found",
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "User has already set their password",
    type: ConflictResponseDto,
  })
  resendInvitation(@Param("id", ParseIntPipe) id: number) {
    return this.userService.resendInvitation(id);
  }

  @Get(":id/role")
  @Permissions("user:retrieve")
  @ApiOperation({
    summary: "Get user's assigned role",
    description: `Retrieve the role currently assigned to a user.

**Required Permission:** \`user:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "User role retrieved successfully",
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
    description: "User not found",
    type: NotFoundResponseDto,
  })
  async getUserRole(@Param("id", ParseIntPipe) id: number) {
    const data = await this.userService.getUserRole(id);
    return {
      data,
      message: "User role retrieved successfully",
    };
  }

  @Post(":id/role")
  @Permissions("user:assign-role")
  @ApiOperation({
    summary: "Assign role to user",
    description: `Assign a role to a user. This replaces any existing role assignment.

**Required Permission:** \`user:assign-role\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "User ID",
    example: 1,
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["role_id"],
      properties: {
        role_id: {
          type: "number",
          example: 2,
          description: "The ID of the role to assign",
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Role assigned successfully",
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
    description: "User or role not found",
    type: NotFoundResponseDto,
  })
  async assignRole(
    @Param("id", ParseIntPipe) id: number,
    @Body() { role_id }: { role_id: number },
  ) {
    await this.userService.assignRole(id, role_id);
    return {
      data: { success: true },
      message: "Role assigned to user successfully",
    };
  }
}
