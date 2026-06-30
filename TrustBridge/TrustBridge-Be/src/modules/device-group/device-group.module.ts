import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DeviceGroup } from "../../entities/device-group.entity";
import { DeviceGroupController } from "./device-group.controller";
import { DeviceGroupService } from "./device-group.service";
import { SystemActivityModule } from "../system-activity/system-activity.module";
import { TenantApiModule } from "../tenant-api/tenant-api.module";

@Module({
  imports: [TypeOrmModule.forFeature([DeviceGroup]), SystemActivityModule, TenantApiModule],
  controllers: [DeviceGroupController],
  providers: [DeviceGroupService],
  exports: [DeviceGroupService],
})
export class DeviceGroupModule {}
