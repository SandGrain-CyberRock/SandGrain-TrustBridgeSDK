import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { User } from "../../entities/user.entity";
import { UserRole } from "../../entities/user-role.entity";
import { RolePermission } from "../../entities/role-permission.entity";
import { Role } from "../../entities/role.entity";
import { Tenant } from "../../entities/tenant.entity";
import { OrganizationUnit } from "../../entities/organization-unit.entity";
import { UserService } from "../user/user.service";
import { EmailService } from "../../common/services/email.service";
import { SystemActivityModule } from "../system-activity/system-activity.module";
import { TenantApiModule } from "../tenant-api/tenant-api.module";

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
