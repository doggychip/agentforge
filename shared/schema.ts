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
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID for subscribers
  googleId: text("google_id"),
  githubId: text("github_id"),
  emailVerified: boolean("email_verified").notNull().default(false),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
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
  stripeAccountId: text("stripe_account_id"), // Stripe Connect Express account ID
  stripeOnboarded: boolean("stripe_onboarded").notNull().default(false),
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
  hfSpaceUrl: text("hf_space_url"), // Hugging Face Space embed URL
  hfModelId: text("hf_model_id"), // Hugging Face model ID (e.g. "meta-llama/Llama-3-8B")
  backendType: text("backend_type").notNull().default("self-hosted"), // "self-hosted" | "hf-inference"
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
  stripeSubscriptionId: text("stripe_subscription_id"), // Stripe subscription ID for paid plans
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  currentPeriodEnd: timestamp("current_period_end"),
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

// API Keys for programmatic access
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revoked: boolean("revoked").notNull().default(false),
  rateLimit: integer("rate_limit").notNull().default(1000),
  rateLimitDay: integer("rate_limit_day").notNull().default(10000),
});

// API Usage Logs
export const apiUsageLogs = pgTable("api_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: varchar("api_key_id").notNull(),
  userId: varchar("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  statusCode: integer("status_code").notNull(),
  responseTimeMs: integer("response_time_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Playground conversations
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // null for anonymous trial
  agentId: varchar("agent_id").notNull(),
  title: text("title"), // auto-generated from first message
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Conversation messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
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

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, lastUsedAt: true, createdAt: true, revoked: true, rateLimit: true, rateLimitDay: true });
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

export const insertApiUsageLogSchema = createInsertSchema(apiUsageLogs).omit({ id: true, createdAt: true });
export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = z.infer<typeof insertApiUsageLogSchema>;

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, updatedAt: true });
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Safe user type (no password or TOTP secret)
export type SafeUser = Omit<User, "password" | "totpSecret">;
