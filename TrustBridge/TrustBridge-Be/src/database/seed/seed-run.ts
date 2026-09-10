/**
 * Standalone seed runner — run manually with: npm run seed
 * Does NOT run on application startup.
 */
import { config } from "dotenv";
import { DataSource } from "typeorm";

import { seed } from "./seed";

config();

const ds = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  entities: [__dirname + "/../../entities/*.entity{.ts,.js}"],
  synchronize: true,
});

async function run() {
  await ds.initialize();
  try {
    await seed(ds);
    console.log("✅ Seeding complete.");
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
