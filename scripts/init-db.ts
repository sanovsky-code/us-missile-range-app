/**
 * Create data/app.db with the empty schema. Idempotent.
 * Run with: npm run db:init
 */
import { getDb, getDbPath } from "../src/lib/db";

const db = getDb();
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
).all() as { name: string }[];

console.log(`Database initialised at ${getDbPath()}`);
console.log(`Tables: ${tables.map((t) => t.name).join(", ")}`);
