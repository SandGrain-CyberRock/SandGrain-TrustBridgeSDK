import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { InjectRepository } from "@nestjs/typeorm";

import { ExtractJwt, Strategy } from "passport-jwt";
import { Repository } from "typeorm";

import { OrganizationUnit } from "../../../entities/organization-unit.entity";
import { RolePermission } from "../../../entities/role-permission.entity";
import { Tenant } from "../../../entities/tenant.entity";
import { UserRole } from "../../../entities/user-role.entity";
import { User } from "../../../entities/user.entity";

export interface JwtPayload {
  sub: number;
  username: string;
  email: string;
  ou_id: number | null;
  token_version: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private rolePermRepo: Repository<RolePermission>,
    @InjectRepository(Tenant)
    private tenantRepo: Repository<Tenant>,
    @InjectRepository(OrganizationUnit)
    private orgRepo: Repository<OrganizationUnit>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "your-secret-key",
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.userRepo.findOne({
      where: { user_id: payload.sub },
      relations: ["org"],
    });

    if (!user || user.user_status !== "ACTIVE") {
      throw new UnauthorizedException("User not found or inactive");
    }

    if (user.acc_locked_until && user.acc_locked_until > new Date()) {
      throw new UnauthorizedException("Account is locked");
    }

    if (payload.token_version !== user.token_version) {
      throw new UnauthorizedException("Session expired. Please log in again.");
    }

    // Get user roles — only include ACTIVE roles
    const userRoles = await this.userRoleRepo.find({
      where: { user_id: user.user_id },
      relations: ["role"],
    });

    const activeUserRoles = userRoles.filter(
      (ur) => ur.role.status === "ACTIVE",
    );
    const roles = activeUserRoles.map((ur) => ur.role.name);
    const roleIds = activeUserRoles.map((ur) => ur.role_id);

    // Get permissions for all roles
    const permissions: string[] = [];
    if (roleIds.length > 0) {
      const rolePerms = await this.rolePermRepo
        .createQueryBuilder("rp")
        .innerJoinAndSelect("rp.permission", "p")
        .where("rp.role_id IN (:...roleIds)", { roleIds })
        .getMany();

      rolePerms.forEach((rp) => {
        if (!permissions.includes(rp.permission.key)) {
          permissions.push(rp.permission.key);
        }
      });
    }

    // Get tenant_ids for the user's org
    let tenant_ids: string[] = [];
    let credentialsConfigured = true;
    if (user.ou_id) {
      const tenants = await this.tenantRepo.find({
        where: { ou_id: user.ou_id },
      });
      tenant_ids = tenants.map((t) => t.tenant_id);
      credentialsConfigured =
        tenants.length > 0
          ? tenants.some((t) => t.credentials_configured)
          : false;
    } else {
      credentialsConfigured = false;
    }

    // Check if system needs initialization (TrustAdmin with no org)
    let needsInitialization = false;
    if (roles.includes("TRUST_ADMIN")) {
      if (!user.ou_id) {
        needsInitialization = true;
      } else {
        const orgCount = await this.orgRepo.count();
        needsInitialization = orgCount === 0;
      }
    }

    return {
      user_id: user.user_id,
      username: user.username,
      name: user.name,
      email: user.email,
      ou_id: user.ou_id,
      org: user.org,
      tenant_ids,
      roles,
      permissions,
      credentialsConfigured,
      needsInitialization,
      mustChangePassword: user.must_change_password,
    };
  }
}
