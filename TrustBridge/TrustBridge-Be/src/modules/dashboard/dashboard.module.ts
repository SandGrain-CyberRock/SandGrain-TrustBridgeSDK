import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../../entities/device.entity';
import { DeviceLog } from '../../entities/device-log.entity';
import { SystemActivity } from '../../entities/system-activity.entity';
import { Tenant } from '../../entities/tenant.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceLog, SystemActivity, Tenant])],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
