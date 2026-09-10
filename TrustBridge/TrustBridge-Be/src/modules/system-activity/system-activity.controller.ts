import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { SystemActivityService } from './system-activity.service';
import { Permissions } from '../../common/decorators';
import {
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
} from '../../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';

@ApiTags('System Activity')
@ApiBearerAuth('JWT-auth')
@Controller('system-activity')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemActivityController {
  constructor(private readonly activityService: SystemActivityService) {}

  @Get()
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get all system activities',
    description:
      'Retrieve all system activity logs with pagination. Includes device creation, authentication, failures, device group changes, etc.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'System activities retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  async findAll(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const result = await this.activityService.findAll(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
      tenantIds,
    );
    return {
      data: result.data,
      total: result.total,
      message: 'System activities retrieved successfully',
    };
  }

  @Get('recent')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get recent system activities',
    description:
      'Retrieve the most recent system activity logs. Default limit is 10.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({
    status: 200,
    description: 'Recent activities retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  async findRecent(@Req() req: any, @Query('limit') limit?: string) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.activityService.findRecent(
      limit ? parseInt(limit, 10) : 10,
      tenantIds,
    );
    return {
      data,
      message: 'Recent activities retrieved successfully',
    };
  }

  @Get('by-entity-type')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get activities by entity type',
    description: 'Retrieve activities filtered by entity type (device, device_group, etc.)',
  })
  @ApiQuery({
    name: 'entity_type',
    required: true,
    type: String,
    example: 'device',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Activities retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  async findByEntityType(
    @Req() req: any,
    @Query('entity_type') entityType: string,
    @Query('limit') limit?: string,
  ) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.activityService.findByEntityType(
      entityType,
      limit ? parseInt(limit, 10) : 50,
      tenantIds,
    );
    return {
      data,
      message: 'Activities retrieved successfully',
    };
  }

  @Get('by-device')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get activities by device ID',
    description: 'Retrieve all activities related to a specific device',
  })
  @ApiQuery({ name: 'device_id', required: true, type: Number, example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Device activities retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  async findByDeviceId(@Req() req: any, @Query('device_id', ParseIntPipe) deviceId: number) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.activityService.findByDeviceId(deviceId, tenantIds);
    return {
      data,
      message: 'Device activities retrieved successfully',
    };
  }

  @Get('by-device-group')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get activities by device group ID',
    description: 'Retrieve all activities related to a specific device group',
  })
  @ApiQuery({
    name: 'device_group_id',
    required: true,
    type: Number,
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Device group activities retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: UnauthorizedResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
    type: ForbiddenResponseDto,
  })
  async findByDeviceGroupId(
    @Req() req: any,
    @Query('device_group_id', ParseIntPipe) deviceGroupId: number,
  ) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.activityService.findByDeviceGroupId(deviceGroupId, tenantIds);
    return {
      data,
      message: 'Device group activities retrieved successfully',
    };
  }
}
