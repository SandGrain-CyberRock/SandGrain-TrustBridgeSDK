import { DataSource, In } from "typeorm";
import * as bcrypt from "bcrypt";
import { Role } from "../../entities/role.entity";
import { Permission } from "../../entities/permission.entity";
import { User } from "../../entities/user.entity";

async function insertIgnorePermissions(
  ds: DataSource,
  permissions: {
    key: string;
    module: string;
    action: string;
    description: string;
  }[],
) {
  for (const p of permissions) {
    await ds.query(
      `INSERT IGNORE INTO permissions (\`key\`, \`module\`, \`action\`, \`description\`)
       VALUES (?, ?, ?, ?)`,
      [p.key, p.module, p.action, p.description],
    );
  }
}

export async function seed(ds: DataSource) {
  const permRepo = ds.getRepository(Permission);
  const roleRepo = ds.getRepository(Role);
  const userRepo = ds.getRepository(User);

  console.log("Starting seed (idempotent)...");

  // ============================================
  // 1. PERMISSIONS
  // ============================================

  const orgPermissionsData = [
    {
      key: "org:create",
      module: "organization",
      action: "create",
      description: "Create organizations",
    },
    {
      key: "org:update",
      module: "organization",
      action: "update",
      description: "Update organizations",
    },
    {
      key: "org:retrieve",
      module: "organization",
      action: "retrieve",
      description: "View organizations",
    },
    {
      key: "org:delete",
      module: "organization",
      action: "delete",
      description: "Delete organizations",
    },
  ];

  const rolePermissionsData = [
    {
      key: "role:create",
      module: "role",
      action: "create",
      description: "Create roles",
    },
    {
      key: "role:update",
      module: "role",
      action: "update",
      description: "Update roles",
    },
    {
      key: "role:retrieve",
      module: "role",
      action: "retrieve",
      description: "View roles",
    },
    {
      key: "role:delete",
      module: "role",
      action: "delete",
      description: "Delete roles",
    },
  ];

  const permissionPermissionsData = [
    {
      key: "permission:create",
      module: "permission",
      action: "create",
      description: "Create permissions",
    },
    {
      key: "permission:update",
      module: "permission",
      action: "update",
      description: "Update permissions",
    },
    {
      key: "permission:retrieve",
      module: "permission",
      action: "retrieve",
      description: "View permissions",
    },
    {
      key: "permission:delete",
      module: "permission",
      action: "delete",
      description: "Delete permissions",
    },
  ];

  const userPermissionsData = [
    {
      key: "user:create",
      module: "user",
      action: "create",
      description: "Create users",
    },
    {
      key: "user:update",
      module: "user",
      action: "update",
      description: "Update users",
    },
    {
      key: "user:retrieve",
      module: "user",
      action: "retrieve",
      description: "View users",
    },
    {
      key: "user:delete",
      module: "user",
      action: "delete",
      description: "Delete users",
    },
    {
      key: "user:assign-role",
      module: "user",
      action: "assign-role",
      description: "Assign roles to users",
    },
  ];

  const devicePermissionsData = [
    {
      key: "device:create",
      module: "device",
      action: "create",
      description: "Create devices",
    },
    {
      key: "device:update",
      module: "device",
      action: "update",
      description: "Update devices",
    },
    {
      key: "device:retrieve",
      module: "device",
      action: "retrieve",
      description: "View devices",
    },
    {
      key: "device:delete",
      module: "device",
      action: "delete",
      description: "Delete devices",
    },
  ];

  const deviceGroupPermissionsData = [
    {
      key: "device-group:create",
      module: "device-group",
      action: "create",
      description: "Create device groups",
    },
    {
      key: "device-group:update",
      module: "device-group",
      action: "update",
      description: "Update device groups",
    },
    {
      key: "device-group:retrieve",
      module: "device-group",
      action: "retrieve",
      description: "View device groups",
    },
    {
      key: "device-group:delete",
      module: "device-group",
      action: "delete",
      description: "Delete device groups",
    },
  ];

  const masterDataPermissionsData = [
    {
      key: "master-data:create",
      module: "master-data",
      action: "create",
      description: "Create master data (categories, sub-categories, tags)",
    },
    {
      key: "master-data:update",
      module: "master-data",
      action: "update",
      description: "Update master data",
    },
    {
      key: "master-data:retrieve",
      module: "master-data",
      action: "retrieve",
      description: "View master data",
    },
    {
      key: "master-data:delete",
      module: "master-data",
      action: "delete",
      description: "Delete master data",
    },
  ];

  const profileParamPermissionsData = [
    {
      key: "profile-param:create",
      module: "profile-param",
      action: "create",
      description: "Create profile default params",
    },
    {
      key: "profile-param:update",
      module: "profile-param",
      action: "update",
      description: "Update profile default params",
    },
    {
      key: "profile-param:retrieve",
      module: "profile-param",
      action: "retrieve",
      description: "View profile default params",
    },
    {
      key: "profile-param:delete",
      module: "profile-param",
      action: "delete",
      description: "Delete profile default params",
    },
  ];

  const deviceProfilePermissionsData = [
    {
      key: "device-profile:create",
      module: "device-profile",
      action: "create",
      description: "Create device profiles",
    },
    {
      key: "device-profile:update",
      module: "device-profile",
      action: "update",
      description: "Update device profiles",
    },
    {
      key: "device-profile:retrieve",
      module: "device-profile",
      action: "retrieve",
      description: "View device profiles",
    },
    {
      key: "device-profile:delete",
      module: "device-profile",
      action: "delete",
      description: "Delete device profiles",
    },
  ];

  const allPermData = [
    ...orgPermissionsData,
    ...rolePermissionsData,
    ...permissionPermissionsData,
    ...userPermissionsData,
    ...devicePermissionsData,
    ...deviceGroupPermissionsData,
    ...masterDataPermissionsData,
    ...profileParamPermissionsData,
    ...deviceProfilePermissionsData,
  ];

  await insertIgnorePermissions(ds, allPermData);

  const orgPermissions = await permRepo.find({
    where: { key: In(orgPermissionsData.map((p) => p.key)) },
  });
  const rolePermissions = await permRepo.find({
    where: { key: In(rolePermissionsData.map((p) => p.key)) },
  });
  const permissionPermissions = await permRepo.find({
    where: { key: In(permissionPermissionsData.map((p) => p.key)) },
  });
  const userPermissions = await permRepo.find({
    where: { key: In(userPermissionsData.map((p) => p.key)) },
  });
  const devicePermissions = await permRepo.find({
    where: { key: In(devicePermissionsData.map((p) => p.key)) },
  });
  const deviceGroupPermissions = await permRepo.find({
    where: { key: In(deviceGroupPermissionsData.map((p) => p.key)) },
  });
  const masterDataPermissions = await permRepo.find({
    where: { key: In(masterDataPermissionsData.map((p) => p.key)) },
  });
  const profileParamPermissions = await permRepo.find({
    where: { key: In(profileParamPermissionsData.map((p) => p.key)) },
  });
  const deviceProfilePermissions = await permRepo.find({
    where: { key: In(deviceProfilePermissionsData.map((p) => p.key)) },
  });

  // ============================================
  // 2. ROLES
  // ============================================

  // Rename old roles if they exist (handles migration from previous seed)
  await ds.query(
    `UPDATE roles SET name = 'TRUST_ADMIN', label = 'Trust Admin', description = 'System owner and administrator' WHERE name = 'SUPER_ADMIN'`,
  );
  await ds.query(
    `UPDATE roles SET name = 'OPERATOR', label = 'Operator', description = 'Device operator' WHERE name = 'OPERATIONAL_USER'`,
  );

  const rolesData = [
    {
      name: "TRUST_ADMIN",
      label: "Trust Admin",
      icon: "crown",
      icon_color: "#FFD700",
      description: "System owner and administrator",
    },
    {
      name: "ADMINISTRATOR",
      label: "Administrator",
      icon: "shield",
      icon_color: "#FF0000",
      description: "Org admin",
    },
    {
      name: "OPERATOR",
      label: "Operator",
      icon: "user",
      icon_color: "#0066FF",
      description: "Device operator",
    },
  ];

  for (const role of rolesData) {
    await ds.query(
      `INSERT IGNORE INTO roles (name, label, icon, icon_color, description)
       VALUES (?, ?, ?, ?, ?)`,
      [role.name, role.label, role.icon, role.icon_color, role.description],
    );
  }

  const trustAdminRole = await roleRepo.findOneBy({ name: "TRUST_ADMIN" });
  const adminRole = await roleRepo.findOneBy({ name: "ADMINISTRATOR" });
  const operatorRole = await roleRepo.findOneBy({ name: "OPERATOR" });

  // ============================================
  // 3. ROLE PERMISSIONS
  // ============================================

  // TRUST_ADMIN gets ALL permissions (single-tenant owner)
  const allPermissions = [
    ...orgPermissions,
    ...rolePermissions,
    ...permissionPermissions,
    ...userPermissions,
    ...devicePermissions,
    ...deviceGroupPermissions,
    ...masterDataPermissions,
    ...profileParamPermissions,
    ...deviceProfilePermissions,
  ];

  for (const p of allPermissions) {
    await ds.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [trustAdminRole.id, p.id],
    );
  }

  // ADMINISTRATOR: user + device + device-group + master-data + profile-param + device-profile
  for (const p of [
    ...userPermissions,
    ...devicePermissions,
    ...deviceGroupPermissions,
    ...masterDataPermissions,
    ...profileParamPermissions,
    ...deviceProfilePermissions,
  ]) {
    await ds.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [adminRole.id, p.id],
    );
  }

  // OPERATOR: device + device-group + master-data + profile-param + device-profile
  for (const p of [
    ...devicePermissions,
    ...deviceGroupPermissions,
    ...masterDataPermissions,
    ...profileParamPermissions,
    ...deviceProfilePermissions,
  ]) {
    await ds.query(
      `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
      [operatorRole.id, p.id],
    );
  }

  // ============================================
  // 4. DEFAULT TRUST ADMIN USER
  // ============================================

  const trustAdminPass = await bcrypt.hash(
    process.env.SEED_TRUSTADMIN_PASSWORD || "TrustAdmin",
    10,
  );
  await ds.query(
    `INSERT IGNORE INTO tb_user (ou_id, username, email, password_hash, must_change_password)
     VALUES (?, ?, ?, ?, ?)`,
    [null, "TrustAdmin", "trustadmin@system.local", trustAdminPass, true],
  );

  const trustAdminUser = await userRepo.findOneBy({ username: "TrustAdmin" });
  if (trustAdminUser) {
    await ds.query(
      `INSERT IGNORE INTO tenant_user_roles (user_id, role_id) VALUES (?, ?)`,
      [trustAdminUser.user_id, trustAdminRole.id],
    );
  }

  console.log("✅ Seed completed successfully");
}
