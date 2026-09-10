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
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";

import { CreateProfileParamDto } from "./dto/create-profile-param.dto";
import { UpdateProfileParamDto } from "./dto/update-profile-param.dto";
import { ProfileDefaultParamService } from "./profile-default-param.service";
import { Permissions } from "../../common/decorators";
import { JwtAuthGuard, PermissionsGuard } from "../../common/guards";

@ApiTags("Profile Default Params")
@ApiBearerAuth("JWT-auth")
@Controller("profile-params")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfileDefaultParamController {
  constructor(private readonly paramService: ProfileDefaultParamService) {}

  @Post()
  @Permissions("profile-param:create")
  @ApiOperation({ summary: "Create a profile default param set" })
  @ApiResponse({ status: 201, description: "Profile param created successfully" })
  async create(@Body() dto: CreateProfileParamDto) {
    const data = await this.paramService.create(dto);
    return { data, message: "Profile param created successfully" };
  }

  @Get()
  @Permissions("profile-param:retrieve")
  @ApiOperation({ summary: "Get all profile default params" })
  @ApiResponse({ status: 200, description: "List of profile params" })
  async findAll() {
    const data = await this.paramService.findAll();
    return { data, message: "Profile params retrieved successfully" };
  }

  @Get(":id")
  @Permissions("profile-param:retrieve")
  @ApiOperation({ summary: "Get profile param by ID" })
  @ApiResponse({ status: 200, description: "Profile param details" })
  async findOne(@Param("id", ParseIntPipe) id: number) {
    const data = await this.paramService.findOne(id);
    return { data, message: "Profile param retrieved successfully" };
  }

  @Patch(":id")
  @Permissions("profile-param:update")
  @ApiOperation({ summary: "Update a profile param" })
  @ApiResponse({ status: 200, description: "Profile param updated successfully" })
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProfileParamDto,
  ) {
    const data = await this.paramService.update(id, dto);
    return { data, message: "Profile param updated successfully" };
  }

  @Delete(":id")
  @Permissions("profile-param:delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a profile param (blocked if assigned to a profile)" })
  @ApiResponse({ status: 200, description: "Profile param deleted successfully" })
  async remove(@Param("id", ParseIntPipe) id: number) {
    await this.paramService.remove(id);
    return { data: null, message: "Profile param deleted successfully" };
  }
}
