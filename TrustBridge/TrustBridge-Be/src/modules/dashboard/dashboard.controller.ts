import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { Permissions } from '../../common/decorators';
import {
  UnauthorizedResponseDto,
  ForbiddenResponseDto,
} from '../../common/dto';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get dashboard statistics',
    description:
      'Retrieve all dashboard statistics including device counts, success rates, and recent activity',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard statistics retrieved successfully',
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
  async getStats(@Req() req: any) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.dashboardService.getStats(tenantIds);
    return {
      data,
      message: 'Dashboard statistics retrieved successfully',
    };
  }

  @Get('charts/device-status')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get device status distribution chart data',
    description: 'Retrieve data for doughnut/pie chart showing device status distribution',
  })
  @ApiResponse({
    status: 200,
    description: 'Chart data retrieved successfully',
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
  async getDeviceStatusChart(@Req() req: any) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.dashboardService.getDeviceStatusChart(tenantIds);
    return {
      data,
      message: 'Device status chart data retrieved successfully',
    };
  }

  @Get('charts/authentication-trend')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get authentication trend chart data',
    description:
      'Retrieve data for line chart showing authentication success/failure trends over time',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    example: 7,
    description: 'Number of days to show (default: 7)',
  })
  @ApiResponse({
    status: 200,
    description: 'Chart data retrieved successfully',
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
  async getAuthenticationTrend(@Req() req: any, @Query('days') days?: string) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.dashboardService.getAuthenticationTrend(
      days ? parseInt(days, 10) : 7,
      tenantIds,
    );
    return {
      data,
      message: 'Authentication trend chart data retrieved successfully',
    };
  }

  @Get('recent-devices')
  @Permissions('device:retrieve')
  @ApiOperation({
    summary: 'Get recent devices',
    description: 'Retrieve the most recently created devices',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 5,
    description: 'Number of devices to return (default: 5)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent devices retrieved successfully',
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
  async getRecentDevices(@Req() req: any, @Query('limit') limit?: string) {
    const tenantIds: string[] = req?.user?.tenant_ids || [];
    const data = await this.dashboardService.getRecentDevices(
      limit ? parseInt(limit, 10) : 5,
      tenantIds,
    );
    return {
      data,
      message: 'Recent devices retrieved successfully',
    };
  }

}
