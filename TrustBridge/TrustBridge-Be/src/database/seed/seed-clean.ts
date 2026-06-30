/**
 * Standalone seed cleaner — run manually with: npm run seed:clean
 * Removes ALL data inserted by the seeder (permissions, roles, users, org, tenant).
 */
import { DataSource } from "typeorm";
import { config } from "dotenv";

config();

const ds = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [],
  synchronize: false,
});

const SEEDED_PERMISSION_KEYS = [
  "org:create", "org:update", "org:retrieve", "org:delete",
  "role:create", "role:update", "role:retrieve", "role:delete",
  "permission:create", "permission:update", "permission:retrieve", "permission:delete",
  "user:create", "user:update", "user:retrieve", "user:delete", "user:assign-role",
  "device:create", "device:update", "device:retrieve", "device:delete",
  "device-group:create", "device-group:update", "device-group:retrieve", "device-group:delete",
  "master-data:create", "master-data:update", "master-data:retrieve", "master-data:delete",
  "profile-param:create", "profile-param:update", "profile-param:retrieve", "profile-param:delete",
  "device-profile:create", "device-profile:update", "device-profile:retrieve", "device-profile:delete",
];

const SEEDED_ROLE_NAMES = ["SUPER_ADMIN", "ADMINISTRATOR", "OPERATIONAL_USER"];
const SEEDED_USERNAMES = ["superadmin", "admin", "operator"];
const SEEDED_ORG_NAME = "Sample Organization";
async function clean() {
  await ds.initialize();

  try {
    console.log("🧹 Cleaning seeded data...");

    // 1. Remove tenant credentials and tenants for Sample Organization
    await ds.query(
      `DELETE tuc FROM cr_tenant_user_credential tuc
       INNER JOIN cr_tenant t ON t.tenant_id = tuc.tenant_id
       INNER JOIN tb_organization_unit o ON o.ou_id = t.ou_id
       WHERE o.ou_name = ?`,
      [SEEDED_ORG_NAME],
    );
    console.log("  ✓ Tenant credentials removed");

    await ds.query(
      `DELETE t FROM cr_tenant t
       INNER JOIN tb_organization_unit o ON o.ou_id = t.ou_id
       WHERE o.ou_name = ?`,
      [SEEDED_ORG_NAME],
    );
    console.log("  ✓ Tenants removed");

    // 3. Remove user roles for seeded users
    const placeholders = SEEDED_USERNAMES.map(() => "?").join(", ");
    await ds.query(
      `DELETE tur FROM tenant_user_roles tur
       INNER JOIN tb_user u ON u.user_id = tur.user_id
       WHERE u.username IN (${placeholders})`,
      SEEDED_USERNAMES,
    );
    console.log("  ✓ User role assignments removed");

    // 4. Remove seeded users
    await ds.query(`DELETE FROM tb_user WHERE username IN (${placeholders})`, SEEDED_USERNAMES);
    console.log("  ✓ Seeded users removed");

    // 5. Remove all Sample Organizations (including duplicates from old runs)
    await ds.query(`DELETE FROM tb_organization_unit WHERE ou_name = ?`, [SEEDED_ORG_NAME]);
    console.log("  ✓ Sample organization removed");

    // 6. Remove role_permissions for seeded roles
    const rolePlaceholders = SEEDED_ROLE_NAMES.map(() => "?").join(", ");
    await ds.query(
      `DELETE rp FROM role_permissions rp
       INNER JOIN roles r ON r.id = rp.role_id
       WHERE r.name IN (${rolePlaceholders})`,
      SEEDED_ROLE_NAMES,
    );
    console.log("  ✓ Role-permission mappings removed");

    // 7. Remove seeded roles
    await ds.query(`DELETE FROM roles WHERE name IN (${rolePlaceholders})`, SEEDED_ROLE_NAMES);
    console.log("  ✓ Seeded roles removed");

    // 8. Remove seeded permissions
    const permPlaceholders = SEEDED_PERMISSION_KEYS.map(() => "?").join(", ");
    await ds.query(
      `DELETE FROM permissions WHERE \`key\` IN (${permPlaceholders})`,
      SEEDED_PERMISSION_KEYS,
    );
    console.log("  ✓ Seeded permissions removed");

    console.log("\n✅ Clean complete. Run `npm run seed` to re-seed.");
  } finally {
    await ds.destroy();
  }
}

clean().catch((err) => {
  console.error("❌ Clean failed:", err);
  process.exit(1);
});
