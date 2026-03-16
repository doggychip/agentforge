import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Creators on the platform
export const creators = pgTable("creators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  handle: text("handle").notNull().unique(),
  avatar: text("avatar").notNull(),
  bio: text("bio").notNull(),
  subscribers: integer("subscribers").notNull().default(0),
  agentCount: integer("agent_count").notNull().default(0),
  tags: text("tags").array().notNull(),
  verified: boolean("verified").notNull().default(false),
});

// AI Agents / Tools / Content published by creators
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  category: text("category").notNull(), // "agent" | "tool" | "content" | "api"
  pricing: text("pricing").notNull(), // "free" | "subscription" | "usage"
  price: integer("price"), // in cents, null for free
  currency: text("currency").default("USD"),
  tags: text("tags").array().notNull(),
  stars: integer("stars").notNull().default(0),
  downloads: integer("downloads").notNull().default(0),
  apiEndpoint: text("api_endpoint"),
  status: text("status").notNull().default("active"), // "active" | "beta" | "deprecated"
  featured: boolean("featured").notNull().default(false),
});

// Subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriberId: varchar("subscriber_id").notNull(),
  subscriberType: text("subscriber_type").notNull(), // "human" | "agent"
  agentId: varchar("agent_id").notNull(),
  plan: text("plan").notNull(), // "free" | "pro" | "enterprise"
  status: text("status").notNull().default("active"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export const insertCreatorSchema = createInsertSchema(creators).omit({ id: true });
export const insertAgentSchema = createInsertSchema(agents).omit({ id: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Creator = typeof creators.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
