import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { Device } from "../../entities/device.entity";
import { DeviceGroup } from "../../entities/device-group.entity";
import { DeviceLog } from "../../entities/device-log.entity";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";
import { DeviceController } from "./device.controller";
import { DeviceService } from "./device.service";
import { DeviceAuthService } from "./device-auth.service";
import { TenantApiModule } from "../tenant-api/tenant-api.module";
import { SystemActivityModule } from "../system-activity/system-activity.module";
import { MqttModule } from "../mqtt/mqtt.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, DeviceGroup, DeviceLog, DeviceProfile, TenantUserCredential]),
    HttpModule,
    TenantApiModule,
    SystemActivityModule,
    MqttModule,
  ],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceAuthService],
  exports: [DeviceService],
})
export class DeviceModule {}
