import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from "@nestjs/swagger";
import { DeviceGroupService } from "./device-group.service";
import { CreateDeviceGroupDto } from "./dto/create-device-group.dto";
import { UpdateDeviceGroupDto } from "./dto/update-device-group.dto";
import {
  JwtAuthGuard,
  RolesGuard,
  PermissionsGuard,
} from "../../common/guards";
import { Permissions } from "../../common/decorators";
import {
  MessageResponseDto,
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
  NotFoundResponseDto,
  ConflictResponseDto,
} from "../../common/dto";

@ApiTags("Device Groups")
@ApiBearerAuth("JWT-auth")
@Controller("device-groups")
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DeviceGroupController {
  constructor(private readonly deviceGroupService: DeviceGroupService) {}

  @Post()
  @Permissions("device-group:create")
  @ApiOperation({
    summary: "Create a new device group",
    description: `Create a new device group with group ID, group name (login username), and password.

**Required Permission:** \`device-group:create\``,
  })
  @ApiBody({ type: CreateDeviceGroupDto })
  @ApiResponse({
    status: 201,
    description: "Device group created successfully",
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
  @ApiResponse({
    status: 409,
    description: "Device group with this name already exists",
    type: ConflictResponseDto,
  })
  async create(@Req() req: any, @Body() createDto: CreateDeviceGroupDto) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.deviceGroupService.create(createDto, tenantIds);
    return {
      data,
      message: `Device group '${data.group_name}' created successfully`,
    };
  }

  @Get()
  @Permissions("device-group:retrieve")
  @ApiOperation({
    summary: "Get all device groups",
    description: `Retrieve device groups with pagination and optional search.

**Required Permission:** \`device-group:retrieve\``,
  })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "Filter by ACTIVE or INACTIVE",
  })
  @ApiResponse({ status: 200, description: "Paginated list of device groups" })
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
  async findAll(
    @Req() req: any,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ) {
    // Get tenant_ids from JWT user (set by jwtstrategy)
    const tenantIds = req?.user?.tenant_ids || [];
    const data = await this.deviceGroupService.findAll(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
      search,
      status,
      tenantIds,
    );
    return {
      data,
      message: "Device groups retrieved successfully",
    };
  }

  @Get(":id")
  @Permissions("device-group:retrieve")
  @ApiOperation({
    summary: "Get device group by ID",
    description: `Retrieve a specific device group by ID.

**Required Permission:** \`device-group:retrieve\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device Group ID",
    example: 1,
  })
  @ApiResponse({ status: 200, description: "Device group found" })
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
  @ApiResponse({
    status: 404,
    description: "Device group not found",
    type: NotFoundResponseDto,
  })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.deviceGroupService.findOne(id);
    return {
      data,
      message: "Device group details retrieved successfully",
    };
  }

  @Patch(":id")
  @Permissions("device-group:update")
  @ApiOperation({
    summary: "Update device group",
    description: `Update device group information.

**Required Permission:** \`device-group:update\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device Group ID",
    example: 1,
  })
  @ApiBody({ type: UpdateDeviceGroupDto })
  @ApiResponse({
    status: 200,
    description: "Device group updated successfully",
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
  @ApiResponse({
    status: 404,
    description: "Device group not found",
    type: NotFoundResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Device group with this name already exists",
    type: ConflictResponseDto,
  })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateDto: UpdateDeviceGroupDto,
  ) {
    const data = await this.deviceGroupService.update(id, updateDto);
    const message = updateDto.status
      ? `Device group '${data.group_name}' status updated to ${updateDto.status.toLowerCase()}`
      : `Device group '${data.group_name}' updated successfully`;
    return { data, message };
  }

  @Delete(":id")
  @Permissions("device-group:delete")
  @ApiOperation({
    summary: "Delete device group",
    description: `Soft delete a device group.

**Required Permission:** \`device-group:delete\``,
  })
  @ApiParam({
    name: "id",
    type: Number,
    description: "Device Group ID",
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: "Device group deleted successfully",
    type: MessageResponseDto,
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
  @ApiResponse({
    status: 404,
    description: "Device group not found",
    type: NotFoundResponseDto,
  })
  async remove(@Param("id", ParseIntPipe) id: number) {
    const group = await this.deviceGroupService.findOne(id);
    await this.deviceGroupService.remove(id);
    return {
      data: { deleted: true },
      message: `Device group '${group.group_name}' deleted successfully`,
    };
  }
}
