import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { EmailService } from "../../common/services/email.service";
import { Role } from "../../entities/role.entity";
import { UserRole } from "../../entities/user-role.entity";
import { User } from "../../entities/user.entity";
import { SystemActivityModule } from "../system-activity/system-activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRole, Role]), SystemActivityModule],
  controllers: [UserController],
  providers: [UserService, EmailService],
  exports: [UserService],
})
export class UserModule {}
