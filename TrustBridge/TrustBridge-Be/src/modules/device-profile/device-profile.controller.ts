import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";
import { Permissions } from "../../common/decorators";
import { DeviceProfileService } from "./device-profile.service";
import { CreateDeviceProfileDto } from "./dto/create-device-profile.dto";
import { UpdateDeviceProfileDto } from "./dto/update-device-profile.dto";

@ApiTags("Device Profiles")
@ApiBearerAuth("JWT-auth")
@Controller("device-profiles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DeviceProfileController {
  constructor(private readonly deviceProfileService: DeviceProfileService) {}

  @Post()
  @Permissions("device-profile:create")
  @ApiOperation({ summary: "Create a device profile" })
  @ApiResponse({
    status: 201,
    description: "Device profile created successfully",
  })
  async create(@Body() dto: CreateDeviceProfileDto, @Req() req: any) {
    const ouId = req.user?.ou_id;
    const data = await this.deviceProfileService.create(dto, ouId);
    return { data, message: "Device profile created successfully" };
  }

  @Get()
  @Permissions("device-profile:retrieve")
  @ApiOperation({ summary: "List device profiles with pagination" })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["ACTIVE", "INACTIVE"] })
  @ApiResponse({
    status: 200,
    description: "Paginated list of device profiles",
  })
  async findAll(
    @Req() req: any,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
  ) {
    const ouId = req.user?.ou_id;
    const data = await this.deviceProfileService.findAll(
      ouId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      search,
      status,
    );
    return { data, message: "Device profiles retrieved successfully" };
  }

  @Get(":id")
  @Permissions("device-profile:retrieve")
  @ApiOperation({ summary: "Get device profile by ID" })
  @ApiResponse({ status: 200, description: "Device profile details" })
  async findOne(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    const ouId = req.user?.ou_id;
    const data = await this.deviceProfileService.findOne(id, ouId);
    return { data, message: "Device profile retrieved successfully" };
  }

  @Patch(":id")
  @Permissions("device-profile:update")
  @ApiOperation({ summary: "Update a device profile" })
  @ApiResponse({
    status: 200,
    description: "Device profile updated successfully",
  })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateDeviceProfileDto,
    @Req() req: any,
  ) {
    const ouId = req.user?.ou_id;
    const data = await this.deviceProfileService.update(id, dto, ouId);
    return { data, message: "Device profile updated successfully" };
  }

  @Delete(":id")
  @Permissions("device-profile:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Soft delete a device profile" })
  @ApiResponse({
    status: 200,
    description: "Device profile deleted successfully",
  })
  async remove(@Param("id", ParseIntPipe) id: number, @Req() req: any) {
    const ouId = req.user?.ou_id;
    await this.deviceProfileService.remove(id, ouId);
    return { data: null, message: "Device profile deleted successfully" };
  }
}
