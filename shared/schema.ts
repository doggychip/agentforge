import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  avatar: text("avatar"),
  role: text("role").notNull().default("user"), // "user" | "creator" | "admin"
});

// Creators on the platform
export const creators = pgTable("creators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // null for seed data, linked for real creators
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

// Creator posts / articles
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: varchar("creator_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(), // markdown content
  excerpt: text("excerpt"), // short preview for gated content
  visibility: text("visibility").notNull().default("public"), // "public" | "subscribers"
  tags: text("tags").array().notNull(),
  likes: integer("likes").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  featured: boolean("featured").notNull().default(false),
});

// Post likes
export const postLikes = pgTable("post_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  userId: varchar("user_id").notNull(),
});

// Post comments
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull(),
  userId: varchar("user_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Creator subscriptions (follow a creator)
export const creatorSubscriptions = pgTable("creator_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  creatorId: varchar("creator_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Agent subscriptions / installs
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriberId: varchar("subscriber_id").notNull(),
  subscriberType: text("subscriber_type").notNull(), // "human" | "agent"
  agentId: varchar("agent_id").notNull(),
  plan: text("plan").notNull(), // "free" | "pro" | "enterprise"
  status: text("status").notNull().default("active"),
});

// Agent reviews
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  userId: varchar("user_id").notNull(),
  authorName: text("author_name").notNull(),
  rating: integer("rating").notNull(), // 1-5
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(), // recipient
  type: text("type").notNull(), // "like" | "comment" | "subscribe" | "new_post"
  actorName: text("actor_name").notNull(), // who triggered the notification
  message: text("message").notNull(),
  link: text("link"), // e.g. "/posts/xyz"
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Auth schemas
export const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores"),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, avatar: true, role: true });
export const insertCreatorSchema = createInsertSchema(creators).omit({ id: true });
export const insertAgentSchema = createInsertSchema(agents).omit({ id: true });
export const insertPostSchema = createInsertSchema(posts).omit({ id: true, likes: true, commentCount: true, createdAt: true, featured: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true });
export const insertCreatorSubscriptionSchema = createInsertSchema(creatorSubscriptions).omit({ id: true, createdAt: true });
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, read: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCreator = z.infer<typeof insertCreatorSchema>;
export type Creator = typeof creators.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;
export type CreatorSubscription = typeof creatorSubscriptions.$inferSelect;
export type InsertCreatorSubscription = z.infer<typeof insertCreatorSubscriptionSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Safe user type (no password)
export type SafeUser = Omit<User, "password">;
