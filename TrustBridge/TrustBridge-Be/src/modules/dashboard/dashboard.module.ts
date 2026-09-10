import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DeviceLog } from '../../entities/device-log.entity';
import { Device } from '../../entities/device.entity';
import { SystemActivity } from '../../entities/system-activity.entity';
import { Tenant } from '../../entities/tenant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceLog, SystemActivity, Tenant])],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
