import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { EmailService } from "../../common/services/email.service";
import { OrganizationUnit } from "../../entities/organization-unit.entity";
import { RolePermission } from "../../entities/role-permission.entity";
import { Role } from "../../entities/role.entity";
import { Tenant } from "../../entities/tenant.entity";
import { UserRole } from "../../entities/user-role.entity";
import { User } from "../../entities/user.entity";
import { SystemActivityModule } from "../system-activity/system-activity.module";
import { TenantApiModule } from "../tenant-api/tenant-api.module";
import { UserService } from "../user/user.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRole, RolePermission, Role, Tenant, OrganizationUnit]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || "your-secret-key",
      signOptions: { expiresIn: "24h" },
    }),
    SystemActivityModule,
    TenantApiModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UserService, EmailService],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule { }
