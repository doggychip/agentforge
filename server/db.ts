import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Only create a real pool if DATABASE_URL is set.
// Otherwise fall back to in-memory storage (see storage.ts).
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  db = drizzle(pool, { schema });
}

export { db };
