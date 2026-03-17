import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Only create a real pool if DATABASE_URL is set.
// Otherwise fall back to in-memory storage (see storage.ts).
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let pool: InstanceType<typeof Pool> | null = null;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });
  db = drizzle(pool, { schema });
}

/**
 * Auto-create tables if they don't exist.
 * Uses raw SQL so we don't need drizzle-kit at runtime.
 */
export async function migrateIfNeeded() {
  if (!pool) return;

  const client = await pool.connect();
  try {
    // Always ensure session table exists (might be missing from earlier migrations)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");
    `);
    console.log("[db] Session table ensured");

    // Always ensure api_keys table exists (new feature addition)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "api_keys" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL,
        "name" text NOT NULL,
        "key_hash" text NOT NULL,
        "key_prefix" text NOT NULL,
        "last_used_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "revoked" boolean NOT NULL DEFAULT false
      );
    `);
    console.log("[db] API keys table ensured");

    // Check if main data tables already exist
    const result = await client.query(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'creators'`
    );
    if (parseInt(result.rows[0].count, 10) > 0) {
      console.log("[db] Data tables already exist, skipping migration");
      return;
    }

    console.log("[db] Running auto-migration — creating tables...");

    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");

      CREATE TABLE IF NOT EXISTS "users" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "username" text NOT NULL UNIQUE,
        "email" text NOT NULL UNIQUE,
        "password" text NOT NULL,
        "display_name" text NOT NULL,
        "avatar" text,
        "role" text NOT NULL DEFAULT 'user',
        "stripe_customer_id" text
      );

      CREATE TABLE IF NOT EXISTS "creators" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar,
        "name" text NOT NULL,
        "handle" text NOT NULL UNIQUE,
        "avatar" text NOT NULL,
        "bio" text NOT NULL,
        "subscribers" integer NOT NULL DEFAULT 0,
        "agent_count" integer NOT NULL DEFAULT 0,
        "tags" text[] NOT NULL,
        "verified" boolean NOT NULL DEFAULT false,
        "stripe_account_id" text,
        "stripe_onboarded" boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS "agents" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "creator_id" varchar NOT NULL,
        "name" text NOT NULL,
        "description" text NOT NULL,
        "long_description" text,
        "category" text NOT NULL,
        "pricing" text NOT NULL,
        "price" integer,
        "currency" text DEFAULT 'USD',
        "tags" text[] NOT NULL,
        "stars" integer NOT NULL DEFAULT 0,
        "downloads" integer NOT NULL DEFAULT 0,
        "api_endpoint" text,
        "status" text NOT NULL DEFAULT 'active',
        "featured" boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS "posts" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "creator_id" varchar NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "excerpt" text,
        "visibility" text NOT NULL DEFAULT 'public',
        "tags" text[] NOT NULL,
        "likes" integer NOT NULL DEFAULT 0,
        "comment_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "featured" boolean NOT NULL DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS "post_likes" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "post_id" varchar NOT NULL,
        "user_id" varchar NOT NULL
      );

      CREATE TABLE IF NOT EXISTS "comments" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "post_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "author_name" text NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "subscriber_id" varchar NOT NULL,
        "subscriber_type" text NOT NULL,
        "agent_id" varchar NOT NULL,
        "plan" text NOT NULL,
        "status" text NOT NULL DEFAULT 'active',
        "stripe_subscription_id" text,
        "stripe_checkout_session_id" text,
        "current_period_end" timestamp
      );

      CREATE TABLE IF NOT EXISTS "creator_subscriptions" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL,
        "creator_id" varchar NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        UNIQUE("user_id", "creator_id")
      );

      CREATE TABLE IF NOT EXISTS "reviews" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "agent_id" varchar NOT NULL,
        "user_id" varchar NOT NULL,
        "author_name" text NOT NULL,
        "rating" integer NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL,
        "type" text NOT NULL,
        "actor_name" text NOT NULL,
        "message" text NOT NULL,
        "link" text,
        "read" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT now()
      );
    `);

    console.log("[db] Migration complete — all tables created");
  } finally {
    client.release();
  }
}

export { db };
