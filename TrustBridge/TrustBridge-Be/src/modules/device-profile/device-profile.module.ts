import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DeviceProfileController } from "./device-profile.controller";
import { DeviceProfileService } from "./device-profile.service";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { Tag } from "../../entities/tag.entity";
import { SystemActivityModule } from "../system-activity/system-activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([DeviceProfile, Tag]), SystemActivityModule],
  controllers: [DeviceProfileController],
  providers: [DeviceProfileService],
  exports: [DeviceProfileService],
})
export class DeviceProfileModule {}
