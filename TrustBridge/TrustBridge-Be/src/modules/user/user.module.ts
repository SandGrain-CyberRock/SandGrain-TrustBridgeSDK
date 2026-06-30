import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserService } from "./user.service";
import { UserController } from "./user.controller";
import { User } from "../../entities/user.entity";
import { UserRole } from "../../entities/user-role.entity";
import { Role } from "../../entities/role.entity";
import { EmailService } from "../../common/services/email.service";
import { SystemActivityModule } from "../system-activity/system-activity.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRole, Role]), SystemActivityModule],
  controllers: [UserController],
  providers: [UserService, EmailService],
  exports: [UserService],
})
export class UserModule {}
