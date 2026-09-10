import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ProfileDefaultParamController } from "./profile-default-param.controller";
import { ProfileDefaultParamService } from "./profile-default-param.service";
import { DeviceProfile } from "../../entities/device-profile.entity";
import { ProfileDefaultParam } from "../../entities/profile-default-param.entity";
import { SystemActivityModule } from "../system-activity/system-activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([ProfileDefaultParam, DeviceProfile]), SystemActivityModule],
  controllers: [ProfileDefaultParamController],
  providers: [ProfileDefaultParamService],
  exports: [ProfileDefaultParamService],
})
export class ProfileDefaultParamModule {}
