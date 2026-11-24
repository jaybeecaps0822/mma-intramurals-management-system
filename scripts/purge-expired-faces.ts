import "dotenv/config";
import { lte } from "drizzle-orm";
import { db, pool } from "../src/db";
import { faceProfiles } from "../src/db/schema";

async function main() {
  const result = await db.delete(faceProfiles).where(lte(faceProfiles.expiresAt, new Date()));
  console.log(`Deleted ${result.rowCount || 0} expired face templates.`);
}
main().catch(() => { console.error("Unable to purge expired face templates. Check the deployment's database connection."); process.exitCode = 1; }).finally(() => pool.end());
