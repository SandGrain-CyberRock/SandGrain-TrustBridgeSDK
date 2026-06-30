import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemActivity } from '../../entities/system-activity.entity';
import { SystemActivityService } from './system-activity.service';
import { SystemActivityController } from './system-activity.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemActivity])],
  providers: [SystemActivityService],
  controllers: [SystemActivityController],
  exports: [SystemActivityService],
})
export class SystemActivityModule {}
