import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SystemActivityController } from './system-activity.controller';
import { SystemActivityService } from './system-activity.service';
import { SystemActivity } from '../../entities/system-activity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemActivity])],
  providers: [SystemActivityService],
  controllers: [SystemActivityController],
  exports: [SystemActivityService],
})
export class SystemActivityModule {}
