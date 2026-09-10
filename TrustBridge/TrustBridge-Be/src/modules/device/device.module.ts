import { HttpModule } from "@nestjs/axios";
import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { QueuesModule } from "src/common/queue/auth/queues.module";

import { DeviceAuthService } from "./device-auth.service";
import { DeviceController } from "./device.controller";
import { DeviceService } from "./device.service";
import { DeviceGroup } from "../../entities/device-group.entity";
import { DeviceLog } from "../../entities/device-log.entity";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { Device } from "../../entities/device.entity";
import { TenantUserCredential } from "../../entities/tenant-user-credential.entity";
import { MqttModule } from "../mqtt/mqtt.module";
import { SystemActivityModule } from "../system-activity/system-activity.module";
import { TenantApiModule } from "../tenant-api/tenant-api.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Device, DeviceGroup, DeviceLog, DeviceProfile, TenantUserCredential]),
    HttpModule,
    TenantApiModule,
    SystemActivityModule,
    MqttModule,
    forwardRef(() => QueuesModule),

  ],
  controllers: [DeviceController],
  providers: [DeviceService, DeviceAuthService],
  exports: [DeviceService, DeviceAuthService],
})
export class DeviceModule { }
