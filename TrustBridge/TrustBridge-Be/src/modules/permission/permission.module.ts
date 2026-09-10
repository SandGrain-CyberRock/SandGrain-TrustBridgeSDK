import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PermissionController } from './permission.controller';
import { PermissionService } from './permission.service';
import { Permission } from '../../entities/permission.entity';
import { SystemActivityModule } from '../system-activity/system-activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Permission]), SystemActivityModule],
  controllers: [PermissionController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionModule {}
