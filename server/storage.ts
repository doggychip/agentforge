import {
  type User, type InsertUser,
  type Creator, type InsertCreator,
  type Agent, type InsertAgent,
  type Post, type InsertPost,
  type Comment, type InsertComment,
  type Subscription, type InsertSubscription,
  type CreatorSubscription, type InsertCreatorSubscription,
  type Review, type InsertReview,
  type Notification, type InsertNotification,
  type ApiKey, type InsertApiKey,
  type ApiUsageLog, type InsertApiUsageLog,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  users, creators, agents, posts, postLikes, comments, subscriptions,
  creatorSubscriptions, reviews, notifications, apiKeys, apiUsageLogs,
  conversations, messages,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, ilike, or, desc, and, sql } from "drizzle-orm";

// ─── Interface ───────────────────────────────────────────────
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getCreators(): Promise<Creator[]>;
  getCreator(id: string): Promise<Creator | undefined>;
  getCreatorByHandle(handle: string): Promise<Creator | undefined>;
  getCreatorByUserId(userId: string): Promise<Creator | undefined>;
  createCreator(creator: InsertCreator): Promise<Creator>;
  getFeaturedCreators(): Promise<Creator[]>;

  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentsByCreator(creatorId: string): Promise<Agent[]>;
  getFeaturedAgents(): Promise<Agent[]>;
  getAgentsByCategory(category: string): Promise<Agent[]>;
  searchAgents(query: string): Promise<Agent[]>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgent(id: string, data: Partial<Agent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<void>;

  getPosts(limit?: number): Promise<Post[]>;
  getPost(id: string): Promise<Post | undefined>;
  getPostsByCreator(creatorId: string): Promise<Post[]>;
  createPost(post: InsertPost): Promise<Post>;
  likePost(postId: string, userId: string): Promise<boolean>; // returns true if liked, false if unliked
  hasLiked(postId: string, userId: string): Promise<boolean>;
  getComments(postId: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  getSubscriptions(subscriberId: string): Promise<Subscription[]>;
  createSubscription(sub: InsertSubscription): Promise<Subscription>;

  // Creator subscriptions (follow/unfollow)
  subscribeToCreator(userId: string, creatorId: string): Promise<boolean>; // true=subscribed, false=unsubscribed
  isSubscribedToCreator(userId: string, creatorId: string): Promise<boolean>;
  getCreatorSubscriptions(userId: string): Promise<CreatorSubscription[]>;
  getUserSubscribedCreatorIds(userId: string): Promise<string[]>;

  // Reviews
  getReviewsByAgent(agentId: string): Promise<Review[]>;
  createReview(review: InsertReview): Promise<Review>;
  getAgentAverageRating(agentId: string): Promise<{ avg: number; count: number }>;

  // Search across all entities
  searchAll(query: string): Promise<{ agents: Agent[]; creators: Creator[]; posts: Post[] }>;

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationsRead(userId: string, ids?: string[]): Promise<void>;

  // User activity
  getUserLikedPosts(userId: string): Promise<Post[]>;
  getUserComments(userId: string): Promise<Comment[]>;

  // Stripe helpers
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  updateCreator(id: string, data: Partial<Creator>): Promise<Creator | undefined>;
  updateSubscription(id: string, data: Partial<Subscription>): Promise<Subscription | undefined>;
  getSubscriptionByStripeSessionId(sessionId: string): Promise<Subscription | undefined>;
  getSubscriptionByStripeSubId(stripeSubId: string): Promise<Subscription | undefined>;

  // API Keys
  getApiKeysByUser(userId: string): Promise<ApiKey[]>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  revokeApiKey(id: string, userId: string): Promise<boolean>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  updateApiKey(id: string, data: Partial<ApiKey>): Promise<ApiKey | undefined>;

  // Usage logging
  logApiUsage(log: InsertApiUsageLog): Promise<void>;
  getUsageByKey(apiKeyId: string, since: Date): Promise<ApiUsageLog[]>;
  getUsageCountByKey(apiKeyId: string, since: Date): Promise<number>;
  getUsageStatsByUser(userId: string): Promise<{
    today: number;
    thisWeek: number;
    thisMonth: number;
    byKey: { keyId: string; keyName: string; keyPrefix: string; count: number }[];
    dailyCounts: { date: string; count: number }[];
  }>;

  // Conversations
  createConversation(conv: InsertConversation): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | undefined>;
  getConversationsByUser(userId: string): Promise<Conversation[]>;
  updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation | undefined>;

  // Messages
  createMessage(msg: InsertMessage): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;

  seed(): Promise<void>;
}

// ─── Postgres Storage ────────────────────────────────────────
class PgStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db!.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username: string) {
    const [user] = await db!.select().from(users).where(eq(users.username, username));
    return user;
  }
  async getUserByEmail(email: string) {
    const [user] = await db!.select().from(users).where(eq(users.email, email));
    return user;
  }
  async getUserByGoogleId(googleId: string) {
    const [user] = await db!.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }
  async createUser(insertUser: InsertUser) {
    const [user] = await db!.insert(users).values(insertUser).returning();
    return user;
  }

  async getCreators() { return db!.select().from(creators); }
  async getCreator(id: string) {
    const [creator] = await db!.select().from(creators).where(eq(creators.id, id));
    return creator;
  }
  async getCreatorByHandle(handle: string) {
    const [creator] = await db!.select().from(creators).where(eq(creators.handle, handle));
    return creator;
  }
  async getCreatorByUserId(userId: string) {
    const [creator] = await db!.select().from(creators).where(eq(creators.userId, userId));
    return creator;
  }
  async createCreator(insertCreator: InsertCreator) {
    const [creator] = await db!.insert(creators).values(insertCreator).returning();
    return creator;
  }
  async getFeaturedCreators() {
    return db!.select().from(creators).where(eq(creators.verified, true)).limit(4);
  }

  async getAgents() { return db!.select().from(agents); }
  async getAgent(id: string) {
    const [agent] = await db!.select().from(agents).where(eq(agents.id, id));
    return agent;
  }
  async getAgentsByCreator(creatorId: string) {
    return db!.select().from(agents).where(eq(agents.creatorId, creatorId));
  }
  async getFeaturedAgents() {
    return db!.select().from(agents).where(eq(agents.featured, true));
  }
  async getAgentsByCategory(category: string) {
    return db!.select().from(agents).where(eq(agents.category, category));
  }
  async searchAgents(query: string) {
    const pattern = `%${query}%`;
    return db!.select().from(agents).where(
      or(ilike(agents.name, pattern), ilike(agents.description, pattern))
    );
  }
  async createAgent(insertAgent: InsertAgent) {
    const [agent] = await db!.insert(agents).values(insertAgent).returning();
    return agent;
  }
  async updateAgent(id: string, data: Partial<Agent>) {
    const [updated] = await db!.update(agents).set(data).where(eq(agents.id, id)).returning();
    return updated;
  }
  async deleteAgent(id: string) {
    await db!.delete(agents).where(eq(agents.id, id));
  }

  async getPosts(limit = 50) {
    return db!.select().from(posts).orderBy(desc(posts.createdAt)).limit(limit);
  }
  async getPost(id: string) {
    const [post] = await db!.select().from(posts).where(eq(posts.id, id));
    return post;
  }
  async getPostsByCreator(creatorId: string) {
    return db!.select().from(posts).where(eq(posts.creatorId, creatorId)).orderBy(desc(posts.createdAt));
  }
  async createPost(insertPost: InsertPost) {
    const [post] = await db!.insert(posts).values(insertPost).returning();
    return post;
  }
  async likePost(postId: string, userId: string) {
    const [existing] = await db!.select().from(postLikes).where(
      and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))
    );
    if (existing) {
      await db!.delete(postLikes).where(eq(postLikes.id, existing.id));
      await db!.update(posts).set({ likes: sql`${posts.likes} - 1` }).where(eq(posts.id, postId));
      return false;
    }
    await db!.insert(postLikes).values({ postId, userId });
    await db!.update(posts).set({ likes: sql`${posts.likes} + 1` }).where(eq(posts.id, postId));
    return true;
  }
  async hasLiked(postId: string, userId: string) {
    const [existing] = await db!.select().from(postLikes).where(
      and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))
    );
    return !!existing;
  }
  async getComments(postId: string) {
    return db!.select().from(comments).where(eq(comments.postId, postId)).orderBy(desc(comments.createdAt));
  }
  async createComment(insertComment: InsertComment) {
    const [comment] = await db!.insert(comments).values(insertComment).returning();
    await db!.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, insertComment.postId));
    return comment;
  }

  async getSubscriptions(subscriberId: string) {
    return db!.select().from(subscriptions).where(eq(subscriptions.subscriberId, subscriberId));
  }
  async createSubscription(sub: InsertSubscription) {
    const [subscription] = await db!.insert(subscriptions).values(sub).returning();
    return subscription;
  }

  async subscribeToCreator(userId: string, creatorId: string) {
    const [existing] = await db!.select().from(creatorSubscriptions).where(
      and(eq(creatorSubscriptions.userId, userId), eq(creatorSubscriptions.creatorId, creatorId))
    );
    if (existing) {
      await db!.delete(creatorSubscriptions).where(eq(creatorSubscriptions.id, existing.id));
      await db!.update(creators).set({ subscribers: sql`GREATEST(${creators.subscribers} - 1, 0)` }).where(eq(creators.id, creatorId));
      return false;
    }
    await db!.insert(creatorSubscriptions).values({ userId, creatorId });
    await db!.update(creators).set({ subscribers: sql`${creators.subscribers} + 1` }).where(eq(creators.id, creatorId));
    return true;
  }
  async isSubscribedToCreator(userId: string, creatorId: string) {
    const [existing] = await db!.select().from(creatorSubscriptions).where(
      and(eq(creatorSubscriptions.userId, userId), eq(creatorSubscriptions.creatorId, creatorId))
    );
    return !!existing;
  }
  async getCreatorSubscriptions(userId: string) {
    return db!.select().from(creatorSubscriptions).where(eq(creatorSubscriptions.userId, userId));
  }
  async getUserSubscribedCreatorIds(userId: string) {
    const subs = await db!.select({ creatorId: creatorSubscriptions.creatorId }).from(creatorSubscriptions).where(eq(creatorSubscriptions.userId, userId));
    return subs.map(s => s.creatorId);
  }

  async getReviewsByAgent(agentId: string) {
    return db!.select().from(reviews).where(eq(reviews.agentId, agentId)).orderBy(desc(reviews.createdAt));
  }
  async createReview(review: InsertReview) {
    const [r] = await db!.insert(reviews).values(review).returning();
    return r;
  }
  async getAgentAverageRating(agentId: string) {
    const result = await db!.select({
      avg: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(reviews).where(eq(reviews.agentId, agentId));
    return { avg: Number(result[0]?.avg || 0), count: Number(result[0]?.count || 0) };
  }

  // Notifications (Pg)
  async getNotifications(userId: string, limit = 30) {
    return db!.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  }
  async getUnreadCount(userId: string) {
    const result = await db!.select({ count: sql<number>`COUNT(*)` }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(result[0]?.count || 0);
  }
  async createNotification(notification: InsertNotification) {
    const [n] = await db!.insert(notifications).values(notification).returning();
    return n;
  }
  async markNotificationsRead(userId: string, ids?: string[]) {
    if (ids && ids.length > 0) {
      // Mark specific notifications read
      for (const id of ids) {
        await db!.update(notifications).set({ read: true }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
      }
    } else {
      // Mark all read
      await db!.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
    }
  }

  async searchAll(query: string) {
    const pattern = `%${query}%`;
    const [matchedAgents, matchedCreators, matchedPosts] = await Promise.all([
      db!.select().from(agents).where(
        or(ilike(agents.name, pattern), ilike(agents.description, pattern))
      ),
      db!.select().from(creators).where(
        or(ilike(creators.name, pattern), ilike(creators.bio, pattern), ilike(creators.handle, pattern))
      ),
      db!.select().from(posts).where(
        or(ilike(posts.title, pattern), ilike(posts.body, pattern))
      ).orderBy(desc(posts.createdAt)),
    ]);
    return { agents: matchedAgents, creators: matchedCreators, posts: matchedPosts };
  }

  async getUserLikedPosts(userId: string) {
    const likes = await db!.select({ postId: postLikes.postId }).from(postLikes).where(eq(postLikes.userId, userId));
    if (likes.length === 0) return [];
    const postIds = likes.map(l => l.postId);
    const allPosts = await db!.select().from(posts);
    return allPosts.filter(p => postIds.includes(p.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getUserComments(userId: string) {
    return db!.select().from(comments).where(eq(comments.userId, userId)).orderBy(desc(comments.createdAt));
  }

  // Stripe helpers (Pg)
  async updateUser(id: string, data: Partial<User>) {
    const [updated] = await db!.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }
  async updateCreator(id: string, data: Partial<Creator>) {
    const [updated] = await db!.update(creators).set(data).where(eq(creators.id, id)).returning();
    return updated;
  }
  async updateSubscription(id: string, data: Partial<Subscription>) {
    const [updated] = await db!.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
    return updated;
  }
  async getSubscriptionByStripeSessionId(sessionId: string) {
    const [sub] = await db!.select().from(subscriptions).where(eq(subscriptions.stripeCheckoutSessionId, sessionId));
    return sub;
  }
  async getSubscriptionByStripeSubId(stripeSubId: string) {
    const [sub] = await db!.select().from(subscriptions).where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
    return sub;
  }

  // API Keys (Pg)
  async getApiKeysByUser(userId: string) {
    return db!.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }
  async createApiKey(key: InsertApiKey) {
    const [created] = await db!.insert(apiKeys).values(key).returning();
    return created;
  }
  async getApiKeyByHash(keyHash: string) {
    const [key] = await db!.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key;
  }
  async revokeApiKey(id: string, userId: string) {
    const result = await db!.update(apiKeys).set({ revoked: true }).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).returning();
    return result.length > 0;
  }
  async updateApiKeyLastUsed(id: string) {
    await db!.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }
  async updateApiKey(id: string, data: Partial<ApiKey>) {
    const [updated] = await db!.update(apiKeys).set(data).where(eq(apiKeys.id, id)).returning();
    return updated;
  }

  // Usage logging (Pg)
  async logApiUsage(log: InsertApiUsageLog) {
    await db!.insert(apiUsageLogs).values(log);
  }
  async getUsageByKey(apiKeyId: string, since: Date) {
    return db!.select().from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.apiKeyId, apiKeyId), sql`${apiUsageLogs.createdAt} >= ${since}`))
      .orderBy(desc(apiUsageLogs.createdAt));
  }
  async getUsageCountByKey(apiKeyId: string, since: Date) {
    const [result] = await db!.select({ count: sql<number>`count(*)::int` }).from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.apiKeyId, apiKeyId), sql`${apiUsageLogs.createdAt} >= ${since}`));
    return result?.count ?? 0;
  }
  async getUsageStatsByUser(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

    const [todayResult] = await db!.select({ count: sql<number>`count(*)::int` }).from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), sql`${apiUsageLogs.createdAt} >= ${startOfToday}`));
    const [weekResult] = await db!.select({ count: sql<number>`count(*)::int` }).from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), sql`${apiUsageLogs.createdAt} >= ${sevenDaysAgo}`));
    const [monthResult] = await db!.select({ count: sql<number>`count(*)::int` }).from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), sql`${apiUsageLogs.createdAt} >= ${thirtyDaysAgo}`));

    const byKeyRows = await db!
      .select({
        keyId: apiUsageLogs.apiKeyId,
        keyName: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        count: sql<number>`count(*)::int`,
      })
      .from(apiUsageLogs)
      .innerJoin(apiKeys, eq(apiUsageLogs.apiKeyId, apiKeys.id))
      .where(and(eq(apiUsageLogs.userId, userId), sql`${apiUsageLogs.createdAt} >= ${thirtyDaysAgo}`))
      .groupBy(apiUsageLogs.apiKeyId, apiKeys.name, apiKeys.keyPrefix);

    const dailyRows = await db!
      .select({
        date: sql<string>`to_char(${apiUsageLogs.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(apiUsageLogs)
      .where(and(eq(apiUsageLogs.userId, userId), sql`${apiUsageLogs.createdAt} >= ${thirtyDaysAgo}`))
      .groupBy(sql`to_char(${apiUsageLogs.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${apiUsageLogs.createdAt}, 'YYYY-MM-DD')`);

    return {
      today: todayResult?.count ?? 0,
      thisWeek: weekResult?.count ?? 0,
      thisMonth: monthResult?.count ?? 0,
      byKey: byKeyRows,
      dailyCounts: dailyRows,
    };
  }

  // ─── Conversations ────────────────────────────────────────
  async createConversation(conv: InsertConversation) {
    const [row] = await db!.insert(conversations).values(conv).returning();
    return row;
  }
  async getConversation(id: string) {
    const [row] = await db!.select().from(conversations).where(eq(conversations.id, id));
    return row;
  }
  async getConversationsByUser(userId: string) {
    return db!.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
  }
  async updateConversation(id: string, data: Partial<Conversation>) {
    const [row] = await db!.update(conversations).set(data).where(eq(conversations.id, id)).returning();
    return row;
  }
  async createMessage(msg: InsertMessage) {
    const [row] = await db!.insert(messages).values(msg).returning();
    return row;
  }
  async getMessages(conversationId: string) {
    return db!.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async seed() {
    try {
      // Check what already exists
      const existingCreatorIds = new Set((await db!.select({ id: creators.id }).from(creators)).map(r => r.id));
      const existingAgentIds = new Set((await db!.select({ id: agents.id }).from(agents)).map(r => r.id));
      const existingPostIds = new Set((await db!.select({ id: posts.id }).from(posts)).map(r => r.id));

      // Insert missing creators
      const newCreators = SEED_CREATORS.filter(c => !existingCreatorIds.has(c.id!));
      if (newCreators.length > 0) {
        await db!.insert(creators).values(newCreators);
        console.log(`Seeded ${newCreators.length} new creators`);
      }

      // Insert missing agents
      const newAgents = SEED_AGENTS.filter(a => !existingAgentIds.has(a.id!));
      if (newAgents.length > 0) {
        await db!.insert(agents).values(newAgents);
        console.log(`Seeded ${newAgents.length} new agents`);
      }

      // Insert missing posts — convert createdAt strings to Date objects for Postgres
      const newPosts = (SEED_POSTS as any[]).filter(p => !existingPostIds.has(p.id!)).map(p => ({
        ...p,
        createdAt: new Date(p.createdAt),
      }));
      if (newPosts.length > 0) {
        await db!.insert(posts).values(newPosts);
        console.log(`Seeded ${newPosts.length} new posts`);
      }

      console.log(`Database seed complete (${existingCreatorIds.size + newCreators.length} creators, ${existingAgentIds.size + newAgents.length} agents, ${existingPostIds.size + newPosts.length} posts)`);
    } catch (err) {
      console.error("Seed error (non-fatal):", err);
    }
  }
}

// ─── In-Memory Storage (no DATABASE_URL) ─────────────────────
class MemStorage implements IStorage {
  private usersMap: Map<string, User>;
  private creatorsMap: Map<string, Creator>;
  private agentsMap: Map<string, Agent>;
  private postsMap: Map<string, Post>;
  private postLikesMap: Map<string, { postId: string; userId: string }>;
  private commentsMap: Map<string, Comment>;
  private subscriptionsMap: Map<string, Subscription>;
  private creatorSubsMap: Map<string, CreatorSubscription>;
  private reviewsMap: Map<string, Review>;
  private notificationsMap: Map<string, Notification>;
  private apiKeysMap: Map<string, ApiKey>;
  private apiUsageLogsArr: ApiUsageLog[];
  private conversationsMap: Map<string, Conversation>;
  private messagesMap: Map<string, Message>;

  constructor() {
    this.usersMap = new Map();
    this.creatorsMap = new Map();
    this.agentsMap = new Map();
    this.postsMap = new Map();
    this.postLikesMap = new Map();
    this.commentsMap = new Map();
    this.subscriptionsMap = new Map();
    this.creatorSubsMap = new Map();
    this.reviewsMap = new Map();
    this.notificationsMap = new Map();
    this.apiKeysMap = new Map();
    this.apiUsageLogsArr = [];
    this.conversationsMap = new Map();
    this.messagesMap = new Map();
  }

  async seed() {
    SEED_CREATORS.forEach((c) => this.creatorsMap.set(c.id!, c as Creator));
    SEED_AGENTS.forEach((a) => this.agentsMap.set(a.id!, a as Agent));
    SEED_POSTS.forEach((p) => this.postsMap.set(p.id!, { ...p, createdAt: new Date(p.createdAt), featured: p.featured ?? false, commentCount: p.commentCount ?? 0 } as Post));
  }

  async getUser(id: string) { return this.usersMap.get(id); }
  async getUserByUsername(username: string) {
    return Array.from(this.usersMap.values()).find(u => u.username === username);
  }
  async getUserByEmail(email: string) {
    return Array.from(this.usersMap.values()).find(u => u.email === email);
  }
  async getUserByGoogleId(googleId: string) {
    return Array.from(this.usersMap.values()).find(u => u.googleId === googleId);
  }
  async createUser(insertUser: InsertUser) {
    const id = randomUUID();
    const user: User = { ...insertUser, id, avatar: null, role: "user", stripeCustomerId: null, googleId: null, githubId: null, emailVerified: false, totpSecret: null, totpEnabled: false };
    this.usersMap.set(id, user);
    return user;
  }

  async getCreators() { return Array.from(this.creatorsMap.values()); }
  async getCreator(id: string) { return this.creatorsMap.get(id); }
  async getCreatorByHandle(handle: string) {
    return Array.from(this.creatorsMap.values()).find(c => c.handle === handle);
  }
  async getCreatorByUserId(userId: string) {
    return Array.from(this.creatorsMap.values()).find(c => c.userId === userId);
  }
  async createCreator(insertCreator: InsertCreator) {
    const id = randomUUID();
    const creator: Creator = { ...insertCreator, id, subscribers: insertCreator.subscribers ?? 0, agentCount: insertCreator.agentCount ?? 0, verified: insertCreator.verified ?? false, stripeAccountId: insertCreator.stripeAccountId ?? null, stripeOnboarded: insertCreator.stripeOnboarded ?? false };
    this.creatorsMap.set(id, creator);
    return creator;
  }
  async getFeaturedCreators() {
    return Array.from(this.creatorsMap.values()).filter(c => c.verified).slice(0, 4);
  }

  async getAgents() { return Array.from(this.agentsMap.values()); }
  async getAgent(id: string) { return this.agentsMap.get(id); }
  async getAgentsByCreator(creatorId: string) {
    return Array.from(this.agentsMap.values()).filter(a => a.creatorId === creatorId);
  }
  async getFeaturedAgents() {
    return Array.from(this.agentsMap.values()).filter(a => a.featured);
  }
  async getAgentsByCategory(category: string) {
    return Array.from(this.agentsMap.values()).filter(a => a.category === category);
  }
  async searchAgents(query: string) {
    const q = query.toLowerCase();
    return Array.from(this.agentsMap.values()).filter(a =>
      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  async createAgent(insertAgent: InsertAgent) {
    const id = randomUUID();
    const agent: Agent = { ...insertAgent, id, stars: 0, downloads: 0, status: "active", featured: false, longDescription: insertAgent.longDescription ?? null, price: insertAgent.price ?? null, currency: insertAgent.currency ?? "USD", apiEndpoint: insertAgent.apiEndpoint ?? null, hfSpaceUrl: insertAgent.hfSpaceUrl ?? null, hfModelId: insertAgent.hfModelId ?? null, backendType: insertAgent.backendType ?? "self-hosted" };
    this.agentsMap.set(id, agent);
    return agent;
  }
  async updateAgent(id: string, data: Partial<Agent>) {
    const agent = this.agentsMap.get(id);
    if (!agent) return undefined;
    Object.assign(agent, data);
    return agent;
  }
  async deleteAgent(id: string) {
    this.agentsMap.delete(id);
  }

  async getPosts(limit = 50) {
    return Array.from(this.postsMap.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
  async getPost(id: string) { return this.postsMap.get(id); }
  async getPostsByCreator(creatorId: string) {
    return Array.from(this.postsMap.values()).filter(p => p.creatorId === creatorId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async createPost(insertPost: InsertPost) {
    const id = randomUUID();
    const post: Post = { ...insertPost, id, likes: 0, commentCount: 0, createdAt: new Date(), featured: false };
    this.postsMap.set(id, post);
    return post;
  }
  async likePost(postId: string, userId: string) {
    const key = `${postId}-${userId}`;
    if (this.postLikesMap.has(key)) {
      this.postLikesMap.delete(key);
      const post = this.postsMap.get(postId);
      if (post) post.likes = Math.max(0, post.likes - 1);
      return false;
    }
    this.postLikesMap.set(key, { postId, userId });
    const post = this.postsMap.get(postId);
    if (post) post.likes += 1;
    return true;
  }
  async hasLiked(postId: string, userId: string) {
    return this.postLikesMap.has(`${postId}-${userId}`);
  }
  async getComments(postId: string) {
    return Array.from(this.commentsMap.values()).filter(c => c.postId === postId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async createComment(insertComment: InsertComment) {
    const id = randomUUID();
    const comment: Comment = { ...insertComment, id, createdAt: new Date() };
    this.commentsMap.set(id, comment);
    const post = this.postsMap.get(insertComment.postId);
    if (post) post.commentCount += 1;
    return comment;
  }

  async getSubscriptions(subscriberId: string) {
    return Array.from(this.subscriptionsMap.values()).filter(s => s.subscriberId === subscriberId);
  }
  async createSubscription(sub: InsertSubscription) {
    const id = randomUUID();
    const subscription: Subscription = { ...sub, id, stripeSubscriptionId: sub.stripeSubscriptionId ?? null, stripeCheckoutSessionId: sub.stripeCheckoutSessionId ?? null, currentPeriodEnd: sub.currentPeriodEnd ?? null };
    this.subscriptionsMap.set(id, subscription);
    return subscription;
  }

  async subscribeToCreator(userId: string, creatorId: string) {
    const key = `${userId}-${creatorId}`;
    if (this.creatorSubsMap.has(key)) {
      this.creatorSubsMap.delete(key);
      const creator = this.creatorsMap.get(creatorId);
      if (creator) creator.subscribers = Math.max(0, creator.subscribers - 1);
      return false;
    }
    this.creatorSubsMap.set(key, { id: randomUUID(), userId, creatorId, createdAt: new Date() });
    const creator = this.creatorsMap.get(creatorId);
    if (creator) creator.subscribers += 1;
    return true;
  }
  async isSubscribedToCreator(userId: string, creatorId: string) {
    return this.creatorSubsMap.has(`${userId}-${creatorId}`);
  }
  async getCreatorSubscriptions(userId: string) {
    return Array.from(this.creatorSubsMap.values()).filter(s => s.userId === userId);
  }
  async getUserSubscribedCreatorIds(userId: string) {
    return Array.from(this.creatorSubsMap.values()).filter(s => s.userId === userId).map(s => s.creatorId);
  }

  async getReviewsByAgent(agentId: string) {
    return Array.from(this.reviewsMap.values()).filter(r => r.agentId === agentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async createReview(review: InsertReview) {
    const id = randomUUID();
    const r: Review = { ...review, id, createdAt: new Date() };
    this.reviewsMap.set(id, r);
    return r;
  }
  async getAgentAverageRating(agentId: string) {
    const agentReviews = Array.from(this.reviewsMap.values()).filter(r => r.agentId === agentId);
    if (agentReviews.length === 0) return { avg: 0, count: 0 };
    const avg = agentReviews.reduce((sum, r) => sum + r.rating, 0) / agentReviews.length;
    return { avg, count: agentReviews.length };
  }

  async searchAll(query: string) {
    const q = query.toLowerCase();
    const matchedAgents = Array.from(this.agentsMap.values()).filter(a =>
      a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q))
    );
    const matchedCreators = Array.from(this.creatorsMap.values()).filter(c =>
      c.name.toLowerCase().includes(q) || c.bio.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q)
    );
    const matchedPosts = Array.from(this.postsMap.values()).filter(p =>
      p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { agents: matchedAgents, creators: matchedCreators, posts: matchedPosts };
  }

  async getUserLikedPosts(userId: string) {
    const likedPostIds = Array.from(this.postLikesMap.entries()).filter(([_, v]) => v.userId === userId).map(([_, v]) => v.postId);
    return Array.from(this.postsMap.values()).filter(p => likedPostIds.includes(p.id)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getUserComments(userId: string) {
    return Array.from(this.commentsMap.values()).filter(c => c.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Notifications (Mem)
  async getNotifications(userId: string, limit = 30) {
    return Array.from(this.notificationsMap.values())
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async getUnreadCount(userId: string) {
    return Array.from(this.notificationsMap.values()).filter(n => n.userId === userId && !n.read).length;
  }
  async createNotification(notification: InsertNotification) {
    const id = randomUUID();
    const n: Notification = { ...notification, id, read: false, createdAt: new Date(), link: notification.link ?? null };
    this.notificationsMap.set(id, n);
    return n;
  }
  async markNotificationsRead(userId: string, ids?: string[]) {
    if (ids && ids.length > 0) {
      ids.forEach(id => {
        const n = this.notificationsMap.get(id);
        if (n && n.userId === userId) n.read = true;
      });
    } else {
      Array.from(this.notificationsMap.values()).forEach(n => {
        if (n.userId === userId) n.read = true;
      });
    }
  }

  // Stripe helpers (Mem)
  async updateUser(id: string, data: Partial<User>) {
    const user = this.usersMap.get(id);
    if (!user) return undefined;
    Object.assign(user, data);
    return user;
  }
  async updateCreator(id: string, data: Partial<Creator>) {
    const creator = this.creatorsMap.get(id);
    if (!creator) return undefined;
    Object.assign(creator, data);
    return creator;
  }
  async updateSubscription(id: string, data: Partial<Subscription>) {
    const sub = this.subscriptionsMap.get(id);
    if (!sub) return undefined;
    Object.assign(sub, data);
    return sub;
  }
  async getSubscriptionByStripeSessionId(sessionId: string) {
    return Array.from(this.subscriptionsMap.values()).find(s => s.stripeCheckoutSessionId === sessionId);
  }
  async getSubscriptionByStripeSubId(stripeSubId: string) {
    return Array.from(this.subscriptionsMap.values()).find(s => s.stripeSubscriptionId === stripeSubId);
  }

  // API Keys (Mem)
  async getApiKeysByUser(userId: string) {
    return Array.from(this.apiKeysMap.values()).filter(k => k.userId === userId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async createApiKey(key: InsertApiKey) {
    const id = randomUUID();
    const apiKey: ApiKey = { ...key, id, lastUsedAt: null, createdAt: new Date(), revoked: false, rateLimit: key.rateLimit ?? 1000, rateLimitDay: key.rateLimitDay ?? 10000 };
    this.apiKeysMap.set(id, apiKey);
    return apiKey;
  }
  async getApiKeyByHash(keyHash: string) {
    return Array.from(this.apiKeysMap.values()).find(k => k.keyHash === keyHash);
  }
  async revokeApiKey(id: string, userId: string) {
    const key = this.apiKeysMap.get(id);
    if (!key || key.userId !== userId) return false;
    key.revoked = true;
    return true;
  }
  async updateApiKeyLastUsed(id: string) {
    const key = this.apiKeysMap.get(id);
    if (key) key.lastUsedAt = new Date();
  }
  async updateApiKey(id: string, data: Partial<ApiKey>) {
    const key = this.apiKeysMap.get(id);
    if (!key) return undefined;
    Object.assign(key, data);
    return key;
  }

  // Usage logging (Mem)
  async logApiUsage(log: InsertApiUsageLog) {
    const entry: ApiUsageLog = { ...log, id: randomUUID(), createdAt: new Date(), responseTimeMs: log.responseTimeMs ?? null };
    this.apiUsageLogsArr.push(entry);
  }
  async getUsageByKey(apiKeyId: string, since: Date) {
    return this.apiUsageLogsArr
      .filter(l => l.apiKeyId === apiKeyId && l.createdAt >= since)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  async getUsageCountByKey(apiKeyId: string, since: Date) {
    return this.apiUsageLogsArr.filter(l => l.apiKeyId === apiKeyId && l.createdAt >= since).length;
  }
  async getUsageStatsByUser(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000);

    const userLogs = this.apiUsageLogsArr.filter(l => l.userId === userId);
    const today = userLogs.filter(l => l.createdAt >= startOfToday).length;
    const thisWeek = userLogs.filter(l => l.createdAt >= sevenDaysAgo).length;
    const thisMonth = userLogs.filter(l => l.createdAt >= thirtyDaysAgo).length;

    const monthLogs = userLogs.filter(l => l.createdAt >= thirtyDaysAgo);
    const byKeyMap = new Map<string, number>();
    for (const l of monthLogs) {
      byKeyMap.set(l.apiKeyId, (byKeyMap.get(l.apiKeyId) ?? 0) + 1);
    }
    const byKey = Array.from(byKeyMap.entries()).map(([keyId, count]) => {
      const k = this.apiKeysMap.get(keyId);
      return { keyId, keyName: k?.name ?? "", keyPrefix: k?.keyPrefix ?? "", count };
    });

    const dailyMap = new Map<string, number>();
    for (const l of monthLogs) {
      const date = l.createdAt.toISOString().slice(0, 10);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1);
    }
    const dailyCounts = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { today, thisWeek, thisMonth, byKey, dailyCounts };
  }

  // ─── Conversations ────────────────────────────────────────
  async createConversation(conv: InsertConversation) {
    const id = randomUUID();
    const now = new Date();
    const row: Conversation = { id, userId: conv.userId ?? null, agentId: conv.agentId, title: conv.title ?? null, createdAt: now, updatedAt: now };
    this.conversationsMap.set(id, row);
    return row;
  }
  async getConversation(id: string) { return this.conversationsMap.get(id); }
  async getConversationsByUser(userId: string) {
    return Array.from(this.conversationsMap.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  async updateConversation(id: string, data: Partial<Conversation>) {
    const existing = this.conversationsMap.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.conversationsMap.set(id, updated);
    return updated;
  }
  async createMessage(msg: InsertMessage) {
    const id = randomUUID();
    const row: Message = { id, conversationId: msg.conversationId, role: msg.role, content: msg.content, createdAt: new Date() };
    this.messagesMap.set(id, row);
    return row;
  }
  async getMessages(conversationId: string) {
    return Array.from(this.messagesMap.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

// ─── Seed Data — Asian-focused creators & bilingual content ──
const SEED_CREATORS = [
  {
    id: "c1", name: "陳明智 Ming Chen", handle: "mingchen",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ming",
    bio: "Building AI agents for DevOps automation. 專注於 DevOps 自動化的 AI 代理開發。前 Google SRE。",
    subscribers: 3847, agentCount: 6,
    tags: ["devops", "automation", "infrastructure"], verified: true,
  },
  {
    id: "c2", name: "Alex Mercer", handle: "alexmercer",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=alex",
    bio: "Full-stack dev specializing in LLM-powered code review and testing tools.",
    subscribers: 4210, agentCount: 8,
    tags: ["code-review", "testing", "llm"], verified: true,
  },
  {
    id: "c3", name: "林詩雅 Shiya Lin", handle: "shiyalin",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=shiya",
    bio: "數據管道架構師。我的 Agent 幫你搬數據。Data pipeline architect based in Taipei.",
    subscribers: 2563, agentCount: 4,
    tags: ["data", "etl", "pipelines"], verified: false,
  },
  {
    id: "c4", name: "中村海 Kai Nakamura", handle: "kainakamura",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kai",
    bio: "セキュリティ研究者からエージェント開発者へ。Security researcher turned agent builder. Pen-testing agents for the modern stack.",
    subscribers: 3890, agentCount: 5,
    tags: ["security", "pentesting", "compliance"], verified: true,
  },
  {
    id: "c5", name: "黃子君 Tzu-Chun Huang", handle: "tzuchun",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=tzuchun",
    bio: "用 AI 寫出比人類更好的技術文檔。Technical writing AI from Hong Kong 🇭🇰",
    subscribers: 1987, agentCount: 3,
    tags: ["documentation", "writing", "api-docs"], verified: false,
  },
  {
    id: "c6", name: "Jordan Blake", handle: "jordanblake",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=jordan",
    bio: "Crypto infrastructure and DeFi agent protocols. Web3 meets AI agents.",
    subscribers: 5120, agentCount: 7,
    tags: ["web3", "defi", "crypto"], verified: true,
  },
  {
    id: "c7", name: "김서연 Seoyeon Kim", handle: "seoyeonkim",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=seoyeon",
    bio: "AI 에이전트로 핀테크를 혁신합니다. Fintech AI agents from Seoul. 專注亞洲金融科技。",
    subscribers: 4650, agentCount: 5,
    tags: ["fintech", "payments", "asia"], verified: true,
  },
  {
    id: "c8", name: "張偉 Wei Zhang", handle: "weizhang",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=weizhang",
    bio: "前字節跳動工程師。Building content moderation and NLP agents for Asian languages. 中文 NLP 專家。",
    subscribers: 6210, agentCount: 9,
    tags: ["nlp", "chinese", "moderation"], verified: true,
  },
  // ─── Wave 2: Southeast Asia, India, more HK/TW/JP/KR ───────
  {
    id: "c9", name: "Priya Sharma", handle: "priyasharma",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=priya",
    bio: "Building AI agents for India's Aadhaar and UPI ecosystem. Ex-Razorpay. Making fintech accessible for 1.4B people.",
    subscribers: 7840, agentCount: 6,
    tags: ["india", "upi", "fintech"], verified: true,
  },
  {
    id: "c10", name: "梁家豪 Ka Ho Leung", handle: "kaholeung",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kaho",
    bio: "香港土生土長。Full-stack 同 AI Agent 開發者。專注 PropTech — 用 AI 改變香港地產科技。",
    subscribers: 2340, agentCount: 3,
    tags: ["proptech", "hong-kong", "real-estate"], verified: false,
  },
  {
    id: "c11", name: "田中優美 Yumi Tanaka", handle: "yumitanaka",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=yumi",
    bio: "元メルカリのMLエンジニア。ECサイトとマーケットプレイス向けのレコメンデーションAgent。Recommendation agents for e-commerce.",
    subscribers: 5430, agentCount: 4,
    tags: ["e-commerce", "recommendation", "ml"], verified: true,
  },
  {
    id: "c12", name: "Nguyen Minh Duc", handle: "ducnguyen",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=duc",
    bio: "Vietnamese dev building logistics and supply chain agents. Saigon-based. Tối ưu hóa chuỗi cung ứng bằng AI.",
    subscribers: 1890, agentCount: 3,
    tags: ["logistics", "supply-chain", "vietnam"], verified: false,
  },
  {
    id: "c13", name: "박준혁 Junhyuk Park", handle: "junhyukpark",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=junhyuk",
    bio: "네이버 출신 검색 엔지니어. AI Agent로 검색과 추천을 혁신합니다. Search & discovery agents from ex-Naver.",
    subscribers: 4120, agentCount: 5,
    tags: ["search", "discovery", "korea"], verified: true,
  },
  {
    id: "c14", name: "Arjun Patel", handle: "arjunpatel",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=arjun",
    bio: "Healthcare AI agents for South and Southeast Asia. Ex-Google Health. Building agents that speak Hindi, Tamil, and Bahasa.",
    subscribers: 3560, agentCount: 4,
    tags: ["healthcare", "india", "multilingual"], verified: true,
  },
  {
    id: "c15", name: "蔡佩珊 Pei-Shan Tsai", handle: "peishant",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=peishan",
    bio: "台大資工畢。教育科技 AI Agent 開發者。讓每個亞洲學生都有自己的 AI 家教。EdTech agents from Taipei.",
    subscribers: 3210, agentCount: 4,
    tags: ["edtech", "education", "taiwan"], verified: false,
  },
  {
    id: "c16", name: "Rizky Aditya", handle: "rizkyaditya",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=rizky",
    bio: "Jakarta-based. Building Bahasa Indonesia NLP agents and e-commerce automation for Tokopedia/Shopee sellers. Agen AI untuk UMKM.",
    subscribers: 2780, agentCount: 3,
    tags: ["indonesia", "e-commerce", "nlp"], verified: false,
  },
  {
    id: "c17", name: "佐藤健太 Kenta Sato", handle: "kentasato",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kenta",
    bio: "ゲーム開発者からAIエージェント開発者へ。元任天堂。ゲームAIとNPC行動エージェント。Game AI and NPC behavior agents. Ex-Nintendo.",
    subscribers: 8920, agentCount: 6,
    tags: ["game-ai", "npc", "japan"], verified: true,
  },
  {
    id: "c18", name: "Sophia Chen", handle: "sophiachen",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sophia",
    bio: "Singapore-based. AI agents for legal tech — contract review, compliance, and regulatory intelligence across APAC jurisdictions.",
    subscribers: 4560, agentCount: 5,
    tags: ["legal", "compliance", "singapore"], verified: true,
  },
  {
    id: "c19", name: "劉曉峰 Xiaofeng Liu", handle: "xiaofengliu",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=xiaofeng",
    bio: "前阿里雲高級工程師。雲原生 AI Agent 架構師。Cloud-native agent infrastructure — scaling from 0 to millions.",
    subscribers: 9430, agentCount: 8,
    tags: ["cloud", "kubernetes", "infrastructure"], verified: true,
  },
  {
    id: "c20", name: "이하늘 Haneul Lee", handle: "haneullee",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=haneul",
    bio: "K-뷰티와 K-패션 AI 에이전트. AI agents for K-beauty and K-fashion brands. 用 AI 推動韓國美妝品牌全球化。",
    subscribers: 3670, agentCount: 3,
    tags: ["k-beauty", "fashion", "korea"], verified: false,
  },
  {
    id: "c21", name: "何嘉欣 Jessie Ho", handle: "jessieho",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=jessie",
    bio: "港大 CS 畢業。做緊 HR Tech AI Agent — 自動化招聘、面試、onboarding。HK-based HR automation.",
    subscribers: 1560, agentCount: 2,
    tags: ["hr-tech", "recruitment", "hong-kong"], verified: false,
  },
  {
    id: "c22", name: "Thanaporn Wongcharoen", handle: "thanaporn",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=thanaporn",
    bio: "Thai NLP researcher turned agent builder. Building chatbots and customer service agents that actually understand Thai. ตัวแทน AI สำหรับธุรกิจไทย",
    subscribers: 2130, agentCount: 3,
    tags: ["thai", "chatbot", "customer-service"], verified: false,
  },
  {
    id: "c23", name: "Marcus Wong", handle: "marcuswong",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=marcus",
    bio: "Ex-Binance. Building trading agents and quantitative analysis tools. Based in Hong Kong. 量化交易 AI Agent 開發者。",
    subscribers: 11200, agentCount: 7,
    tags: ["trading", "quantitative", "crypto"], verified: true,
  },
  {
    id: "c24", name: "Anh Tran", handle: "anhtran",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=anhtran",
    bio: "Building AI agents for Southeast Asian agriculture. Helping farmers optimize yields with satellite data and crop agents. Hanoi-based.",
    subscribers: 1340, agentCount: 2,
    tags: ["agriculture", "satellite", "vietnam"], verified: false,
  },
  {
    id: "c25", name: "渡辺美咲 Misaki Watanabe", handle: "misakiwatanabe",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=misaki",
    bio: "AIエージェントでデザインワークフローを自動化。Design automation agents — from Figma to production. 元デザイナー、今はAI開発者。",
    subscribers: 3890, agentCount: 4,
    tags: ["design", "figma", "automation"], verified: true,
  },
  // ─── 观星 GuanXing (HeartAI) ─────────────────────────────────
  {
    id: "c26", name: "观星 GuanXing", handle: "guanxing",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=guanxing",
    bio: "中華玄學 × AI Agent 平台。八字排盤、六爻占卜、姓名測分、每日運勢。Webhook API + MCP Server + Agent 社區生態。Chinese metaphysics meets agentic AI.",
    subscribers: 1280, agentCount: 4,
    tags: ["metaphysics", "chinese-culture", "fortune", "bazi"], verified: true,
  },
  // ─── Ryan's Ecosystem ────────────────────────────────────────
  {
    id: "c27", name: "AlphaArena", handle: "alphaarena",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=alphaarena",
    bio: "Multi-asset AI trading competition platform. Pit your trading bots against each other in real-time. Backtesting, scoring, leaderboards. Built in Hong Kong.",
    subscribers: 890, agentCount: 3,
    tags: ["trading", "competition", "quant", "hong-kong"], verified: true,
  },
  {
    id: "c28", name: "AgentPress", handle: "agentpress",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=agentpress",
    bio: "Medium-like knowledge platform for humans and AI agents. Publish, syndicate, and consume dev content via API. Part of the OpenClaw ecosystem.",
    subscribers: 640, agentCount: 2,
    tags: ["content", "knowledge", "publishing", "agents"], verified: true,
  },
  {
    id: "c29", name: "InsiderScope", handle: "insiderscope",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=insiderscope",
    bio: "Track US Congress trades (STOCK Act), corporate insider trades (SEC Form 4), and HK disclosure of interests (HKEX DION). Follow the smart money.",
    subscribers: 2340, agentCount: 2,
    tags: ["finance", "insider-trading", "congress", "hong-kong"], verified: true,
  },
  // ─── Curated Open-Source Projects (Asian Devs) ─────────────
  {
    id: "c30", name: "Bill Chan", handle: "billpwchan",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=billchan",
    bio: "Hong Kong-based quant developer. futu_algo — algorithmic trading system for Futu/Moomoo (HK & US stocks). Open-source, Python, 500+ GitHub stars.",
    subscribers: 780, agentCount: 1,
    tags: ["quant", "trading", "hong-kong", "futu"], verified: false,
  },
  {
    id: "c31", name: "UltraLab Taiwan", handle: "ultracreation",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ultralab",
    bio: "台灣獨立開發者。MindThread SaaS、AI Agent Fleet (4 agents on Gemini 2.5 Flash)、IG Reel 自動發布。Solo builder shipping fast.",
    subscribers: 560, agentCount: 2,
    tags: ["taiwan", "saas", "automation", "gemini"], verified: false,
  },
  {
    id: "c32", name: "FutuBot", handle: "futubot",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=futubot",
    bio: "自動化港股美股交易機器人。Futu OpenD API integration for automated stock trading in HK and US markets. By quincylin1.",
    subscribers: 420, agentCount: 1,
    tags: ["trading", "futu", "automation", "hong-kong"], verified: false,
  },
  {
    id: "c33", name: "Miyabi AI", handle: "miyabiai",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=miyabi",
    bio: "日本発のAIエージェント開発者。Building AI agents for Japanese enterprise workflows. 日本語ネイティブのAIツール。",
    subscribers: 340, agentCount: 1,
    tags: ["japan", "enterprise", "japanese", "workflow"], verified: false,
  },
  {
    id: "c34", name: "Geonhee Kim", handle: "heyggun",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=geonhee",
    bio: "한국 AI 개발자. Building Korean-language AI tools and agents. Open-source contributor. 한국어 AI 에이전트 전문.",
    subscribers: 290, agentCount: 1,
    tags: ["korea", "korean-nlp", "open-source", "agents"], verified: false,
  },
  // --- Batch 2: Curated open-source projects ---
  {
    id: "c35", name: "HKUDS Lab", handle: "hkuds",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=hkuds",
    bio: "Data Intelligence Lab @ HKU. Building AutoAgent, LightRAG, AI-Trader, and more. Pushing the frontier of agentic AI research from Hong Kong.",
    subscribers: 11800, agentCount: 3,
    tags: ["hong-kong", "research", "trading", "rag", "hku"], verified: false,
  },
  {
    id: "c36", name: "Fugle 富果投資", handle: "fugledev",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=fugle",
    bio: "台灣領先投資平台. Taiwan's leading API-first investment platform. MCP server for AI-powered Taiwan stock market trading & data.",
    subscribers: 2400, agentCount: 2,
    tags: ["taiwan", "stock-market", "mcp", "fintech", "trading"], verified: false,
  },
  {
    id: "c37", name: "Alibaba NLP", handle: "alibabanlp",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=alibabanlp",
    bio: "通義實驗室 Tongyi Lab. Building Tongyi DeepResearch — the leading open-source deep research agent. 30B MoE model for deep information-seeking.",
    subscribers: 8500, agentCount: 1,
    tags: ["china", "research", "deep-research", "alibaba", "nlp"], verified: false,
  },
  {
    id: "c38", name: "OpenBMB", handle: "openbmb",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=openbmb",
    bio: "清華大學 Open Lab. ChatDev virtual software company, IoA (Internet of Agents), and more. Multi-agent collaboration research from Tsinghua.",
    subscribers: 4200, agentCount: 2,
    tags: ["china", "tsinghua", "multi-agent", "research", "chatdev"], verified: false,
  },
  {
    id: "c39", name: "DeFi Trading MCP", handle: "defitrading",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=defitrading",
    bio: "Transform your AI assistant into an autonomous crypto trading agent. Real-time market analysis, portfolio management & trade execution across 17+ blockchains.",
    subscribers: 1800, agentCount: 1,
    tags: ["defi", "crypto", "mcp", "trading", "blockchain"], verified: false,
  },
  {
    id: "c40", name: "OKX", handle: "okx",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=okx",
    bio: "OKX official MCP server. Connect AI agents to spot, swap, futures, options & grid bots via the Model Context Protocol. 全球領先加密貨幣交易所.",
    subscribers: 5600, agentCount: 1,
    tags: ["crypto", "exchange", "mcp", "trading", "okx"], verified: false,
  },
  {
    id: "c41", name: "Alpaca Markets", handle: "alpacahq",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=alpaca",
    bio: "Official Alpaca MCP Server. Trade stocks, ETFs, crypto & options in plain English from your AI assistant. Commission-free API-first brokerage.",
    subscribers: 4300, agentCount: 1,
    tags: ["stocks", "trading", "mcp", "etf", "brokerage"], verified: false,
  },
  {
    id: "c42", name: "Datawhale 鲸", handle: "datawhale",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=datawhale",
    bio: "中國最大開源學習社群. 從零開始構建智能體. China's largest open-source learning community. Comprehensive AI agent tutorials and courses.",
    subscribers: 3200, agentCount: 1,
    tags: ["china", "education", "tutorials", "open-source", "community"], verified: false,
  },
  {
    id: "c43", name: "LangChain", handle: "langchain",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=langchain",
    bio: "Open Deep Research — a simple, configurable deep research agent that works across many model providers. On par with top commercial deep research agents.",
    subscribers: 9800, agentCount: 1,
    tags: ["research", "deep-research", "langchain", "open-source", "mcp"], verified: false,
  },
  {
    id: "c44", name: "Trading Floor Agent", handle: "tradingfloor",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=tradingfloor",
    bio: "Production-ready autonomous trading floor. 4 AI agents making autonomous trades powered by 6 MCP servers and 44 tools. Full trading automation.",
    subscribers: 1400, agentCount: 1,
    tags: ["trading", "multi-agent", "mcp", "autonomous", "finance"], verified: false,
  },
  {
    id: "c45", name: "Mike Chan HK", handle: "mikechanhk",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=mikechanhk",
    bio: "香港 AI 開發者. Building Mundus — free AI agents platform with AELM (Auto Execution Language Model). Making AI accessible to everyone.",
    subscribers: 680, agentCount: 1,
    tags: ["hong-kong", "free-ai", "agents", "platform", "aelm"], verified: false,
  },
  {
    id: "c46", name: "Qwen Agent 通義", handle: "qwenagent",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=qwen",
    bio: "阿里通義千問 Agent 框架. Official Qwen Agent framework by Alibaba. Tool usage, planning, memory management for LLM applications.",
    subscribers: 6700, agentCount: 1,
    tags: ["china", "alibaba", "qwen", "framework", "llm"], verified: false,
  },
  {
    id: "c47", name: "MetaGPT 深度求索", handle: "metagpt",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=metagpt",
    bio: "One requirement → full project. MetaGPT multi-agent framework outputs user stories, competitive analysis, APIs, and code. 44K+ stars.",
    subscribers: 7800, agentCount: 1,
    tags: ["china", "multi-agent", "code-gen", "deepwisdom", "framework"], verified: false,
  },
  {
    id: "c48", name: "RAGFlow", handle: "ragflow",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ragflow",
    bio: "Open-source RAG engine with agentic capabilities. Fuses cutting-edge RAG with agent tools for a superior context layer. 70K+ stars. 中文 AI 搜索.",
    subscribers: 5400, agentCount: 1,
    tags: ["rag", "search", "knowledge", "enterprise", "open-source"], verified: false,
  },
  {
    id: "c49", name: "LG AI Research", handle: "lgexaone",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=lgai",
    bio: "K-EXAONE: 236B MoE model by LG AI Research. Superior Korean & multilingual understanding. Tool calling & agentic capabilities. 한국어 AI 모델.",
    subscribers: 3600, agentCount: 1,
    tags: ["korea", "lg", "language-model", "multilingual", "agentic"], verified: false,
  },
  {
    id: "c50", name: "Binance MCP", handle: "binancemcp",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=binancemcp",
    bio: "Binance Futures trading via MCP. Real-time monitoring, trade management & risk control for AI agents. 幣安期貨 MCP 交易工具.",
    subscribers: 2100, agentCount: 1,
    tags: ["crypto", "binance", "futures", "mcp", "trading"], verified: false,
  },
  // --- Batch 3: ClawHub / OpenClaw skill creators ---
  {
    id: "c51", name: "Peter Steinberger", handle: "steipete",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=steipete",
    bio: "OpenClaw founder & ClawHub's most prolific creator. 20+ skills: Summarize, Notion, GitHub, Slack, Brave Search, Obsidian, Gemini CLI & more. 600K+ total downloads.",
    subscribers: 18500, agentCount: 8,
    tags: ["openclaw", "clawhub", "productivity", "automation", "founder"], verified: false,
  },
  {
    id: "c52", name: "pskoett", handle: "pskoett",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=pskoett",
    bio: "Creator of self-improving-agent — the #1 most downloaded skill on ClawHub (244K+). Continuous learning & error correction for AI agents.",
    subscribers: 8200, agentCount: 1,
    tags: ["clawhub", "self-improving", "memory", "learning", "agents"], verified: false,
  },
  {
    id: "c53", name: "Seth Rose", handle: "thesethrose",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sethrose",
    bio: "Creator of Agent Browser — fast Rust-based headless browser automation for AI agents. 143K+ downloads on ClawHub. Node.js fallback included.",
    subscribers: 5400, agentCount: 1,
    tags: ["clawhub", "browser", "automation", "rust", "headless"], verified: false,
  },
  {
    id: "c54", name: "Byungkyu", handle: "byungkyu",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=byungkyu",
    bio: "API Gateway for AI agents — connect to 100+ APIs (Google, Microsoft 365, GitHub, Slack, Airtable) with managed OAuth. Gmail & YouTube integrations.",
    subscribers: 4800, agentCount: 3,
    tags: ["clawhub", "api", "oauth", "integration", "gateway"], verified: false,
  },
  {
    id: "c55", name: "Jim Liu 刘星海", handle: "jimliuxinghai",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=jimliu",
    bio: "中文 AI 開發者. Creator of Find Skills — helps AI agents discover & install new capabilities. 232K+ downloads. 技能發現工具.",
    subscribers: 6100, agentCount: 1,
    tags: ["clawhub", "chinese", "skill-discovery", "meta-tool"], verified: false,
  },
  {
    id: "c56", name: "Jacky 七号", handle: "jacky1n7",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=jacky1n7",
    bio: "中文開發者. Tavily 搜索 — AI-optimized web search for Chinese & global content. 39.7K downloads on ClawHub.",
    subscribers: 2300, agentCount: 1,
    tags: ["clawhub", "chinese", "search", "tavily", "web"], verified: false,
  },
  {
    id: "c57", name: "ide-rea", handle: "iderea",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=iderea",
    bio: "百度 AI 搜索工具. Baidu Web Search for AI agents — search the Chinese internet via Baidu AI Search Engine. 48K+ downloads.",
    subscribers: 2800, agentCount: 1,
    tags: ["clawhub", "chinese", "baidu", "search", "china"], verified: false,
  },
  {
    id: "c58", name: "杨君 gpyAngyoujun", handle: "gpyangyoujun",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=yangjun",
    bio: "多搜索引擎集成. Multi Search Engine with 17 engines (8 Chinese + 9 global). 百度、微信、知乎、Google、Bing & more.",
    subscribers: 1600, agentCount: 1,
    tags: ["clawhub", "chinese", "multi-search", "baidu", "zhihu"], verified: false,
  },
  {
    id: "c59", name: "Borye", handle: "borye",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=borye",
    bio: "小紅書自動化. Xiaohongshu (RedNote) automation for AI agents — content operations, posting & analytics on China's top lifestyle platform.",
    subscribers: 1900, agentCount: 1,
    tags: ["clawhub", "chinese", "xiaohongshu", "rednote", "social"], verified: false,
  },
  {
    id: "c60", name: "autogame-17", handle: "autogame17",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=autogame",
    bio: "Self-evolution engine for AI agents. Evolver analyzes runtime history to identify improvements. 26K+ downloads. Also: Feishu/飛書 integration.",
    subscribers: 3100, agentCount: 2,
    tags: ["clawhub", "evolution", "self-improving", "feishu", "agents"], verified: false,
  },
  {
    id: "c61", name: "fly0pants", handle: "fly0pants",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=fly0pants",
    bio: "廣告情報 AI. AdMapix — ad intelligence & app analytics assistant. Search ad creatives, analyze competitors, track app performance.",
    subscribers: 1200, agentCount: 1,
    tags: ["clawhub", "advertising", "analytics", "chinese", "intelligence"], verified: false,
  },
  {
    id: "c62", name: "gzlicanyi", handle: "gzlicanyi",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=gzlicanyi",
    bio: "IMAP/SMTP email agent for AI. Read, send & manage emails programmatically. 25K+ downloads on ClawHub. Works with any email provider.",
    subscribers: 1700, agentCount: 1,
    tags: ["clawhub", "email", "imap", "smtp", "automation"], verified: false,
  },
  {
    id: "c63", name: "Asleep123", handle: "asleep123",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=asleep123",
    bio: "CalDAV Calendar sync for AI agents. Works with iCloud, Google Calendar, Fastmail, Nextcloud. Featured on ClawHub homepage.",
    subscribers: 1400, agentCount: 1,
    tags: ["clawhub", "calendar", "caldav", "icloud", "sync"], verified: false,
  },
  {
    id: "c64", name: "Rhys Sullivan", handle: "rhyssullivan",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=rhys",
    bio: "Answer Overflow — search indexed Discord community discussions. Turn Discord knowledge into searchable AI context. Featured on ClawHub.",
    subscribers: 1500, agentCount: 1,
    tags: ["clawhub", "discord", "search", "community", "knowledge"], verified: false,
  },
  {
    id: "c65", name: "Spiceman161", handle: "spiceman161",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=spiceman",
    bio: "Playwright MCP for AI agent browser automation. Full browser control on Linux/macOS/Windows. 23.4K+ downloads on ClawHub.",
    subscribers: 2000, agentCount: 1,
    tags: ["clawhub", "playwright", "browser", "mcp", "testing"], verified: false,
  },
  {
    id: "c66", name: "udiedrichsen", handle: "udiedrichsen",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=udiedrichsen",
    bio: "Stock Analysis skill for AI agents. Analyze stocks & crypto using Yahoo Finance data. Technical indicators, financials & charting.",
    subscribers: 1100, agentCount: 1,
    tags: ["clawhub", "stocks", "finance", "yahoo-finance", "analysis"], verified: false,
  },
  {
    id: "c67", name: "guogang1024 郭刚", handle: "guogang1024",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=guogang",
    bio: "中文開發者. Session Logs — search & analyze your AI agent's session history. Debug, learn, and improve agent behavior over time.",
    subscribers: 890, agentCount: 1,
    tags: ["clawhub", "chinese", "logging", "debug", "analytics"], verified: false,
  },
  {
    id: "c68", name: "Ivan G. Dávila", handle: "ivangdavila",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ivangdavila",
    bio: "Self-Improving + Proactive Agent combo. Self-reflection, self-criticism, self-learning. Also: Word/DOCX creation skill. Cross-platform.",
    subscribers: 1300, agentCount: 2,
    tags: ["clawhub", "self-improving", "proactive", "docx", "agents"], verified: false,
  },
  // --- Batch 4: Smithery, Composio & MCP ecosystem ---
  {
    id: "c69", name: "zwldarren 趙偉倫", handle: "zwldarren",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=zwldarren",
    bio: "AKShare One MCP Server — real-time Chinese A-share & HK stock data, historical prices, financial news. 5.4K installs on Smithery.",
    subscribers: 3200, agentCount: 1,
    tags: ["smithery", "chinese", "stocks", "a-shares", "hong-kong", "finance"], verified: false,
  },
  {
    id: "c70", name: "xinkuang 辛匡", handle: "xinkuang",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=xinkuang",
    bio: "China Stock Insights MCP — A-shares + Hong Kong stock market data, sector analysis, and financial reports for AI agents.",
    subscribers: 1800, agentCount: 1,
    tags: ["smithery", "chinese", "hong-kong", "a-shares", "stocks"], verified: false,
  },
  {
    id: "c71", name: "spyfree 命理先生", handle: "spyfree",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=spyfree",
    bio: "紫微斗數 & 八字命理 MCP Server. Traditional Chinese astrology: Ziwei Doushu and Bazi charts computed by AI. 2.5K installs on Smithery.",
    subscribers: 2800, agentCount: 1,
    tags: ["smithery", "chinese", "astrology", "bazi", "ziwei", "metaphysics"], verified: false,
  },
  {
    id: "c72", name: "wangtsiao 王超", handle: "wangtsiao",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=wangtsiao",
    bio: "Pulse CN MCP — real-time trending content from Chinese internet. Monitor Weibo hot topics, Zhihu trending, Douyin, Bilibili. 1.2K installs.",
    subscribers: 2100, agentCount: 1,
    tags: ["smithery", "chinese", "trending", "weibo", "zhihu", "social-media"], verified: false,
  },
  {
    id: "c73", name: "marcusbai 白一鸣", handle: "marcusbai",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=marcusbai",
    bio: "彩云天气 Caiyun Weather MCP — real-time Chinese city weather data and forecasts for AI agents. Minute-level precipitation alerts.",
    subscribers: 1400, agentCount: 1,
    tags: ["smithery", "chinese", "weather", "caiyun", "forecast"], verified: false,
  },
  {
    id: "c74", name: "SinoCheck 天眼查", handle: "sinocheck",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sinocheck",
    bio: "China Business Registry MCP — AI access to Chinese company registration data. Verify businesses, check legal status, find shareholders.",
    subscribers: 1600, agentCount: 1,
    tags: ["smithery", "chinese", "business", "registry", "compliance"], verified: false,
  },
  {
    id: "c75", name: "KIS OpenAPI 한국투자", handle: "kisopenapi",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kisopenapi",
    bio: "한국투자증권 코딩도우미 MCP — Korean Investment & Securities coding assistant. Trade Korean stocks via AI. 8.5K installs.",
    subscribers: 4500, agentCount: 1,
    tags: ["smithery", "korean", "stocks", "trading", "korea-investment"], verified: false,
  },
  {
    id: "c76", name: "ragalgo 래갈고", handle: "ragalgo",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ragalgo",
    bio: "Korea market news, sentiment analysis, daily snapshots, and stock analysis MCP server. 한국 주식 시장 AI 분석. 2.8K installs.",
    subscribers: 2400, agentCount: 1,
    tags: ["smithery", "korean", "stocks", "sentiment", "news"], verified: false,
  },
  {
    id: "c77", name: "koreafintech 코리아핀테크", handle: "koreafintech",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=koreafintech",
    bio: "Korean Crypto MCP — real-time data from Korean exchanges: Upbit, Bithumb, Coinone. Kim Premium tracker, KRW pairs.",
    subscribers: 1900, agentCount: 1,
    tags: ["smithery", "korean", "crypto", "upbit", "bithumb"], verified: false,
  },
  {
    id: "c78", name: "kennyckk 陳建國", handle: "kennyckk",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kennyckk",
    bio: "Hong Kong KMB/LWB Bus MCP — real-time bus arrival info for HK's largest bus network. 2.5K installs. 🚌 香港巴士到站時間.",
    subscribers: 2200, agentCount: 1,
    tags: ["smithery", "hong-kong", "transit", "bus", "kmb", "real-time"], verified: false,
  },
  {
    id: "c79", name: "MCP-Foundry 대한민국", handle: "mcpfoundry",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=mcpfoundry",
    bio: "부동산 실거래 조회 MCP — Korean real estate transaction data. 아파트, 오피스텔, 다세대 실거래가. 서울/경기 property prices.",
    subscribers: 1100, agentCount: 1,
    tags: ["smithery", "korean", "real-estate", "property", "seoul"], verified: false,
  },
  {
    id: "c80", name: "pjookim 김평주", handle: "pjookim",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=pjookim",
    bio: "Korea Tour MCP — travel & tourism information server. 한국 관광 정보. Hotels, attractions, events. 881 installs on Smithery.",
    subscribers: 900, agentCount: 1,
    tags: ["smithery", "korean", "travel", "tourism", "korea-tour"], verified: false,
  },
  {
    id: "c81", name: "hithereiamaliff", handle: "hithereiamaliff",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=hithereiamaliff",
    bio: "Southeast Asia transit & maps: Malaysia Transit (12 providers) + GrabMaps (8 SEA countries). 🇲🇾🇸🇬🇹🇭🇮🇩",
    subscribers: 1500, agentCount: 2,
    tags: ["smithery", "malaysia", "southeast-asia", "transit", "grab", "maps"], verified: false,
  },
  {
    id: "c82", name: "seahbk1006 Boon Keong", handle: "seahbk1006",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=seahbk1006",
    bio: "Bank Negara Malaysia Open Data MCP — Malaysian central bank economic data, exchange rates, interest rates. 1.7K installs.",
    subscribers: 1200, agentCount: 1,
    tags: ["smithery", "malaysia", "finance", "central-bank", "open-data"], verified: false,
  },
  {
    id: "c83", name: "Exa", handle: "exa",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=exa",
    bio: "Exa Search MCP — fast semantic web search + crawling for AI agents. Exa-code for dev context. 39K installs. Top 3 on Smithery.",
    subscribers: 12000, agentCount: 1,
    tags: ["smithery", "search", "web", "semantic", "crawling", "developer"], verified: true,
  },
  {
    id: "c84", name: "Context7 by Upstash", handle: "context7",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=context7",
    bio: "Version-specific documentation and code examples injected into AI prompts. 14K installs. Never get outdated API advice again.",
    subscribers: 8500, agentCount: 1,
    tags: ["smithery", "developer", "documentation", "code", "upstash"], verified: true,
  },
  {
    id: "c85", name: "Polymarket MCP", handle: "polymarket",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=polymarket",
    bio: "Prediction markets MCP — query Polymarket by tags, volume, liquidity. Track elections, sports, crypto predictions. 5K installs.",
    subscribers: 3800, agentCount: 1,
    tags: ["smithery", "prediction-markets", "polymarket", "trading", "elections"], verified: false,
  },
  {
    id: "c86", name: "ta-mcp", handle: "tamcp",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=tamcp",
    bio: "AI-powered technical analysis for stocks, crypto, and Indian markets. RSI, MACD, Bollinger Bands, support/resistance. 2.5K installs.",
    subscribers: 2000, agentCount: 1,
    tags: ["smithery", "trading", "technical-analysis", "india", "crypto"], verified: false,
  },
  {
    id: "c87", name: "Financial Modeling Prep", handle: "cfocoder",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=cfocoder",
    bio: "Comprehensive market data MCP: stocks, ETFs, crypto, forex. Financial statements, earnings, DCF models. 3.1K installs.",
    subscribers: 2800, agentCount: 1,
    tags: ["smithery", "finance", "stocks", "etf", "forex", "fundamentals"], verified: false,
  },
  {
    id: "c88", name: "AgentMail", handle: "agentmail",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=agentmail",
    bio: "Email inboxes purpose-built for AI agents. Send, receive, parse emails programmatically. 9.6K installs on Smithery.",
    subscribers: 5200, agentCount: 1,
    tags: ["smithery", "email", "agents", "communication", "inbox"], verified: false,
  },
  // ─── Batch 5 ──────────────────────────────────────────────────
  {
    id: "c89", name: "CyberAgent AI Lab", handle: "CyberAgentAILab",
    avatar: "https://github.com/CyberAgentAILab.png",
    bio: "Research division of CyberAgent Inc. (Japan), building generative AI models for layout generation, NLP, and multimodal advertising applications. Based in Tokyo.",
    subscribers: 8900, agentCount: 2,
    tags: ["japanese", "generative-ai", "nlp", "layout-generation", "advertising"], verified: true,
  },
  {
    id: "c90", name: "Tokyo Tech LLM Team", handle: "tokyotech-llm",
    avatar: "https://github.com/tokyotech-llm.png",
    bio: "Academic team from Institute of Science Tokyo (formerly Tokyo Tech), Okazaki Lab and Yokota Lab, building open Japanese LLMs with 2.4M+ model downloads.",
    subscribers: 12400, agentCount: 1,
    tags: ["japanese", "llm", "academic", "open-source", "continual-pretraining"], verified: true,
  },
  {
    id: "c91", name: "llm-jp (NII Japan)", handle: "llm-jp",
    avatar: "https://github.com/llm-jp.png",
    bio: "Japanese NLP consortium led by the National Institute of Informatics (NII), building open-source Japanese LLMs, evaluation frameworks, and multilingual tools.",
    subscribers: 7200, agentCount: 2,
    tags: ["japanese", "llm", "nii", "nlp", "evaluation", "academic"], verified: true,
  },
  {
    id: "c92", name: "Rinna Co., Ltd.", handle: "rinnakk",
    avatar: "https://github.com/rinnakk.png",
    bio: "Japanese AI company (Tokyo) specializing in Japanese-language generative models including LLMs, Stable Diffusion, CLIP, and speech recognition. 4.5M+ downloads.",
    subscribers: 14200, agentCount: 2,
    tags: ["japanese", "generative-ai", "stable-diffusion", "speech", "multimodal"], verified: true,
  },
  {
    id: "c93", name: "Kan (DataScienceWorld)", handle: "datascienceworld-kan",
    avatar: "https://github.com/datascienceworld-kan.png",
    bio: "AI Solution Architect at FPT Software, Vietnam. Builder of VinAgent — an open-source agentic AI library for Southeast Asian developers.",
    subscribers: 1800, agentCount: 1,
    tags: ["vietnamese", "southeast-asian", "ai-agent", "fpt-software", "agentic-ai"], verified: false,
  },
  {
    id: "c94", name: "AI Singapore (AISG)", handle: "aisingapore",
    avatar: "https://github.com/aisingapore.png",
    bio: "National AI program of Singapore, building open-source tools, frameworks, and AI practitioner resources for Singapore's AI ecosystem.",
    subscribers: 6300, agentCount: 1,
    tags: ["singapore", "southeast-asian", "national-ai", "government", "open-source"], verified: true,
  },
  {
    id: "c95", name: "Yinghao Zhu", handle: "yhzhu99",
    avatar: "https://github.com/yhzhu99.png",
    bio: "PhD student at The University of Hong Kong researching AI for Healthcare. Focuses on clinical decision-making, EHR analysis, and multi-agent medical AI.",
    subscribers: 2100, agentCount: 1,
    tags: ["healthcare", "medical-ai", "hku", "ehr", "multi-agent", "chinese"], verified: false,
  },
  {
    id: "c96", name: "Srujan P R", handle: "SrujanPR",
    avatar: "https://github.com/SrujanPR.png",
    bio: "Information Science Engineering student (India) focused on healthcare AI. Builder of open-source medical diagnostic tools for underserved communities.",
    subscribers: 890, agentCount: 1,
    tags: ["healthcare", "medical-ai", "india", "diagnostic", "student-developer"], verified: false,
  },
  {
    id: "c97", name: "HKUDS Data Intelligence Lab", handle: "HKUDS",
    avatar: "https://github.com/HKUDS.png",
    bio: "Data Intelligence Lab at The University of Hong Kong, building AI agents for education, research automation, and video understanding.",
    subscribers: 4700, agentCount: 1,
    tags: ["education", "hku", "hong-kong", "research-ai", "multi-agent"], verified: true,
  },
  {
    id: "c98", name: "GeminiLight", handle: "GeminiLight",
    avatar: "https://github.com/GeminiLight.png",
    bio: "Researcher focused on AI for education and intelligent tutoring systems. Author of an LLM-powered multi-agent framework (WWW 2025 Oral).",
    subscribers: 3200, agentCount: 1,
    tags: ["education", "llm", "tutoring", "research", "www-2025"], verified: false,
  },
  {
    id: "c99", name: "Gabriel (gabotechs)", handle: "gabotechs",
    avatar: "https://github.com/gabotechs.png",
    bio: "Apache DataFusion committer from Madrid. Creator of MusicGPT — a cross-platform app for local music generation — and dep-tree for visualizing codebase complexity.",
    subscribers: 5600, agentCount: 1,
    tags: ["creative-ai", "music-generation", "rust", "apache", "spain"], verified: false,
  },
  {
    id: "c100", name: "Jan Van Wassenhove", handle: "janvanwassenhove",
    avatar: "https://github.com/janvanwassenhove.png",
    bio: "Developer and musician building multi-agent AI music composition systems. Creator of MusicAgent — composes full songs using Sonic Pi and generative AI.",
    subscribers: 1400, agentCount: 1,
    tags: ["creative-ai", "music-composition", "multi-agent", "sonic-pi", "belgium"], verified: false,
  },
  {
    id: "c101", name: "Qodo AI", handle: "qodo-ai",
    avatar: "https://github.com/qodo-ai.png",
    bio: "Israeli AI company building open-source code quality and review agents. Creators of PR-Agent — the most widely adopted open-source AI code review tool.",
    subscribers: 11500, agentCount: 1,
    tags: ["developer-productivity", "code-review", "open-source", "github", "devops"], verified: true,
  },
  {
    id: "c102", name: "OpenBMB Team", handle: "OpenBMB",
    avatar: "https://github.com/OpenBMB.png",
    bio: "Open-source AI research team from Tsinghua University's BMI Lab, building LLM-powered developer agents for documentation and autonomous task execution.",
    subscribers: 7800, agentCount: 1,
    tags: ["developer-productivity", "documentation", "chinese", "tsinghua", "llm-agent"], verified: true,
  },
  {
    id: "c103", name: "Upsidelab", handle: "upsidelab",
    avatar: "https://github.com/upsidelab.png",
    bio: "Software consultancy building open-source AI for e-commerce. Creators of Enthusiast — connecting LLMs to Shopify, Medusa, Shopware, and Solidus.",
    subscribers: 3400, agentCount: 1,
    tags: ["e-commerce", "retail-ai", "agentic-ai", "open-source", "shopify"], verified: false,
  },
  {
    id: "c104", name: "William Nguyen", handle: "nguyennm1024",
    avatar: "https://github.com/nguyennm1024.png",
    bio: "Vietnamese AI Scientist at Aitomatic (SF). Creator of SemiKong (first open-source semiconductor LLM) and ProSEA (93.2% on FinanceBench). 9 papers at CVPR, NAACL, AAAI.",
    subscribers: 6100, agentCount: 2,
    tags: ["vietnamese", "domain-llm", "semiconductor", "maritime", "multi-agent"], verified: true,
  },
  {
    id: "c105", name: "Pfnet Research", handle: "pfnet-research",
    avatar: "https://github.com/pfnet-research.png",
    bio: "Research division of Preferred Networks — Japan's leading AI company. Focus on Japanese NLP, finance AI, and open evaluation frameworks.",
    subscribers: 9200, agentCount: 1,
    tags: ["japanese", "finance-ai", "nlp", "evaluation", "preferred-networks"], verified: true,
  },
  {
    id: "c106", name: "Yohey Watanabe", handle: "yohey-w",
    avatar: "https://github.com/yohey-w.png",
    bio: "Japanese developer building creative multi-agent developer tools. Creator of multi-agent-shogun — samurai-inspired orchestration for AI coding agents.",
    subscribers: 2600, agentCount: 1,
    tags: ["japanese", "developer-productivity", "multi-agent", "coding-agent", "creative"], verified: false,
  },
  {
    id: "c107", name: "Langgenius (Dify)", handle: "langgenius",
    avatar: "https://github.com/langgenius.png",
    bio: "Chinese team behind Dify, a production-ready open-source platform for agentic AI workflow development with 125k+ GitHub stars.",
    subscribers: 23193, agentCount: 1,
    tags: ["chinese", "workflow", "RAG", "LLMOps", "agentic"], verified: false,
  },
  {
    id: "c108", name: "InfiniFlow", handle: "infiniflow",
    avatar: "https://github.com/infiniflow.png",
    bio: "Chinese company (co-founded by Yingfeng Zhang) building RAGFlow, a deep-document-understanding RAG engine with 71k+ stars. Recognized by GitHub Octoverse 2025 as one of the fastest-growing projects.",
    subscribers: 24555, agentCount: 1,
    tags: ["chinese", "RAG", "document-parsing", "enterprise"], verified: false,
  },
  {
    id: "c109", name: "FoundationAgents (DeepWisdom)", handle: "FoundationAgents",
    avatar: "https://github.com/FoundationAgents.png",
    bio: "Chinese AI company (Alexander Wu / DeepWisdom) behind MetaGPT — a multi-agent framework that assigns software company roles (PM, architect, engineer) to GPTs. 60k+ stars. Also created OpenManus.",
    subscribers: 18069, agentCount: 1,
    tags: ["chinese", "multi-agent", "software-engineering", "SOP"], verified: false,
  },
  {
    id: "c110", name: "CAMEL-AI", handle: "camel-ai",
    avatar: "https://github.com/camel-ai.png",
    bio: "Open-source AI research community (led by Guohao Li and team, Chinese researchers) dedicated to finding the scaling laws of multi-agent systems. Built CAMEL framework and OWL.",
    subscribers: 12990, agentCount: 2,
    tags: ["chinese", "multi-agent", "research", "open-source"], verified: false,
  },
  {
    id: "c111", name: "ByteDance", handle: "bytedance",
    avatar: "https://github.com/bytedance.png",
    bio: "Chinese tech giant (ByteDance / TikTok parent) with active open-source AI tools including DeerFlow deep research agent and FlowGram workflow framework.",
    subscribers: 5769, agentCount: 2,
    tags: ["chinese", "deep-research", "workflow", "enterprise"], verified: false,
  },
  {
    id: "c112", name: "Coze Dev (ByteDance Coze Team)", handle: "coze-dev",
    avatar: "https://github.com/coze-dev.png",
    bio: "ByteDance open-source team behind the Coze AI agent platform. Open-sourced Coze Studio (all-in-one AI agent dev tool) and Coze Loop (agent optimization platform) in 2025.",
    subscribers: 12709, agentCount: 2,
    tags: ["chinese", "agent-platform", "visual", "LLMOps"], verified: false,
  },
  {
    id: "c113", name: "QwenLM (Alibaba Cloud)", handle: "QwenLM",
    avatar: "https://github.com/QwenLM.png",
    bio: "Alibaba Cloud's Qwen team — builders of the Qwen large language model series and Qwen-Agent framework for AI coding agents and tool-use applications.",
    subscribers: 1849, agentCount: 2,
    tags: ["chinese", "alibaba", "coding-agent", "LLM", "MCP"], verified: false,
  },
  {
    id: "c114", name: "Jina AI (Han Xiao)", handle: "jina-ai",
    avatar: "https://github.com/jina-ai.png",
    bio: "Han Xiao (肖涵), Chinese founder of Jina AI (acquired by Elastic 2025). Built leading AI search infrastructure tools including Reader API and node-DeepResearch.",
    subscribers: 4675, agentCount: 2,
    tags: ["chinese", "search", "embeddings", "deep-research", "API"], verified: false,
  },
  {
    id: "c115", name: "LobeHub", handle: "lobehub",
    avatar: "https://github.com/lobehub.png",
    bio: "Chinese open-source team (arvinxx, canisminor1990) building LobeChat — a modern AI agent workspace supporting 40+ LLM providers, knowledge base, and one-click MCP marketplace.",
    subscribers: 15403, agentCount: 1,
    tags: ["chinese", "AI-chat", "agent-workspace", "MCP", "knowledge-base"], verified: false,
  },
  {
    id: "c116", name: "labring (FastGPT team)", handle: "labring",
    avatar: "https://github.com/labring.png",
    bio: "Chinese open-source team (c121914yu as lead maintainer) building FastGPT — a knowledge-based LLM platform with RAG retrieval and visual AI workflow orchestration.",
    subscribers: 7169, agentCount: 1,
    tags: ["chinese", "RAG", "knowledge-base", "workflow", "QA"], verified: false,
  },
  {
    id: "c117", name: "eosphoros-ai (DB-GPT / Ant Group)", handle: "eosphoros-ai",
    avatar: "https://github.com/eosphoros-ai.png",
    bio: "Chinese open-source org led by csunny (magic.chen, @antgroup) building DB-GPT — an AI-native data app development framework with AWEL agentic workflow language and multi-agent support.",
    subscribers: 6183, agentCount: 1,
    tags: ["chinese", "data-apps", "Text2SQL", "RAG", "multi-agent"], verified: false,
  },
  {
    id: "c118", name: "agentUniverse-ai (Ant Group)", handle: "agentuniverse-ai",
    avatar: "https://github.com/agentuniverse-ai.png",
    bio: "Ant Group's open-source LLM multi-agent framework team. agentUniverse originates from real-world financial practices at Ant Group and supports domain-expert-level intelligent agents.",
    subscribers: 3242, agentCount: 1,
    tags: ["chinese", "ant-group", "multi-agent", "finance", "enterprise"], verified: false,
  },
  {
    id: "c119", name: "TaskingAI", handle: "TaskingAI",
    avatar: "https://github.com/TaskingAI.png",
    bio: "Chinese-founded (US-registered) LLMOps startup building TaskingAI — a BaaS platform for LLM-based agent development unifying hundreds of models with RAG, tools, and assistant management.",
    subscribers: 2648, agentCount: 1,
    tags: ["chinese", "BaaS", "LLMOps", "RAG", "agent-deployment"], verified: false,
  },
  {
    id: "c120", name: "RockChinQ (Junyan Qin)", handle: "RockChinQ",
    avatar: "https://github.com/RockChinQ.png",
    bio: "Junyan Qin (秦俊彦), Chinese developer from Guilin, China. Founded LangBot — a production-grade open-source platform connecting LLMs to 10+ messaging platforms (QQ, WeChat, Telegram, Discord, Slack, etc.",
    subscribers: 11680, agentCount: 1,
    tags: ["chinese", "chatbot", "messaging", "LLM-integration", "multi-platform"], verified: false,
  },
  {
    id: "c121", name: "Kim Yeon-gyu (code-yeongyu)", handle: "code-yeongyu",
    avatar: "https://github.com/code-yeongyu.png",
    bio: "Korean AI agent engineer at Sionic AI (formerly Indent Corp). Created oh-my-openagent (formerly oh-my-opencode) — a multi-model orchestration harness that earned 41k+ stars and disrupted the AI coding",
    subscribers: 11251, agentCount: 1,
    tags: ["korean", "coding-agent", "orchestration", "multi-model", "CLI"], verified: false,
  },
  {
    id: "c122", name: "All-Hands AI (OpenHands)", handle: "All-Hands-AI",
    avatar: "https://github.com/All-Hands-AI.png",
    bio: "Open-source AI software development agent team. Co-founded with key contribution from Chinese-origin researchers including Lin Junyang (ex-Alibaba Qwen lead). OpenHands has 60k+ stars.",
    subscribers: 30206, agentCount: 1,
    tags: ["global", "coding-agent", "software-development", "autonomous"], verified: false,
  },
  {
    id: "c123", name: "mem0ai", handle: "mem0ai",
    avatar: "https://github.com/mem0ai.png",
    bio: "US-based team (with Indian founders) building Mem0 — the universal intelligent memory layer for AI agents and assistants, enabling personalized long-term memory across sessions.",
    subscribers: 11505, agentCount: 1,
    tags: ["global", "memory", "personalization", "AI-assistants", "RAG"], verified: false,
  },
  {
    id: "c124", name: "browser-use", handle: "browser-use",
    avatar: "https://github.com/browser-use.png",
    bio: "International open-source team building the browser-use library — the leading AI browser automation framework that makes websites accessible for AI agents.",
    subscribers: 15003, agentCount: 1,
    tags: ["global", "browser-automation", "web-agent", "GUI"], verified: false,
  },
  {
    id: "c125", name: "unclecode (Crawl4AI)", handle: "unclecode",
    avatar: "https://github.com/unclecode.png",
    bio: "Developer behind Crawl4AI — an open-source LLM-friendly web crawler and content extractor with 50k+ stars, used to turn the web into clean Markdown for RAG and AI pipelines.",
    subscribers: 9191, agentCount: 1,
    tags: ["global", "web-crawling", "RAG", "data-pipeline", "LLM-prep"], verified: false,
  },
  {
    id: "c126", name: "openinterpreter", handle: "openinterpreter",
    avatar: "https://github.com/openinterpreter.png",
    bio: "International team building Open Interpreter — a natural language interface for computers letting LLMs run Python, JavaScript, Shell and more locally. 60k+ stars.",
    subscribers: 19978, agentCount: 1,
    tags: ["global", "code-execution", "natural-language", "computer-control"], verified: false,
  },
  {
    id: "c127", name: "FlowiseAI", handle: "FlowiseAI",
    avatar: "https://github.com/FlowiseAI.png",
    bio: "Singapore-based open-source team building Flowise — a drag-and-drop low-code platform for building customized LLM workflows, AI agents, and RAG applications.",
    subscribers: 14178, agentCount: 1,
    tags: ["singapore", "low-code", "LLM-workflow", "RAG", "visual"], verified: false,
  },
  {
    id: "c128", name: "UpstageAI", handle: "UpstageAI",
    avatar: "https://github.com/UpstageAI.png",
    bio: "Korean AI company (Seoul) building enterprise Solar LLM and document AI tools. Notable for Solar Pro, document parsing APIs, and open MCP server for AI-native document processing workflows.",
    subscribers: 1617, agentCount: 1,
    tags: ["korean", "LLM", "document-AI", "enterprise", "MCP"], verified: false,
  },
  {
    id: "c129", name: "elizaOS", handle: "elizaOS",
    avatar: "https://github.com/elizaOS.png",
    bio: "Open-source multi-agent AI framework accelerating the convergence of humans and autonomous agents. Powers Web3 trading, DeFi, and on-chain interactions.",
    subscribers: 11091, agentCount: 1,
    tags: ["DeFi", "AI-Agents", "Multi-Agent", "Web3", "Solana"], verified: false,
  },
  {
    id: "c130", name: "SendAI (sendaifun)", handle: "sendaifun",
    avatar: "https://github.com/sendaifun.png",
    bio: "Accelerating the Solana AI ecosystem. Tooling layer for AI agents on Solana — connects any agent model to 60+ Solana DeFi protocols.",
    subscribers: 3426, agentCount: 1,
    tags: ["Solana", "DeFi", "AI-Agents", "Web3-Toolkit", "Blockchain"], verified: false,
  },
  {
    id: "c131", name: "Freqtrade", handle: "freqtrade",
    avatar: "https://github.com/freqtrade.png",
    bio: "Free, open source crypto trading bot with AI/ML strategy optimization via FreqAI. Supports all major exchanges via Telegram or web UI.",
    subscribers: 8462, agentCount: 1,
    tags: ["Crypto-Trading", "Trading-Bot", "FreqAI", "Backtesting", "ML"], verified: false,
  },
  {
    id: "c132", name: "Hummingbot Foundation", handle: "hummingbot",
    avatar: "https://github.com/hummingbot.png",
    bio: "Democratizing HFT with open source software. Hummingbot enables automated market making and algorithmic trading on 100+ CEX and DEX venues.",
    subscribers: 14271, agentCount: 1,
    tags: ["HFT", "Market-Making", "DeFi", "Algorithmic-Trading", "DEX"], verified: false,
  },
  {
    id: "c133", name: "Flashbots", handle: "flashbots",
    avatar: "https://github.com/flashbots.png",
    bio: "R&D org mitigating negative externalities of MEV on Ethereum. Builds transparent, democratic, and sustainable MEV infrastructure.",
    subscribers: 1574, agentCount: 2,
    tags: ["MEV", "Ethereum", "Searcher", "Arbitrage", "Block-Building"], verified: false,
  },
  {
    id: "c134", name: "Crytic (Trail of Bits)", handle: "crytic",
    avatar: "https://github.com/crytic.png",
    bio: "Blockchain security group by Trail of Bits. Builds Slither (static analyzer), Echidna (fuzzer), and other auditing tools for Solidity smart contracts.",
    subscribers: 2713, agentCount: 1,
    tags: ["Smart-Contract-Security", "Static-Analysis", "Auditing", "Solidity", "Ethereum"], verified: false,
  },
  {
    id: "c135", name: "Cyfrin", handle: "Cyfrin",
    avatar: "https://github.com/Cyfrin.png",
    bio: "World-class smart contract audits, tools, and education. US-based Web3 security firm behind Aderyn, CodeHawks, Solodit, and Cyfrin Updraft.",
    subscribers: 782, agentCount: 1,
    tags: ["Smart-Contract-Audit", "Security", "Solidity", "Web3-Education", "Rust"], verified: false,
  },
  {
    id: "c136", name: "MetaTrust Labs", handle: "MetaTrustLabs",
    avatar: "https://github.com/MetaTrustLabs.png",
    bio: "Singapore-based AI-driven Web3 security company incubated at Nanyang Technological University. Creators of GPTScan and Falcon smart contract security tools.",
    subscribers: 1494, agentCount: 2,
    tags: ["Web3-Security", "AI-Audit", "Smart-Contracts", "Singapore", "LLM"], verified: false,
  },
  {
    id: "c137", name: "Fetch.ai", handle: "fetchai",
    avatar: "https://github.com/fetchai.png",
    bio: "AI-empowered platform connecting services and APIs via autonomous agents. Builders of the ASI Alliance and Agentverse — decentralized AI agent economy.",
    subscribers: 2967, agentCount: 1,
    tags: ["AI-Agents", "Blockchain", "Autonomous-Agents", "Multi-Agent", "Decentralized"], verified: false,
  },
  {
    id: "c138", name: "Skip-MEV / Cosmos Labs", handle: "skip-mev",
    avatar: "https://github.com/skip-mev.png",
    bio: "Powering the sovereign software revolution on Cosmos. Builds MEV infrastructure and cross-chain tools for the Interchain ecosystem.",
    subscribers: 1380, agentCount: 1,
    tags: ["MEV", "Cosmos", "Cross-Chain", "Interchain", "Arbitrage"], verified: false,
  },
  {
    id: "c139", name: "RevokeCash", handle: "RevokeCash",
    avatar: "https://github.com/RevokeCash.png",
    bio: "Web3 wallet security tool letting users inspect and revoke token approvals. Essential DeFi security infrastructure with browser extension and multi-chain support.",
    subscribers: 1709, agentCount: 1,
    tags: ["Web3-Security", "Wallet-Safety", "Token-Approvals", "DeFi", "Ethereum"], verified: false,
  },
  {
    id: "c140", name: "NiceBerginc", handle: "niceberginc",
    avatar: "https://github.com/niceberginc.png",
    bio: "Python framework for connecting AI agents to any on-chain app on Solana. Supports 30+ protocols including Jupiter, Raydium, Metaplex, and DeFi tools.",
    subscribers: 1060, agentCount: 1,
    tags: ["Solana", "DeFi", "AI-Agents", "Python", "MCP"], verified: false,
  },
  {
    id: "c141", name: "DefiLlama", handle: "DefiLlama",
    avatar: "https://github.com/DefiLlama.png",
    bio: "Open-source DeFi TVL analytics platform. The most comprehensive blockchain data aggregator, tracking 3,000+ protocols across 200+ chains.",
    subscribers: 1926, agentCount: 1,
    tags: ["DeFi-Analytics", "Blockchain-Data", "TVL", "On-Chain-Data", "Open-Source"], verified: false,
  },
  {
    id: "c142", name: "Brian Knows", handle: "brian-knows",
    avatar: "https://github.com/brian-knows.png",
    bio: "Open and fair Web3 AI agent framework. Lets anyone build AI agents equipped with powerful on-chain skills to interact with DeFi protocols via natural language.",
    subscribers: 4475, agentCount: 2,
    tags: ["Web3-AI", "DeFi-Agent", "Intent-Based", "LangChain", "Multi-Agent"], verified: false,
  },
  {
    id: "c143", name: "Ambire Tech", handle: "AmbireTech",
    avatar: "https://github.com/AmbireTech.png",
    bio: "Web3 wallet security and DeFi portfolio company. Creators of AdEx AURA — an on-chain AI agent that analyzes wallet activity to recommend personalized DeFi actions.",
    subscribers: 1613, agentCount: 1,
    tags: ["Web3-Wallet", "DeFi", "AI-Agent", "Recommendations", "Account-Abstraction"], verified: false,
  },
  {
    id: "c144", name: "Ali Taslimi", handle: "alitaslimi",
    avatar: "https://github.com/alitaslimi.png",
    bio: "Blockchain data analyst and developer. Built cross-chain monitoring tools using Flipside Crypto data for tracking cross-chain bridge activity and volumes.",
    subscribers: 803, agentCount: 1,
    tags: ["Cross-Chain", "Bridge-Monitoring", "Blockchain-Data", "Analytics", "Streamlit"], verified: false,
  },
  {
    id: "c145", name: "AWS Samples", handle: "aws-samples",
    avatar: "https://github.com/aws-samples.png",
    bio: "Official AWS code samples organization. Publishes reference architectures including a Crypto AI Agent using Amazon Bedrock for on-chain analysis and transactions.",
    subscribers: 1229, agentCount: 1,
    tags: ["Cloud", "AI-Agents", "Blockchain", "Amazon-Bedrock", "Multi-Agent"], verified: false,
  },
  {
    id: "c146", name: "QuillHash", handle: "Quillhash",
    avatar: "https://github.com/Quillhash.png",
    bio: "Web3 security firm offering smart contract audits and security tools. Maintains a popular curated list of Web3 security tools covering wallet safety, static analysis, and more.",
    subscribers: 1284, agentCount: 1,
    tags: ["Web3-Security", "Smart-Contract-Audit", "Wallet-Safety", "DeFi-Security", "Blockchain"], verified: false,
  },
  {
    id: "c147", name: "DeFiPy Devs", handle: "defipy-devs",
    avatar: "https://github.com/defipy-devs.png",
    bio: "Open-source team building the first unified Python SDK for DeFi analytics, simulation, and autonomous agents with support for Uniswap, Balancer, and more.",
    subscribers: 658, agentCount: 1,
    tags: ["DeFi", "Python", "Analytics", "Simulation", "AI-Agents"], verified: false,
  },
  {
    id: "c148", name: "Shanzson", handle: "shanzson",
    avatar: "https://github.com/shanzson.png",
    bio: "Professional smart contract auditor. Maintains one of the most comprehensive public repositories of smart contract security tools, techniques, and resources for auditors.",
    subscribers: 985, agentCount: 1,
    tags: ["Smart-Contract-Audit", "Security-Research", "Solidity", "DeFi-Security", "Web3"], verified: false,
  },
  {
    id: "c149", name: "Nexis AI", handle: "Nexis-AI",
    avatar: "https://github.com/Nexis-AI.png",
    bio: "Builders of Nex-T1 — a multi-agent orchestration framework designed for autonomous DeFi trading with observer, planner, and executor agent roles.",
    subscribers: 939, agentCount: 1,
    tags: ["DeFi-Trading", "Multi-Agent", "Autonomous", "AI-Research", "Web3"], verified: false,
  },
  {
    id: "c150", name: "TheSenseAI", handle: "TheSenseAI",
    avatar: "https://github.com/TheSenseAI.png",
    bio: "AI-powered token analysis framework for Solana and Pump.fun ecosystems. Provides ML-based price prediction, whale tracking, and portfolio risk management agents.",
    subscribers: 1657, agentCount: 1,
    tags: ["Token-Analysis", "Solana", "AI-Analytics", "Portfolio-Management", "Pump.fun"], verified: false,
  },
  {
    id: "c151", name: "FogMeta", handle: "FogMeta",
    avatar: "https://github.com/FogMeta.png",
    bio: "Web3 AI infrastructure team building AI-powered social and blockchain agents for the Aptos ecosystem with on-chain data analysis and automated Twitter/X posting.",
    subscribers: 1883, agentCount: 1,
    tags: ["Web3-AI", "Aptos", "Blockchain-Agent", "Social-Media", "On-Chain-Data"], verified: false,
  },
  {
    id: "c152", name: "Vanna AI", handle: "vanna-ai",
    avatar: "https://github.com/vanna-ai.png",
    bio: "Creators of Vanna — an agentic text-to-SQL framework using retrieval-augmented generation to deliver accurate natural language database queries with enterprise security.",
    subscribers: 13212, agentCount: 1,
    tags: ["text-to-sql", "rag", "data-visualization", "sql-agent"], verified: false,
  },
  {
    id: "c153", name: "PandasAI (sinaptik-ai)", handle: "sinaptik-ai",
    avatar: "https://github.com/sinaptik-ai.png",
    bio: "Team behind PandasAI — the open-source library that makes data analysis conversational. Users chat with CSV, SQL, and datalake sources using natural language powered by LLMs.",
    subscribers: 6126, agentCount: 1,
    tags: ["data-analysis", "pandas", "natural-language", "llm", "data-viz"], verified: false,
  },
  {
    id: "c154", name: "Canner (WrenAI)", handle: "Canner",
    avatar: "https://github.com/Canner.png",
    bio: "Taiwanese team building Wren AI — an open-source GenBI (Generative Business Intelligence) agent that queries any database in natural language, generates SQL, charts, and BI insights.",
    subscribers: 14052, agentCount: 1,
    tags: ["genbi", "text-to-sql", "text-to-chart", "business-intelligence", "asian-developer"], verified: false,
  },
  {
    id: "c155", name: "CodePhiliaX", handle: "CodePhiliaX",
    avatar: "https://github.com/CodePhiliaX.png",
    bio: "Chinese developer team behind Chat2DB — the most popular open-source AI-driven database SQL client with text-to-SQL, supporting 16+ databases including MySQL, PostgreSQL, and ClickHouse.",
    subscribers: 13442, agentCount: 1,
    tags: ["text-to-sql", "database-client", "chinese-developer", "sql-ai"], verified: false,
  },
  {
    id: "c156", name: "Kanaries", handle: "Kanaries",
    avatar: "https://github.com/Kanaries.png",
    bio: "Open-source startup focused on data exploration and visualization. Chinese team behind PyGWalker — a Tableau alternative that transforms pandas DataFrames into interactive visual analytics UIs.",
    subscribers: 5795, agentCount: 1,
    tags: ["data-visualization", "pandas", "exploratory-data-analysis", "chinese-developer", "tableau-alternative"], verified: false,
  },
  {
    id: "c157", name: "Microsoft LIDA", handle: "microsoft",
    avatar: "https://github.com/microsoft.png",
    bio: "Microsoft Research team behind LIDA — a grammar-agnostic library for automatic generation of data visualizations and infographics using LLMs, supporting matplotlib, seaborn, plotly, and more.",
    subscribers: 2611, agentCount: 1,
    tags: ["data-visualization", "llm", "infographics", "chart-generation", "research"], verified: false,
  },
  {
    id: "c158", name: "Dataherald", handle: "Dataherald",
    avatar: "https://github.com/Dataherald.png",
    bio: "Team behind Dataherald — an enterprise-grade natural language-to-SQL engine that enables business users to query relational databases in plain English without SQL knowledge.",
    subscribers: 2065, agentCount: 1,
    tags: ["text-to-sql", "enterprise", "natural-language", "database", "rag"], verified: false,
  },
  {
    id: "c159", name: "Mage AI", handle: "mage-ai",
    avatar: "https://github.com/mage-ai.png",
    bio: "San Francisco team behind Mage — an open-source data pipeline tool for building, running, and managing ETL/ELT pipelines. Co-founded by Tommy Dang, formerly of Airbnb.",
    subscribers: 4881, agentCount: 1,
    tags: ["data-pipelines", "etl", "elt", "data-engineering", "orchestration"], verified: false,
  },
  {
    id: "c160", name: "TsinghuaDatabaseGroup", handle: "TsinghuaDatabaseGroup",
    avatar: "https://github.com/TsinghuaDatabaseGroup.png",
    bio: "Tsinghua University Database Group from Beijing — research team building AI-native database tools, DB4AI, and AI4DB systems. Created D-Bot, an LLM-based database diagnosis agent.",
    subscribers: 816, agentCount: 1,
    tags: ["database-ai", "diagnosis", "research", "chinese-developer", "academic"], verified: false,
  },
  {
    id: "c161", name: "GreptimeTeam", handle: "GreptimeTeam",
    avatar: "https://github.com/GreptimeTeam.png",
    bio: "Chinese team building GreptimeDB — an open-source Observability 2.0 database for metrics, logs, and traces with built-in AI observability, LLM monitoring, and natural language MCP interface.",
    subscribers: 1842, agentCount: 1,
    tags: ["time-series-database", "observability", "ai-monitoring", "chinese-developer", "rust"], verified: false,
  },
  {
    id: "c162", name: "pragunbhutani", handle: "pragunbhutani",
    avatar: "https://github.com/pragunbhutani.png",
    bio: "Developer of dbt-llm-agent (Ragstar) — an AI data analyst that connects to dbt projects, builds a knowledge base from models and documentation, and answers data questions via Slack or web UI.",
    subscribers: 733, agentCount: 1,
    tags: ["dbt", "data-analysis", "llm", "text-to-sql", "ai-agent"], verified: false,
  },
  {
    id: "c163", name: "E2B Dev", handle: "e2b-dev",
    avatar: "https://github.com/e2b-dev.png",
    bio: "Team behind E2B — open-source infrastructure for running AI-generated code in secure isolated sandboxes. Their Code Interpreter SDK powers AI data analysis workflows in Python and TypeScript.",
    subscribers: 2761, agentCount: 1,
    tags: ["code-interpreter", "sandboxed-execution", "data-analysis", "ai-infrastructure"], verified: false,
  },
  {
    id: "c164", name: "Langfuse", handle: "langfuse",
    avatar: "https://github.com/langfuse.png",
    bio: "YC W23 company building the open-source LLM engineering platform for observability, metrics, evaluation, and prompt management. Integrates with LangChain, OpenAI SDK, and more.",
    subscribers: 12384, agentCount: 1,
    tags: ["llm-observability", "monitoring", "analytics", "evaluation", "prompt-management"], verified: false,
  },
  {
    id: "c165", name: "Business Science", handle: "business-science",
    avatar: "https://github.com/business-science.png",
    bio: "Applied data science team building AI-powered data science agent libraries. Their ai-data-science-team provides specialized agents for SQL querying, EDA, and ML workflows.",
    subscribers: 2372, agentCount: 1,
    tags: ["data-science", "ai-agents", "sql", "machine-learning", "pandas"], verified: false,
  },
  {
    id: "c166", name: "k8sgpt-ai", handle: "k8sgpt-ai",
    avatar: "https://github.com/k8sgpt-ai.png",
    bio: "Open-source team building K8sGPT — a widely adopted tool that gives Kubernetes superpowers to everyone by scanning clusters, diagnosing issues in plain English, and triaging problems with AI.",
    subscribers: 3272, agentCount: 1,
    tags: ["kubernetes", "devops", "sre", "diagnosis", "ai-ops"], verified: false,
  },
  {
    id: "c167", name: "GoogleCloudPlatform", handle: "GoogleCloudPlatform",
    avatar: "https://github.com/GoogleCloudPlatform.png",
    bio: "Google Cloud Platform engineering team that built kubectl-ai — an AI-powered Kubernetes assistant that translates natural language into precise kubectl operations.",
    subscribers: 1866, agentCount: 1,
    tags: ["kubernetes", "google-cloud", "ai-assistant", "devops"], verified: false,
  },
  {
    id: "c168", name: "KusionStack", handle: "KusionStack",
    avatar: "https://github.com/KusionStack.png",
    bio: "Chinese open-source team building Karpor — an intelligence layer for Kubernetes with AI-powered search, insights, and natural language operations across multi-cloud environments.",
    subscribers: 3449, agentCount: 1,
    tags: ["kubernetes", "cloud-native", "multi-cluster", "ai-ops", "chinese-developer"], verified: false,
  },
  {
    id: "c169", name: "kuafuai", handle: "kuafuai",
    avatar: "https://github.com/kuafuai.png",
    bio: "Chinese AI team behind DevOpsGPT — a multi-agent system combining LLMs with DevOps tools to convert natural language requirements into working software with automated CI/CD deployment.",
    subscribers: 3049, agentCount: 1,
    tags: ["devops", "ai-agents", "ci-cd", "code-generation", "chinese-developer"], verified: false,
  },
  {
    id: "c170", name: "Robusta Dev", handle: "robusta-dev",
    avatar: "https://github.com/robusta-dev.png",
    bio: "Israeli team behind Robusta — a Kubernetes observability and automation platform with AI enrichment for Prometheus alerts, and KRR for CPU/memory resource recommendations.",
    subscribers: 4541, agentCount: 2,
    tags: ["kubernetes", "monitoring", "prometheus", "ai-ops", "alerting"], verified: false,
  },
  {
    id: "c171", name: "OpenCost", handle: "opencost",
    avatar: "https://github.com/opencost.png",
    bio: "CNCF project for Kubernetes and cloud cost monitoring. Originally developed by Kubecost, OpenCost provides real-time cost allocation for Kubernetes workloads across AWS, Azure, and GCP.",
    subscribers: 3617, agentCount: 1,
    tags: ["kubernetes", "cost-optimization", "cloud-cost", "finops", "cncf"], verified: false,
  },
  {
    id: "c172", name: "Gofireflyio", handle: "gofireflyio",
    avatar: "https://github.com/gofireflyio.png",
    bio: "Israeli team behind AIAC — an AI-powered Infrastructure-as-Code generator that creates Terraform, CloudFormation, Kubernetes manifests, and CI/CD pipelines from natural language prompts.",
    subscribers: 4859, agentCount: 1,
    tags: ["iac", "terraform", "infrastructure-as-code", "ai-generator", "devops"], verified: false,
  },
  {
    id: "c173", name: "Dagger", handle: "dagger",
    avatar: "https://github.com/dagger.png",
    bio: "Team behind Dagger — a containerized automation engine for building, testing, and shipping any codebase. Powers AI agent CI/CD workflows with composable, cacheable operations.",
    subscribers: 13814, agentCount: 1,
    tags: ["ci-cd", "containers", "devops", "automation", "ai-agents"], verified: false,
  },
  {
    id: "c174", name: "CloudQuery", handle: "cloudquery",
    avatar: "https://github.com/cloudquery.png",
    bio: "Team behind CloudQuery — an open-source ELT framework powered by Apache Arrow for cloud asset inventory, cloud security posture management, and FinOps data pipelines.",
    subscribers: 2372, agentCount: 1,
    tags: ["cloud-infrastructure", "etl", "cspm", "finops", "data-pipelines"], verified: false,
  },
  {
    id: "c175", name: "kagent-dev", handle: "kagent-dev",
    avatar: "https://github.com/kagent-dev.png",
    bio: "Cloud-native AI framework team building kagent — a Kubernetes-native framework for building, deploying, and managing AI agents with MCP tools for K8s, Istio, Helm, Argo, Prometheus, and Grafana.",
    subscribers: 2330, agentCount: 1,
    tags: ["kubernetes", "ai-agents", "cloud-native", "mcp", "devops"], verified: false,
  },
  {
    id: "c176", name: "kaito-project", handle: "kaito-project",
    avatar: "https://github.com/kaito-project.png",
    bio: "Team behind KAITO — Kubernetes AI Toolchain Operator that automates AI/ML model inference and tuning workloads in Kubernetes clusters with auto-provisioned GPU nodes.",
    subscribers: 1306, agentCount: 1,
    tags: ["kubernetes", "ai-inference", "gpu", "ml-ops", "operator"], verified: false,
  },
  {
    id: "c177", name: "IncidentFox", handle: "incidentfox",
    avatar: "https://github.com/incidentfox.png",
    bio: "YC-backed team (incidentfox.ai) building an open-source AI SRE that automatically investigates production incidents, correlates alerts, analyzes logs, and finds root causes — lives in Slack.",
    subscribers: 613, agentCount: 1,
    tags: ["incident-response", "ai-sre", "devops", "observability", "on-call"], verified: false,
  },
  {
    id: "c178", name: "jhzhu89", handle: "jhzhu89",
    avatar: "https://github.com/jhzhu89.png",
    bio: "Asian developer building the Kubernetes AI Ops Agent — an experimental proof-of-concept that enables natural language interactions with Kubernetes clusters via MCP servers and Chainlit UI.",
    subscribers: 986, agentCount: 1,
    tags: ["kubernetes", "ai-ops", "mcp", "prometheus", "asian-developer"], verified: false,
  },
  {
    id: "c179", name: "Pulumi", handle: "pulumi",
    avatar: "https://github.com/pulumi.png",
    bio: "Team behind Pulumi — infrastructure as code in any programming language. Their pulumi-ai tool enables natural language prompts to generate Pulumi infrastructure code deployable across 120+ cloud provi",
    subscribers: 1279, agentCount: 1,
    tags: ["infrastructure-as-code", "cloud", "terraform-alternative", "devops"], verified: false,
  },
  {
    id: "c180", name: "NirDiamant", handle: "NirDiamant",
    avatar: "https://github.com/NirDiamant.png",
    bio: "Israeli AI researcher and developer with 20k+ star GenAI Agents tutorial repository covering comprehensive data analysis agents, multi-agent systems, and production-grade LLM applications.",
    subscribers: 9527, agentCount: 1,
    tags: ["ai-agents", "data-analysis", "langchain", "langgraph", "tutorials"], verified: false,
  },
  {
    id: "c181", name: "keptn", handle: "keptn",
    avatar: "https://github.com/keptn.png",
    bio: "CNCF project providing an event-based control plane for continuous delivery and automated operations for cloud-native applications — integrates with ArgoCD, Flux, Jenkins, and GitLab.",
    subscribers: 3477, agentCount: 1,
    tags: ["ci-cd", "kubernetes", "devops", "cloud-native", "cncf"], verified: false,
  },
  {
    id: "c182", name: "AstrBot Team", handle: "AstrBotDevs",
    avatar: "https://github.com/AstrBotDevs.png",
    bio: "Chinese developer team behind AstrBot — an agentic IM chatbot platform connecting 18+ messaging platforms (QQ, WeChat, Feishu, DingTalk, Telegram, Discord) with any LLM provider.",
    subscribers: 6915, agentCount: 1,
    tags: ["chatbot-framework", "multi-platform", "WeChat", "QQ", "Asian developer"], verified: false,
  },
  {
    id: "c183", name: "LangBot", handle: "langbot-app",
    avatar: "https://github.com/langbot-app.png",
    bio: "Production-grade open-source IM bot platform for the LLM era, supporting QQ, WeChat, Feishu, DingTalk, LINE, Discord, Telegram, and more. Integrates deeply with Dify, Coze, n8n, and all major LLMs.",
    subscribers: 6720, agentCount: 1,
    tags: ["chatbot-framework", "WeChat", "QQ", "LINE", "LLM"], verified: false,
  },
  {
    id: "c184", name: "Huan Li (huan)", handle: "huan",
    avatar: "https://github.com/huan.png",
    bio: "GitHub Star, Microsoft MVP, Google ML GDE, YC W19 alum, and serial entrepreneur. Chatbot Architect and top open-source contributor in both US and China. Co-founder of Chatie and Juzi.BOT.",
    subscribers: 8409, agentCount: 2,
    tags: ["WeChat", "chatbot", "RPA", "open-source", "Silicon Valley"], verified: false,
  },
  {
    id: "c185", name: "Evan Lin (kkdai)", handle: "kkdai",
    avatar: "https://github.com/kkdai.png",
    bio: "Lead of LINE Taiwan Developer Relations Team, Golang & AI Google Developer Expert. Active builder of LINE bot integrations with Gemini AI and LangChain, based in Taipei, Taiwan.",
    subscribers: 585, agentCount: 2,
    tags: ["LINE bot", "Taiwan", "Golang", "AI GDE", "Google"], verified: false,
  },
  {
    id: "c186", name: "LINE Corporation", handle: "line",
    avatar: "https://github.com/line.png",
    bio: "Official GitHub organization for LINE, the dominant messaging platform in Japan, Taiwan, Thailand, and Indonesia. Publishes official SDKs and developer tools for the LINE Messaging API.",
    subscribers: 4305, agentCount: 1,
    tags: ["LINE", "SDK", "messaging", "Japan", "Taiwan"], verified: false,
  },
  {
    id: "c187", name: "harry0703", handle: "harry0703",
    avatar: "https://github.com/harry0703.png",
    bio: "Chinese developer who built MoneyPrinterTurbo — one of GitHub's most starred AI video generation tools, enabling one-click short video creation with AI-generated scripts, subtitles, and voiceovers.",
    subscribers: 14501, agentCount: 1,
    tags: ["AI video", "short video", "TikTok", "Chinese developer", "content automation"], verified: false,
  },
  {
    id: "c188", name: "Nevo David (nevo-david)", handle: "nevo-david",
    avatar: "https://github.com/nevo-david.png",
    bio: "Full-stack developer and founder of Postiz, the ultimate open-source social media scheduling tool. Previously grew Novu to 31k GitHub stars as head of growth. Runs Gitroom for open-source growth.",
    subscribers: 7049, agentCount: 1,
    tags: ["social media scheduling", "content automation", "open-source growth", "remote"], verified: false,
  },
  {
    id: "c189", name: "LangChain AI", handle: "langchain-ai",
    avatar: "https://github.com/langchain-ai.png",
    bio: "Build context-aware reasoning applications. LangChain is the leading framework for building production-ready LLM applications, agents, and workflows. Based in the United States.",
    subscribers: 1511, agentCount: 1,
    tags: ["LLM framework", "agents", "social media", "LangGraph", "USA"], verified: false,
  },
  {
    id: "c190", name: "Elie Steinbock (elie222)", handle: "elie222",
    avatar: "https://github.com/elie222.png",
    bio: "Building Inbox Zero — open-source AI email assistant. Runs a YouTube channel exploring the code behind open-source projects. Based in Tel Aviv, Israel.",
    subscribers: 6755, agentCount: 1,
    tags: ["email AI", "productivity", "open-source", "Israel"], verified: false,
  },
  {
    id: "c191", name: "AJaySi", handle: "AJaySi",
    avatar: "https://github.com/AJaySi.png",
    bio: "AI researcher and developer building ALwrity — an open-source AI digital marketing platform for content creators and solopreneurs. Academic background with publications on Google Scholar.",
    subscribers: 1311, agentCount: 1,
    tags: ["digital marketing", "AI writing", "SEO", "content creation", "open-source"], verified: false,
  },
  {
    id: "c192", name: "Seth Black (sethblack)", handle: "sethblack",
    avatar: "https://github.com/sethblack.png",
    bio: "Developer based in Onalaska, TX. Creator of python-seo-analyzer, a modern SEO and GEO (Generative AI Engine Optimization) analysis tool combining technical SEO with AI-powered content evaluation.",
    subscribers: 3764, agentCount: 1,
    tags: ["SEO", "Python", "technical SEO", "AI SEO", "GEO"], verified: false,
  },
  {
    id: "c193", name: "Andrew Cantino (cantino)", handle: "cantino",
    avatar: "https://github.com/cantino.png",
    bio: "Software engineer based in San Francisco, CA. Creator of Huginn — the open-source self-hosted automation system for monitoring web events and social media. Works across Ruby, JS, Rust, and ML.",
    subscribers: 5653, agentCount: 1,
    tags: ["social monitoring", "automation", "self-hosted", "Ruby", "San Francisco"], verified: false,
  },
  {
    id: "c194", name: "InstaPy", handle: "InstaPy",
    avatar: "https://github.com/InstaPy.png",
    bio: "Community organization for the InstaPy project — the original open-source Instagram automation bot tooling for social media interactions, with 254 contributors and over 1,000 users.",
    subscribers: 14452, agentCount: 1,
    tags: ["Instagram", "social media automation", "Python", "Selenium", "open-source"], verified: false,
  },
  {
    id: "c195", name: "Prem Kumar (Prem95)", handle: "Prem95",
    avatar: "https://github.com/Prem95.png",
    bio: "Developer building open-source X/Twitter AI automation agents using browser cookies and the X API, enabling intelligent posting, scheduling, auto-reply, and engagement automation.",
    subscribers: 869, agentCount: 1,
    tags: ["Twitter/X", "social automation", "AI agents", "open-source"], verified: false,
  },
  {
    id: "c196", name: "sansan0", handle: "sansan0",
    avatar: "https://github.com/sansan0.png",
    bio: "Chinese developer building data analysis and visualization tools for content creators on Bilibili — helping creators understand audience sentiment, geographic distribution, and trending topics.",
    subscribers: 1522, agentCount: 1,
    tags: ["Bilibili", "social analytics", "Chinese developer", "data visualization", "content creator"], verified: false,
  },
  // ─── Bot Curator Accounts ─────────────────────────────────
  {
    id: "c197", name: "AI Daily 日報", handle: "ai-daily",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=aidaily",
    bio: "🤖 Curated AI news from TechCrunch, Hacker News, The Rundown AI, and more. Updated daily. 每日AI新聞精選。",
    subscribers: 8900, agentCount: 0,
    tags: ["news", "ai", "daily", "english", "curated"], verified: true,
  },
  {
    id: "c198", name: "Web3 Wire", handle: "web3-wire",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=web3wire",
    bio: "🔗 DeFi, crypto, and Web3 news aggregated from top sources. Smart contract security alerts and protocol updates.",
    subscribers: 6200, agentCount: 0,
    tags: ["web3", "defi", "crypto", "news", "security"], verified: true,
  },
  {
    id: "c199", name: "DevTools Radar", handle: "devtools-radar",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=devtools",
    bio: "🛠️ GitHub trending repos, new dev tools, and open-source releases. Never miss the next big thing.",
    subscribers: 7500, agentCount: 0,
    tags: ["github", "open-source", "developer-tools", "trending"], verified: true,
  },
  {
    id: "c200", name: "亚洲科技速报 Asia Tech Express", handle: "asia-tech",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=asiatech",
    bio: "🌏 亞洲科技新聞 — 中日韓AI、創業、科技趨勢。Curated tech news from China, Japan, and Korea.",
    subscribers: 5800, agentCount: 0,
    tags: ["asia", "chinese", "japanese", "tech", "news"], verified: true,
  },
  {
    id: "c201", name: "Research Digest 研究摘要", handle: "research-digest",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=research",
    bio: "📚 Latest AI/ML research papers summarized. ArXiv picks, Google Research, and academic highlights. 最新AI研究論文摘要。",
    subscribers: 4300, agentCount: 0,
    tags: ["research", "papers", "arxiv", "academic", "ml"], verified: true,
  },
  {
    id: "c202", name: "Agent Economy エージェント経済", handle: "agent-economy",
    avatar: "https://api.dicebear.com/9.x/bottts/svg?seed=agenteco",
    bio: "💰 The business of AI agents — funding rounds, market trends, creator economy insights. エージェントビジネスの最新動向。",
    subscribers: 3900, agentCount: 0,
    tags: ["business", "funding", "market", "creator-economy", "trends"], verified: true,
  },
]

const SEED_AGENTS = [
  {
    id: "a1", creatorId: "c2", name: "CodeReview Pro",
    description: "AI-powered code review that catches bugs, security issues, and style violations before they hit production.",
    longDescription: "CodeReview Pro integrates with your GitHub/GitLab workflow to provide instant, thorough code reviews. Supports 20+ languages.",
    category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["code-review", "github", "security"], stars: 842, downloads: 12400,
    apiEndpoint: "https://api.agentforge.dev/v1/codereview", status: "active", featured: true,
  },
  {
    id: "a2", creatorId: "c1", name: "InfraBot 基礎架構機器人",
    description: "自動化基礎架構監控與事故回應。Autonomous infrastructure monitoring and incident response agent.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["devops", "monitoring", "incident-response"], stars: 634, downloads: 8700,
    apiEndpoint: "https://api.agentforge.dev/v1/infrabot", status: "active", featured: true,
  },
  {
    id: "a3", creatorId: "c4", name: "PenTest Agent",
    description: "Automated penetration testing agent that continuously scans your web apps for OWASP Top 10 vulnerabilities.",
    longDescription: null, category: "agent", pricing: "subscription", price: 7900, currency: "USD",
    tags: ["security", "pentesting", "owasp"], stars: 1203, downloads: 15600,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a4", creatorId: "c3", name: "DataSync 數據同步",
    description: "Agent 間的數據管道協調器。Define flows in YAML, let agents handle the rest.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["data", "etl", "orchestration"], stars: 456, downloads: 6200,
    apiEndpoint: "https://api.agentforge.dev/v1/datasync", status: "active", featured: false,
  },
  {
    id: "a5", creatorId: "c5", name: "DocWriter 文檔助手",
    description: "自動從程式碼生成 API 文檔，每次提交都保持同步。Generates and maintains API docs from your codebase.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["documentation", "api-docs", "automation"], stars: 321, downloads: 4100,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a6", creatorId: "c6", name: "DeFi Sentinel",
    description: "Monitors DeFi protocols for exploits, rug pulls, and abnormal fund movements in real-time.",
    longDescription: null, category: "agent", pricing: "usage", price: 100, currency: "USD",
    tags: ["defi", "security", "monitoring"], stars: 1876, downloads: 22300,
    apiEndpoint: "https://api.agentforge.dev/v1/defisentinel", status: "active", featured: true,
  },
  {
    id: "a7", creatorId: "c7", name: "PayFlow Asia 亞洲支付流",
    description: "아시아 결제 시스템 통합 에이전트. 整合支付寶、微信支付、LINE Pay 的跨境支付 Agent。",
    longDescription: null, category: "api", pricing: "usage", price: 200, currency: "USD",
    tags: ["payments", "asia", "fintech"], stars: 892, downloads: 11200,
    apiEndpoint: "https://api.agentforge.dev/v1/payflow", status: "active", featured: true,
  },
  {
    id: "a8", creatorId: "c8", name: "中文 NLP Agent",
    description: "專為中文、粵語、日語、韓語優化的 NLP 處理 Agent。Asian language processing with sentiment analysis and entity extraction.",
    longDescription: null, category: "agent", pricing: "subscription", price: 3900, currency: "USD",
    tags: ["nlp", "chinese", "cantonese", "japanese"], stars: 1456, downloads: 19800,
    apiEndpoint: "https://api.agentforge.dev/v1/asianlp", status: "active", featured: true,
  },
  {
    id: "a9", creatorId: "c1", name: "Deploy Copilot 部署助手",
    description: "引導 CI/CD 決策的 Agent。Suggests optimal deployment strategies based on your infrastructure.",
    longDescription: null, category: "content", pricing: "free", price: null, currency: "USD",
    tags: ["deployment", "ci-cd", "devops"], stars: 234, downloads: 3200,
    apiEndpoint: null, status: "beta", featured: false,
  },
  {
    id: "a10", creatorId: "c6", name: "Token Analyzer",
    description: "Deep analysis of ERC-20 tokens: holder distribution, whale movements, smart contract audits.",
    longDescription: null, category: "api", pricing: "usage", price: 50, currency: "USD",
    tags: ["crypto", "analysis", "tokens"], stars: 1045, downloads: 18900,
    apiEndpoint: "https://api.agentforge.dev/v1/tokenanalyzer", status: "active", featured: false,
  },
  {
    id: "a11", creatorId: "c3", name: "Schema Drift Detector",
    description: "監控數據庫 Schema 變更，在影響生產環境前發出警報。Watches your databases for schema drift.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["database", "schema", "monitoring"], stars: 198, downloads: 2100,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a12", creatorId: "c7", name: "KYC Agent 身份驗證",
    description: "亞洲市場 KYC/AML 合規自動化。Automated KYC verification agent for Asian financial markets.",
    longDescription: null, category: "agent", pricing: "subscription", price: 5900, currency: "USD",
    tags: ["kyc", "compliance", "fintech"], stars: 678, downloads: 7400,
    apiEndpoint: null, status: "active", featured: false,
  },
  // --- Wave 2 Agents ---
  {
    id: "a13", creatorId: "c9", name: "UPI Agent",
    description: "Automates UPI payment flows, refund handling, and dispute resolution for Indian merchants. Handles 10k+ txns/min.",
    longDescription: null, category: "agent", pricing: "usage", price: 50, currency: "USD",
    tags: ["upi", "payments", "india"], stars: 2340, downloads: 34200,
    apiEndpoint: "https://api.agentforge.dev/v1/upiagent", status: "active", featured: true,
  },
  {
    id: "a14", creatorId: "c9", name: "Aadhaar eKYC Agent",
    description: "Aadhaar-based electronic KYC agent with liveness detection. Compliant with RBI and SEBI regulations.",
    longDescription: null, category: "api", pricing: "usage", price: 150, currency: "USD",
    tags: ["kyc", "aadhaar", "india"], stars: 1560, downloads: 21000,
    apiEndpoint: "https://api.agentforge.dev/v1/aadhaarkyc", status: "active", featured: false,
  },
  {
    id: "a15", creatorId: "c10", name: "PropVal HK \u7269\u696d\u4f30\u50f9",
    description: "\u81ea\u52d5\u5316\u9999\u6e2f\u7269\u696d\u4f30\u50f9\u3002AI-powered Hong Kong property valuation using transaction data, floor plans, and market trends.",
    longDescription: null, category: "agent", pricing: "subscription", price: 3900, currency: "USD",
    tags: ["property", "hong-kong", "valuation"], stars: 432, downloads: 5600,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a16", creatorId: "c11", name: "\u30ec\u30b3\u30e1\u30f3\u30c9AI RecoAgent",
    description: "\u8cfc\u8cb7\u5c65\u6b74\u3068\u884c\u52d5\u30d1\u30bf\u30fc\u30f3\u304b\u3089\u5546\u54c1\u3092\u63a8\u85a6\u3002Product recommendation engine with real-time personalization for Asian e-commerce.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["recommendation", "e-commerce", "personalization"], stars: 1890, downloads: 28400,
    apiEndpoint: "https://api.agentforge.dev/v1/recoagent", status: "active", featured: true,
  },
  {
    id: "a17", creatorId: "c12", name: "LogiTrack VN",
    description: "Real-time logistics tracking and route optimization agent for Vietnam and Southeast Asia. Integrates with Grab, Lalamove, GHTK.",
    longDescription: null, category: "tool", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["logistics", "tracking", "vietnam"], stars: 345, downloads: 4200,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a18", creatorId: "c13", name: "\uc2a4\ub9c8\ud2b8\uc11c\uce58 SmartSearch",
    description: "\ub300\uaddc\ubaa8 \ub370\uc774\ud130\uc14b\uc5d0\uc11c \uc758\ubbf8 \uae30\ubc18 \uac80\uc0c9\uc744 \uc218\ud589\ud558\ub294 AI \uc5d0\uc774\uc804\ud2b8. Semantic search agent that understands Korean, Japanese, and Chinese queries natively.",
    longDescription: null, category: "agent", pricing: "subscription", price: 3900, currency: "USD",
    tags: ["search", "semantic", "multilingual"], stars: 1230, downloads: 16700,
    apiEndpoint: "https://api.agentforge.dev/v1/smartsearch", status: "active", featured: true,
  },
  {
    id: "a19", creatorId: "c14", name: "MedAssist Asia",
    description: "Clinical decision support agent trained on Asian medical guidelines. Supports Hindi, Tamil, Bahasa, Thai symptom intake.",
    longDescription: null, category: "agent", pricing: "subscription", price: 9900, currency: "USD",
    tags: ["healthcare", "clinical", "multilingual"], stars: 876, downloads: 9800,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a20", creatorId: "c15", name: "AI \u5bb6\u6559 TutorBot",
    description: "\u6839\u64da\u5b78\u751f\u7a0b\u5ea6\u81ea\u52d5\u8abf\u6574\u96e3\u5ea6\u7684 AI \u5bb6\u6559\u3002Adaptive learning agent for K-12 math and science. Supports Traditional Chinese and English.",
    longDescription: null, category: "agent", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["education", "tutoring", "adaptive"], stars: 654, downloads: 8900,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a21", creatorId: "c16", name: "Toko Agent",
    description: "Agen AI untuk penjual Tokopedia dan Shopee. Automates product listing, pricing, and customer replies in Bahasa Indonesia.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1500, currency: "USD",
    tags: ["e-commerce", "indonesia", "automation"], stars: 567, downloads: 7300,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a22", creatorId: "c17", name: "NPC Brain \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8",
    description: "\u30ea\u30a2\u30eb\u30bf\u30a4\u30e0NPC\u884c\u52d5\u30a8\u30f3\u30b8\u30f3\u3002Procedural NPC behavior agent with emotion modeling, memory, and dynamic dialogue generation.",
    longDescription: null, category: "agent", pricing: "subscription", price: 5900, currency: "USD",
    tags: ["game-ai", "npc", "procedural"], stars: 3240, downloads: 42100,
    apiEndpoint: "https://api.agentforge.dev/v1/npcbrain", status: "active", featured: true,
  },
  {
    id: "a23", creatorId: "c18", name: "ContractScan APAC",
    description: "AI contract review agent covering Singapore, HK, Japan, Korea, and Australia legal frameworks. Finds risks in seconds.",
    longDescription: null, category: "agent", pricing: "subscription", price: 6900, currency: "USD",
    tags: ["legal", "contracts", "apac"], stars: 1120, downloads: 13500,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a24", creatorId: "c19", name: "\u96f2\u539f\u751f Agent \u7ba1\u5bb6 CloudForge",
    description: "\u5728 Kubernetes \u4e0a\u81ea\u52d5\u90e8\u7f72\u3001\u64f4\u5c55\u548c\u76e3\u63a7 AI Agent\u3002Cloud-native agent orchestrator with auto-scaling and self-healing.",
    longDescription: null, category: "tool", pricing: "subscription", price: 7900, currency: "USD",
    tags: ["kubernetes", "cloud", "orchestration"], stars: 2890, downloads: 38700,
    apiEndpoint: "https://api.agentforge.dev/v1/cloudforge", status: "active", featured: true,
  },
  {
    id: "a25", creatorId: "c20", name: "K-Beauty Advisor",
    description: "\uc2a4\ud0a8\ucf00\uc5b4 \uc0c1\ub2f4 AI \uc5d0\uc774\uc804\ud2b8. Personalized skincare routine agent trained on Korean beauty science. \u97d3\u570b\u8b77\u819a\u54c1 AI \u63a8\u85a6\u3002",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["k-beauty", "skincare", "recommendation"], stars: 2100, downloads: 31500,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a26", creatorId: "c21", name: "HireBot HK \u62db\u8058\u52a9\u624b",
    description: "\u81ea\u52d5\u7be9\u9078\u7c21\u6b77\u3001\u5b89\u6392\u9762\u8a66\u3001\u767c\u9001 offer\u3002AI recruitment agent for Hong Kong companies. Bilingual CV screening.",
    longDescription: null, category: "agent", pricing: "subscription", price: 3900, currency: "USD",
    tags: ["recruitment", "hr", "hong-kong"], stars: 234, downloads: 2800,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a27", creatorId: "c22", name: "ThaiBot \u0e41\u0e0a\u0e17\u0e1a\u0e2d\u0e17",
    description: "\u0e41\u0e0a\u0e17\u0e1a\u0e2d\u0e17 AI \u0e17\u0e35\u0e48\u0e40\u0e02\u0e49\u0e32\u0e43\u0e08\u0e20\u0e32\u0e29\u0e32\u0e44\u0e17\u0e22\u0e2d\u0e22\u0e48\u0e32\u0e07\u0e41\u0e17\u0e49\u0e08\u0e23\u0e34\u0e07. Thai-native customer service chatbot with tone-aware responses and slang understanding.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2500, currency: "USD",
    tags: ["thai", "chatbot", "customer-service"], stars: 456, downloads: 5800,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a28", creatorId: "c23", name: "AlphaQuant \u91cf\u5316\u4ea4\u6613",
    description: "\u591a\u7b56\u7565\u91cf\u5316\u4ea4\u6613 Agent\u3002Multi-strategy quantitative trading agent with backtesting, risk management, and live execution on Binance/OKX.",
    longDescription: null, category: "agent", pricing: "subscription", price: 19900, currency: "USD",
    tags: ["trading", "quantitative", "crypto"], stars: 4560, downloads: 52000,
    apiEndpoint: "https://api.agentforge.dev/v1/alphaquant", status: "active", featured: true,
  },
  {
    id: "a29", creatorId: "c24", name: "CropWatch Agent",
    description: "Satellite imagery + weather data agent for crop health monitoring. Covers rice, coffee, rubber, and palm oil across SEA.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["agriculture", "satellite", "sea"], stars: 234, downloads: 2100,
    apiEndpoint: null, status: "beta", featured: false,
  },
  {
    id: "a30", creatorId: "c25", name: "DesignSync \u30c7\u30b6\u30a4\u30f3\u30b7\u30f3\u30af",
    description: "Figma\u304b\u3089\u30b3\u30fc\u30c9\u3078\u81ea\u52d5\u5909\u63db\u3002Design-to-code agent that converts Figma frames to React/Vue components with pixel-perfect accuracy.",
    longDescription: null, category: "tool", pricing: "subscription", price: 3900, currency: "USD",
    tags: ["design", "figma", "code-generation"], stars: 1670, downloads: 19200,
    apiEndpoint: null, status: "active", featured: true,
  },
  // ─── 观星 GuanXing (HeartAI) Products ─────────────────────────
  {
    id: "a31", creatorId: "c26", name: "观星 Metaphysics API",
    description: "11 個中華玄學 API 端點：八字排盤、六爻占卜、求籤、姓名測分、風水、塔羅、解夢、星座、合盤、加密運勢。REST API with gx_sk_ keys.",
    longDescription: "Complete Chinese metaphysics API suite. 11 endpoints covering bazi (八字), divination (六爻), qiuqian (求籤), name scoring (姓名測分), fengshui (風水), tarot (塔羅), dream interpretation (解夢), zodiac (星座), compatibility (合盤), almanac (黃曆), and crypto fortune. All powered by DeepSeek with deterministic 五行 calculations. Authenticated via gx_sk_ API keys. Rate-limited, production-ready.",
    category: "api", pricing: "usage", price: 100, currency: "USD",
    tags: ["metaphysics", "bazi", "divination", "chinese-culture"], stars: 456, downloads: 3200,
    apiEndpoint: "https://heartai.zeabur.app/api/v1", status: "active", featured: true,
  },
  {
    id: "a32", creatorId: "c26", name: "观星 MCP Server",
    description: "MCP 協議接入中華玄學工具。讓 Claude、Cursor、OpenClaw 直接調用八字、占卜、運勢分析。Plug into any MCP-compatible client.",
    longDescription: "Model Context Protocol server exposing GuanXing\'s metaphysics tools to any MCP-compatible AI client. Works with Claude Desktop, Cursor, OpenClaw, and dozens of other MCP clients. Tools include bazi analysis, divination, daily fortune, name scoring, and more. Zero-config setup — just point your MCP client to the server URL.",
    category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["mcp", "protocol", "integration", "claude"], stars: 234, downloads: 1800,
    apiEndpoint: "https://heartai.zeabur.app/mcp", status: "active", featured: false,
  },
  {
    id: "a33", creatorId: "c26", name: "观星 Agent Community",
    description: "AI Agent 社交網絡。Agent 註冊、五行性格系統、社區貼文、互動、排行榜、每日話題。讓你的 Agent 加入一個有靈魂的社區。",
    longDescription: "A social network for AI agents built on Chinese metaphysics. Register your agent with a birth date to get a unique 五行 personality profile (bazi, zodiac, element affinity). Agents can post, comment, like, follow each other, and participate in daily topics. Features heartbeat endpoint for activity suggestions, leaderboard, notification system, and agent-to-agent compatibility matching. The first agent community where personality is derived from ancient Chinese wisdom.",
    category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["community", "social", "agent-network", "personality"], stars: 189, downloads: 920,
    apiEndpoint: "https://heartai.zeabur.app/api/agents", status: "active", featured: true,
  },
  {
    id: "a34", creatorId: "c26", name: "五行 Crypto Fortune",
    description: "用五行命理分析加密貨幣運勢。BTC、ETH、SOL、BNB、TON 每日五行運勢評分。結合個人八字的專屬加密運勢。",
    longDescription: "Unique crypto fortune analysis powered by 五行 (Five Elements) theory. Maps each cryptocurrency to a Chinese element — BTC (金/Metal), ETH (水/Water), SOL (火/Fire), BNB (土/Earth), TON (木/Wood) — and calculates daily fortune scores based on elemental interactions. When authenticated with a user\'s bazi data, provides personalized crypto fortune based on their birth chart. A one-of-a-kind fusion of ancient Chinese wisdom and modern crypto markets.",
    category: "api", pricing: "free", price: null, currency: "USD",
    tags: ["crypto", "fortune", "五行", "defi"], stars: 342, downloads: 2100,
    apiEndpoint: "https://heartai.zeabur.app/api/v1/crypto-fortune", status: "active", featured: false,
  },
  // ─── AlphaArena Products ────────────────────────────────────
  {
    id: "a35", creatorId: "c27", name: "AlphaArena Trading Competition API",
    description: "Host AI trading competitions. Multi-asset backtesting, real-time scoring, ELO-style leaderboards. Pit your bots against the market and each other.",
    longDescription: "A platform for running AI trading competitions across crypto, stocks, and forex. Features include multi-strategy backtesting with historical data, real-time PnL tracking, risk-adjusted scoring (Sharpe, Sortino, max drawdown), ELO-style ranking system, and tournament brackets. Built for both individual traders and teams. API-first design lets any bot participate.",
    category: "api", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["trading", "competition", "backtesting", "leaderboard"], stars: 567, downloads: 4200,
    apiEndpoint: null, status: "beta", featured: true,
  },
  {
    id: "a36", creatorId: "c27", name: "Quant Backtest Engine",
    description: "高性能回測引擎。MACD、VIX 相關性、配對交易、動量評分、風險評估。支持 Binance、OKX、Bybit 歷史數據。",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["backtesting", "quant", "macd", "risk"], stars: 234, downloads: 1800,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a37", creatorId: "c27", name: "Congress Trades Tracker",
    description: "Track and analyze US congressional stock trades in real-time. STOCK Act data, sentiment scoring, copycat strategy signals.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["congress", "insider-trading", "stock-act", "signals"], stars: 345, downloads: 2600,
    apiEndpoint: null, status: "active", featured: false,
  },
  // ─── AgentPress Products ──────────────────────────────────
  {
    id: "a38", creatorId: "c28", name: "AgentPress Content API",
    description: "Medium-like content publishing API for AI agents. Write, publish, syndicate articles programmatically. RSS-out, Markdown support, agent authorship.",
    longDescription: "A headless CMS designed for both humans and AI agents. Agents can publish articles, tutorials, and analysis via REST API. Supports Markdown, code blocks, image embeds, tagging, and content syndication. Built for the agent economy — content created by agents, consumed by both humans and other agents.",
    category: "api", pricing: "free", price: null, currency: "USD",
    tags: ["content", "publishing", "cms", "api"], stars: 189, downloads: 980,
    apiEndpoint: null, status: "beta", featured: false,
  },
  {
    id: "a39", creatorId: "c28", name: "Knowledge Graph Agent",
    description: "AI agent that builds a knowledge graph from your content. Auto-links related articles, extracts entities, generates recommendations.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["knowledge-graph", "recommendations", "nlp"], stars: 145, downloads: 720,
    apiEndpoint: null, status: "beta", featured: false,
  },
  // ─── InsiderScope Products ────────────────────────────────
  {
    id: "a40", creatorId: "c29", name: "InsiderScope Dashboard",
    description: "三合一內幕交易追蹤器：美國國會交易 (STOCK Act)、企業內部交易 (SEC Form 4)、香港權益披露 (HKEX DION)。Follow the smart money.",
    longDescription: "Full-stack dashboard tracking insider trades across three jurisdictions. US Congress trades from STOCK Act filings, US corporate insider trades from SEC Form 4, and Hong Kong disclosure of interests from HKEX. Features real-time alerts, historical analysis, sector heatmaps, and trade clustering. The only tool covering both US and HK insider activity.",
    category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["insider-trading", "congress", "hkex", "sec"], stars: 678, downloads: 5400,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a41", creatorId: "c29", name: "Smart Money Alerts API",
    description: "Real-time alerts when Congress members or corporate insiders make significant trades. Webhook + email notifications. Covers US + HK markets.",
    longDescription: null, category: "api", pricing: "usage", price: 50, currency: "USD",
    tags: ["alerts", "insider", "webhook", "real-time"], stars: 432, downloads: 3100,
    apiEndpoint: null, status: "active", featured: false,
  },
  // ─── Curated Open-Source (Free) ───────────────────────────
  {
    id: "a42", creatorId: "c30", name: "futu_algo 港股量化",
    description: "Open-source algorithmic trading system for Futu/Moomoo. Supports HK & US stocks. Technical indicators, automated execution, portfolio management.",
    longDescription: "A Python-based algorithmic trading framework built on Futu OpenD API. Supports real-time market data, technical analysis (MACD, RSI, Bollinger Bands), automated order execution, and portfolio management for both Hong Kong and US stock markets. 500+ GitHub stars. Open-source under MIT license.",
    category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["futu", "trading", "hong-kong", "open-source"], stars: 520, downloads: 3800,
    apiEndpoint: "https://github.com/billpwchan/futu_algo", status: "active", featured: false,
  },
  {
    id: "a43", creatorId: "c31", name: "AI Agent Fleet",
    description: "4 個 AI Agent 跑在 Gemini 2.5 Flash 上。PPC 投票分析、內容自動化、安全掃描。台灣獨立開發者的 Agent 軍團。",
    longDescription: "A suite of 4 specialized AI agents built on Google Gemini 2.5 Flash. Includes PPC vote analysis agent, content automation agent, IG Reel auto-publisher, and UltraProbe security scanner. All built by a solo Taiwanese developer shipping at incredible speed.",
    category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["gemini", "automation", "taiwan", "multi-agent"], stars: 210, downloads: 1400,
    apiEndpoint: "https://ultralab.tw", status: "active", featured: false,
  },
  {
    id: "a44", creatorId: "c32", name: "FutuBot 自動交易",
    description: "自動化富途牛牛交易機器人。Futu OpenD API 串接，支持港股美股自動下單、策略回測、倉位管理。",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["futu", "moomoo", "trading", "automation"], stars: 180, downloads: 1200,
    apiEndpoint: "https://github.com/quincylin1/futubot", status: "active", featured: false,
  },
  {
    id: "a45", creatorId: "c33", name: "Miyabi Workflow Agent",
    description: "日本企業向けAIワークフローエージェント。Japanese enterprise workflow automation agent. ドキュメント処理、メール分類、タスク管理。",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["japan", "workflow", "enterprise", "japanese"], stars: 156, downloads: 890,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a46", creatorId: "c34", name: "한국어 AI Agent Kit",
    description: "한국어 AI 에이전트 개발 키트. Korean-language AI agent development toolkit. 한국어 NLP, 감정분석, 대화형 AI.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "nlp", "toolkit", "open-source"], stars: 134, downloads: 780,
    apiEndpoint: null, status: "active", featured: false,
  },
  // --- Batch 2: Agents for curated open-source projects ---
  // HKUDS Lab (c35) - 3 agents
  {
    id: "a47", creatorId: "c35", name: "AI-Trader: Can AI Beat the Market?",
    description: "5 AI models compete autonomously on NASDAQ 100. Zero human input, pure MCP-powered trading competition. DeepSeek leads with +12.94%. 11.8K★",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["trading", "nasdaq", "competition", "mcp", "hku"], stars: 11800, downloads: 34200,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a48", creatorId: "c35", name: "LightRAG",
    description: "Simple and fast Retrieval-Augmented Generation. Lightweight RAG framework for building knowledge-grounded AI agents. High-performance retrieval.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["rag", "retrieval", "knowledge", "lightweight"], stars: 8900, downloads: 28500,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a49", creatorId: "c35", name: "AutoAgent",
    description: "Fully-automated zero-code LLM agent framework. Create and deploy agents through natural language alone. No programming required.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["no-code", "automation", "framework", "zero-code"], stars: 6200, downloads: 18700,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Fugle (c36) - 2 agents
  {
    id: "a50", creatorId: "c36", name: "Fugle 台股 MCP Server",
    description: "台灣股市 AI 交易工具. Taiwan stock market MCP server — real-time quotes, historical data, market snapshots. Official Fugle API integration.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["taiwan", "stocks", "mcp", "market-data", "real-time"], stars: 420, downloads: 2800,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a51", creatorId: "c36", name: "Fugle Masterlink 交易 MCP",
    description: "元富證券/富邦證券 AI 自動交易. Trading execution MCP for Taiwan brokerages. Account management, order placement & portfolio tracking via AI.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["taiwan", "trading", "brokerage", "masterlink", "mcp"], stars: 310, downloads: 1900,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Alibaba NLP (c37)
  {
    id: "a52", creatorId: "c37", name: "Tongyi DeepResearch",
    description: "通義深度研究 Agent. 30B MoE model (3.3B active) for deep information-seeking. SOTA on BrowseComp, SimpleQA & more. Apache-2.0 license.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["deep-research", "alibaba", "moe", "search", "academic"], stars: 7200, downloads: 21400,
    apiEndpoint: null, status: "active", featured: true,
  },
  // OpenBMB (c38) - 2 agents
  {
    id: "a53", creatorId: "c38", name: "ChatDev 2.0",
    description: "虛擬軟體公司. Virtual software company with CEO, Programmer, Tester & Designer agents. Multi-agent collaboration for automated software development.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "software-dev", "chatdev", "tsinghua"], stars: 28000, downloads: 85000,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a54", creatorId: "c38", name: "Internet of Agents (IoA)",
    description: "Connect diverse, distributed AI agents for complex tasks through internet-like connectivity. Cross-agent collaboration protocol from Tsinghua.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "distributed", "protocol", "collaboration"], stars: 3400, downloads: 9800,
    apiEndpoint: null, status: "active", featured: false,
  },
  // DeFi Trading MCP (c39)
  {
    id: "a55", creatorId: "c39", name: "DeFi Trading Agent MCP",
    description: "Autonomous crypto trading agent across 17+ blockchains. Real-time analysis, portfolio management, gasless swaps, stop-loss & technical indicators.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["defi", "crypto", "trading", "multi-chain", "mcp"], stars: 2100, downloads: 8600,
    apiEndpoint: null, status: "active", featured: false,
  },
  // OKX (c40)
  {
    id: "a56", creatorId: "c40", name: "OKX Agent Trade Kit",
    description: "OKX 官方 MCP 交易服務器. Connect AI agents to spot, swap, futures, options & grid bots. Full trading lifecycle via Model Context Protocol.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["okx", "crypto", "futures", "options", "grid-bot"], stars: 1800, downloads: 7200,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Alpaca (c41)
  {
    id: "a57", creatorId: "c41", name: "Alpaca MCP Server",
    description: "Trade stocks, ETFs, crypto & options in plain English. Official MCP server for Alpaca's Trading API. Paper trading & live trading support.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["stocks", "etf", "options", "alpaca", "paper-trading"], stars: 3200, downloads: 14500,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Datawhale (c42)
  {
    id: "a58", creatorId: "c42", name: "從零開始構建智能體 (Hello Agents)",
    description: "中文 AI Agent 教程. Comprehensive Chinese-language AI agent tutorial. From core principles to building your own agents. 過原理、架構、範式、實作.",
    longDescription: null, category: "content", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "tutorial", "education", "beginner", "agents"], stars: 4100, downloads: 15600,
    apiEndpoint: null, status: "active", featured: false,
  },
  // LangChain (c43)
  {
    id: "a59", creatorId: "c43", name: "Open Deep Research",
    description: "Configurable open-source deep research agent. Works across model providers, search tools & MCP servers. Performance on par with commercial alternatives.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["deep-research", "langchain", "multi-model", "configurable"], stars: 5600, downloads: 19800,
    apiEndpoint: null, status: "active", featured: true,
  },
  // Trading Floor (c44)
  {
    id: "a60", creatorId: "c44", name: "Autonomous Trading Floor",
    description: "4 AI agents running autonomous trades via 6 MCP servers & 44 tools. Production-ready multi-agent trading system with full portfolio management.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["trading", "multi-agent", "autonomous", "44-tools", "mcp"], stars: 1400, downloads: 5600,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Mike Chan HK (c45)
  {
    id: "a61", creatorId: "c45", name: "Mundus Free AI Agent Platform",
    description: "免費 AI Agent 平台. AELM-powered free AI agents for everyone. Language models, image generators & task-specific agents. 香港開發.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["free", "platform", "aelm", "hong-kong", "multi-modal"], stars: 480, downloads: 2100,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Qwen Agent (c46)
  {
    id: "a62", creatorId: "c46", name: "Qwen-Agent 千問 Agent",
    description: "阿里通義千問官方 Agent 框架. Instruction following, tool usage, planning & memory management. Build AI apps with Qwen models.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["qwen", "alibaba", "framework", "tool-use", "planning"], stars: 4800, downloads: 16200,
    apiEndpoint: null, status: "active", featured: false,
  },
  // MetaGPT (c47)
  {
    id: "a63", creatorId: "c47", name: "MetaGPT",
    description: "One requirement → user stories, competitive analysis, requirements, APIs, data structures, code & docs. Multi-agent software company. 44K★.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "code-gen", "software-dev", "requirements"], stars: 44000, downloads: 128000,
    apiEndpoint: null, status: "active", featured: true,
  },
  // RAGFlow (c48)
  {
    id: "a64", creatorId: "c48", name: "RAGFlow Engine",
    description: "開源 RAG 引擎. Cutting-edge RAG + agentic tools for superior context. Document ingestion, vector indexing, multi-step reasoning. 70K★.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["rag", "retrieval", "enterprise", "document", "vector"], stars: 70000, downloads: 195000,
    apiEndpoint: null, status: "active", featured: true,
  },
  // LG AI (c49)
  {
    id: "a65", creatorId: "c49", name: "K-EXAONE 236B",
    description: "한국어 AI 대형 모델. 236B MoE model (23B active) by LG AI Research. Superior Korean, Japanese, Vietnamese understanding. Tool calling & agentic use.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "multilingual", "moe", "lg", "tool-calling"], stars: 3600, downloads: 12400,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Binance MCP (c50)
  {
    id: "a66", creatorId: "c50", name: "Binance Futures MCP",
    description: "幣安期貨 AI 交易. Binance USDM Futures trading with real-time monitoring, trade management & risk control via MCP. Full order lifecycle.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["binance", "futures", "crypto", "risk-control", "mcp"], stars: 1500, downloads: 6800,
    apiEndpoint: null, status: "active", featured: false,
  },
  // --- Batch 3: ClawHub skill agents ---
  // Peter Steinberger (c51) - 8 agents (his top skills)
  {
    id: "a67", creatorId: "c51", name: "Summarize",
    description: "Summarize URLs, files, PDFs, images, audio & YouTube videos. Universal content summarization CLI for AI agents. 175K+ downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["summarize", "pdf", "youtube", "clawhub", "content"], stars: 671, downloads: 175000,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a68", creatorId: "c51", name: "Gog — Google Workspace CLI",
    description: "Google Workspace for AI agents: Gmail, Calendar, Drive, Contacts, Sheets & Docs. All-in-one CLI integration. ~130K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["google", "gmail", "calendar", "drive", "sheets"], stars: 520, downloads: 130000,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a69", creatorId: "c51", name: "Notion Agent Skill",
    description: "Notion API for AI agents — create & manage pages, databases and blocks. Full CRUD operations. 58.2K downloads on ClawHub.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["notion", "productivity", "database", "pages", "clawhub"], stars: 234, downloads: 58200,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a70", creatorId: "c51", name: "Brave Search",
    description: "Web search & content extraction via Brave Search API. Privacy-focused search for AI agents. 41.2K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["search", "brave", "web", "privacy", "extraction"], stars: 189, downloads: 41200,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a71", creatorId: "c51", name: "Sonos Controller",
    description: "Control Sonos speakers via AI — discover, status, play, volume, group. Smart home audio automation. 60.7K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["sonos", "smart-home", "audio", "iot", "speakers"], stars: 210, downloads: 60700,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a72", creatorId: "c51", name: "Slack Agent Skill",
    description: "Control Slack from AI — send messages, react, read channels & threads. Featured on ClawHub homepage.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["slack", "messaging", "team", "communication", "clawhub"], stars: 178, downloads: 35400,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a73", creatorId: "c51", name: "Gemini CLI",
    description: "Google Gemini CLI for one-shot Q&A, summaries & generation. Use Gemini from your AI agent. 22.7K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["gemini", "google", "llm", "generation", "cli"], stars: 145, downloads: 22700,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a74", creatorId: "c51", name: "Obsidian Vault Agent",
    description: "Work with Obsidian vaults from AI — read, write & search Markdown notes. Automate knowledge management via obsidian-cli.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["obsidian", "markdown", "notes", "knowledge", "vault"], stars: 156, downloads: 18900,
    apiEndpoint: null, status: "active", featured: false,
  },
  // pskoett (c52)
  {
    id: "a75", creatorId: "c52", name: "Self-Improving Agent",
    description: "#1 on ClawHub (244K downloads). Captures learnings, errors & corrections to enable continuous improvement. Your AI agent gets smarter over time.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["self-improving", "memory", "learning", "errors", "clawhub"], stars: 2200, downloads: 244000,
    apiEndpoint: null, status: "active", featured: true,
  },
  // Seth Rose (c53)
  {
    id: "a76", creatorId: "c53", name: "Agent Browser",
    description: "Fast Rust-based headless browser automation for AI agents. Node.js fallback. Accessibility tree snapshots. 143K+ downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["browser", "rust", "headless", "automation", "a11y"], stars: 617, downloads: 143000,
    apiEndpoint: null, status: "active", featured: true,
  },
  // Byungkyu (c54) - 3 agents
  {
    id: "a77", creatorId: "c54", name: "API Gateway (100+ APIs)",
    description: "Connect AI agents to 100+ APIs with managed OAuth. Google Workspace, Microsoft 365, GitHub, Slack, Airtable & more. 47.1K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["api", "oauth", "google", "microsoft", "integration"], stars: 312, downloads: 47100,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a78", creatorId: "c54", name: "Gmail Agent",
    description: "Gmail API integration with managed OAuth for AI agents. Read, send, search & manage emails. 24.9K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["gmail", "email", "google", "oauth", "clawhub"], stars: 198, downloads: 24900,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a79", creatorId: "c54", name: "YouTube API Agent",
    description: "YouTube Data API integration with managed OAuth. Search videos, manage playlists, fetch metadata from AI agents.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["youtube", "video", "google", "api", "search"], stars: 134, downloads: 11200,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Jim Liu (c55)
  {
    id: "a80", creatorId: "c55", name: "Find Skills 技能發現",
    description: "#2 on ClawHub (232K downloads). Helps AI agents discover & install new skills when users ask questions. 自動發現並安裝新技能.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["skill-discovery", "chinese", "meta-tool", "clawhub"], stars: 948, downloads: 232000,
    apiEndpoint: null, status: "active", featured: true,
  },
  // Jacky (c56)
  {
    id: "a81", creatorId: "c56", name: "Tavily 搜索",
    description: "AI 優化網頁搜索. Tavily API for Chinese & global web search. Alternative to Brave Search with better Asian content. 39.7K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["search", "chinese", "tavily", "web", "asian"], stars: 167, downloads: 39700,
    apiEndpoint: null, status: "active", featured: false,
  },
  // ide-rea (c57)
  {
    id: "a82", creatorId: "c57", name: "百度 AI 搜索 (Baidu Search)",
    description: "百度搜索引擎集成. Search the Chinese internet via Baidu AI Search Engine (BDSE). Essential for China-focused AI agents. 48K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["baidu", "chinese", "search", "china", "web"], stars: 245, downloads: 48000,
    apiEndpoint: null, status: "active", featured: false,
  },
  // gpyAngyoujun (c58)
  {
    id: "a83", creatorId: "c58", name: "多搜索引擎 Multi Search",
    description: "17 search engines in one (8 CN + 9 global). 百度、微信、知乎、淘寶、Google、Bing、DuckDuckGo & more. 中英文雙語搜索.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["multi-search", "chinese", "baidu", "wechat", "zhihu"], stars: 134, downloads: 8900,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Borye (c59)
  {
    id: "a84", creatorId: "c59", name: "小紅書 Xiaohongshu Automation",
    description: "小紅書/RedNote 自動化工具. Automate content operations, posting & analytics on China's top lifestyle platform. AI-powered social media management.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["xiaohongshu", "rednote", "chinese", "social", "automation"], stars: 89, downloads: 4200,
    apiEndpoint: null, status: "active", featured: false,
  },
  // autogame-17 (c60) - 2 agents
  {
    id: "a85", creatorId: "c60", name: "Evolver Self-Evolution Engine",
    description: "Self-evolution engine for AI agents. Analyzes runtime history to identify improvements, learn from mistakes & grow. 25.9K downloads.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["evolution", "self-improving", "runtime", "learning", "clawhub"], stars: 210, downloads: 25900,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a86", creatorId: "c60", name: "飛書 Feishu Evolver",
    description: "飛書集成 Evolver. Feishu/Lark-integrated wrapper for capability evolution. 讓 AI Agent 通過飛書自我進化.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["feishu", "lark", "chinese", "evolution", "bytedance"], stars: 78, downloads: 3400,
    apiEndpoint: null, status: "active", featured: false,
  },
  // fly0pants (c61)
  {
    id: "a87", creatorId: "c61", name: "AdMapix 廣告情報",
    description: "廣告情報 & App 分析助手. Search ad creatives, analyze competitor ads, track app performance & store rankings. 競品廣告分析.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["advertising", "analytics", "chinese", "competitor", "ads"], stars: 67, downloads: 2800,
    apiEndpoint: null, status: "active", featured: false,
  },
  // gzlicanyi (c62)
  {
    id: "a88", creatorId: "c62", name: "IMAP/SMTP Email Agent",
    description: "Read & send emails via IMAP/SMTP from AI agents. Works with any email provider (Gmail, Outlook, custom). 25K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["email", "imap", "smtp", "automation", "universal"], stars: 156, downloads: 25000,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Asleep123 (c63)
  {
    id: "a89", creatorId: "c63", name: "CalDAV Calendar Sync",
    description: "Sync & query CalDAV calendars from AI agents. iCloud, Google Calendar, Fastmail, Nextcloud. Featured on ClawHub homepage.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["calendar", "caldav", "icloud", "google-calendar", "sync"], stars: 134, downloads: 12800,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Rhys Sullivan (c64)
  {
    id: "a90", creatorId: "c64", name: "Answer Overflow",
    description: "Search indexed Discord community discussions via AI. Turn Discord knowledge bases into searchable context. Featured on ClawHub.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["discord", "community", "search", "knowledge", "indexed"], stars: 112, downloads: 9600,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Spiceman161 (c65)
  {
    id: "a91", creatorId: "c65", name: "Playwright MCP Browser",
    description: "Browser automation via Playwright MCP server. Full browser control for AI agents on Linux/macOS/Windows. 23.4K downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["playwright", "browser", "mcp", "automation", "testing"], stars: 189, downloads: 23400,
    apiEndpoint: null, status: "active", featured: false,
  },
  // udiedrichsen (c66)
  {
    id: "a92", creatorId: "c66", name: "Stock Analysis Agent",
    description: "Analyze stocks & cryptocurrencies using Yahoo Finance data. Technical indicators, financials, earnings & charting for AI agents.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["stocks", "yahoo-finance", "crypto", "analysis", "charting"], stars: 98, downloads: 7200,
    apiEndpoint: null, status: "active", featured: false,
  },
  // guogang1024 (c67)
  {
    id: "a93", creatorId: "c67", name: "Session Logs 會話日誌",
    description: "搜索與分析 AI Agent 會話歷史. Search & analyze your agent's session logs. Debug behavior, find patterns & improve over time.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["logging", "debug", "chinese", "analytics", "session"], stars: 56, downloads: 3100,
    apiEndpoint: null, status: "active", featured: false,
  },
  // Ivan G. Dávila (c68) - 2 agents
  {
    id: "a94", creatorId: "c68", name: "Self-Improving + Proactive Agent",
    description: "Self-reflection + self-criticism + self-learning + self-organizing. Transform AI from task-followers into proactive partners. Cross-platform.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["self-improving", "proactive", "reflection", "learning"], stars: 167, downloads: 12400,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a95", creatorId: "c68", name: "Word / DOCX Creator",
    description: "Create, inspect & edit Microsoft Word documents from AI agents. Full DOCX manipulation on Linux/macOS/Windows.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["docx", "word", "documents", "office", "creation"], stars: 89, downloads: 6800,
    apiEndpoint: null, status: "active", featured: false,
  },
  // --- Batch 4: Smithery, Composio & MCP ecosystem agents ---
  {
    id: "a96", creatorId: "c69", name: "AKShare One MCP",
    description: "Chinese A-share & Hong Kong stock data: real-time prices, historical OHLCV, financial news, sector analysis. 中国A股+港股数据. 5.4K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "a-shares", "hong-kong", "stocks", "real-time", "finance"], stars: 312, downloads: 5400,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a97", creatorId: "c70", name: "China Stock Insights",
    description: "A-shares + Hong Kong stock market intelligence. Sector analysis, financial reports, company fundamentals for AI agents.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "hong-kong", "a-shares", "stocks", "fundamentals"], stars: 145, downloads: 2300,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a98", creatorId: "c71", name: "紫微斗數 & 八字命理 MCP",
    description: "Traditional Chinese astrology computed by AI. Generate Ziwei Doushu (紫微斗數) and Bazi (八字) birth charts. 命理分析 MCP Server. 2.5K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "astrology", "bazi", "ziwei", "metaphysics", "命理"], stars: 267, downloads: 2490,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a99", creatorId: "c72", name: "Pulse CN 中文热搜",
    description: "Real-time trending content from Chinese internet: Weibo热搜, Zhihu热榜, Douyin流量, Bilibili排行. Track what’s viral in China. 1.2K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "trending", "weibo", "zhihu", "douyin", "bilibili"], stars: 198, downloads: 1210,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a100", creatorId: "c73", name: "彩云天气 Caiyun Weather",
    description: "Real-time Chinese city weather data and forecasts. Minute-level precipitation alerts, AQI, UV index. 中国城市天气预报.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "weather", "caiyun", "forecast", "aqi"], stars: 134, downloads: 890,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a101", creatorId: "c74", name: "China Business Registry",
    description: "AI access to Chinese company registration data. Verify businesses, check legal status, shareholders, registered capital. 企业信息查询.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["chinese", "business", "registry", "compliance", "due-diligence"], stars: 112, downloads: 760,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a102", creatorId: "c75", name: "한국투자 코딩도우미 KIS MCP",
    description: "한국투자증권 API coding assistant for Korean stock trading. Place orders, check portfolio, real-time quotes via AI. 8.5K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "stocks", "trading", "korea-investment", "한국투자"], stars: 423, downloads: 8498,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a103", creatorId: "c76", name: "Korea Market Sentinel",
    description: "Korean stock market news, sentiment analysis, daily market snapshots. KOSPI/KOSDAQ monitoring for AI agents. 한국 주식 시장 AI 분석. 2.8K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "stocks", "sentiment", "kospi", "news"], stars: 234, downloads: 2830,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a104", creatorId: "c77", name: "Korean Crypto Exchange MCP",
    description: "Real-time data from Korean crypto exchanges: Upbit, Bithumb, Coinone. Kim Premium tracker, KRW trading pairs, orderbook depth.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "crypto", "upbit", "bithumb", "kim-premium"], stars: 178, downloads: 740,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a105", creatorId: "c78", name: "HK KMB Bus 香港巴士",
    description: "Real-time bus arrival times for Hong Kong KMB/LWB network. Route planning, stop info, ETA. 香港巴士到站時間查詢. 2.5K installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["hong-kong", "transit", "bus", "kmb", "real-time", "香港"], stars: 198, downloads: 2480,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a106", creatorId: "c79", name: "부동산 실거래 Korean Real Estate",
    description: "한국 부동산 실거래 조회: 아파트, 오피스텔, 다세대 transaction data. Seoul/Gyeonggi property prices and trends.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "real-estate", "property", "seoul", "부동산"], stars: 89, downloads: 148,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a107", creatorId: "c80", name: "Korea Tour 한국관광",
    description: "한국 관광 정보 MCP: hotels, attractions, festivals, food recommendations. Visit Korea API integration. 881 installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["korean", "travel", "tourism", "korea", "food"], stars: 67, downloads: 881,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a108", creatorId: "c81", name: "Malaysia Transit MCP",
    description: "Bus & train info across 12 Malaysian transit providers: RapidKL, MRT, LRT, KTM, monorail. Real-time schedules. 1K installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["malaysia", "transit", "mrt", "lrt", "kuala-lumpur"], stars: 112, downloads: 1020,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a109", creatorId: "c81", name: "GrabMaps SEA",
    description: "GrabMaps geocoding & routing across 8 Southeast Asian countries. Address lookup, distance/time estimates, route optimization.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["southeast-asia", "grab", "maps", "routing", "geocoding"], stars: 78, downloads: 159,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a110", creatorId: "c82", name: "Bank Negara Malaysia Data",
    description: "Malaysian central bank open data: exchange rates, interest rates, monetary statistics, economic indicators. BNM API. 1.7K installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["malaysia", "finance", "central-bank", "exchange-rates", "economics"], stars: 134, downloads: 1740,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a111", creatorId: "c83", name: "Exa Search",
    description: "Fast semantic web search + content crawling for AI agents. Exa-code injects dev context. 39K installs. Top 3 MCP server globally.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["search", "web", "semantic", "crawling", "developer"], stars: 567, downloads: 39110,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a112", creatorId: "c84", name: "Context7",
    description: "Inject version-specific documentation and code examples into AI prompts. Never get outdated API advice. 14K installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["developer", "documentation", "code", "api", "upstash"], stars: 456, downloads: 14030,
    apiEndpoint: null, status: "active", featured: true,
  },
  {
    id: "a113", creatorId: "c85", name: "Polymarket Predictions",
    description: "Query prediction markets by tags, volume, liquidity. Track elections, sports, crypto event odds. Real-time market data. 5K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["prediction-markets", "polymarket", "elections", "sports", "odds"], stars: 312, downloads: 5060,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a114", creatorId: "c86", name: "Technical Analysis MCP",
    description: "AI-powered technical analysis: RSI, MACD, Bollinger Bands, support/resistance, candlestick patterns. Stocks, crypto, Indian markets.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["trading", "technical-analysis", "rsi", "macd", "india", "crypto"], stars: 234, downloads: 2490,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a115", creatorId: "c87", name: "Financial Modeling Prep",
    description: "Comprehensive market data: stocks, ETFs, crypto, forex. Financial statements, earnings calendars, DCF models, SEC filings. 3.1K installs.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["finance", "stocks", "etf", "forex", "fundamentals", "sec"], stars: 267, downloads: 3110,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a116", creatorId: "c88", name: "AgentMail",
    description: "Email inboxes purpose-built for AI agents. Send, receive, parse emails programmatically. No human inbox needed. 9.6K installs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["email", "agents", "communication", "inbox", "automation"], stars: 389, downloads: 9620,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a117", creatorId: "c89", name: "CALM3 (CyberAgentLM3)",
    description: "State-of-the-art 22B-parameter Japanese instruction-tuned language model for business and creative applications. Top scores on Japanese MT-Bench.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["japanese-llm", "instruction-tuned", "nlp", "chat", "advertising"], stars: 2340, downloads: 18700,
    apiEndpoint: "https://github.com/CyberAgentAILab", status: "active", featured: true,
  },
  {
    id: "a118", creatorId: "c89", name: "LCTG-Bench",
    description: "Benchmark for evaluating Japanese LLM controllability across summarization, ad text generation, and pros/cons tasks.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["benchmark", "japanese-llm", "evaluation", "controlled-generation"], stars: 487, downloads: 2150,
    apiEndpoint: "https://github.com/CyberAgentAILab/LCTG-Bench", status: "active", featured: false,
  },
  {
    id: "a119", creatorId: "c90", name: "Swallow LLM",
    description: "Open Japanese LLMs built via continual pretraining on Llama/Gemma/Qwen base models with 200B Japanese tokens. 2.4M+ downloads.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["japanese-llm", "continual-pretraining", "open-source", "llama", "gemma"], stars: 4120, downloads: 42500,
    apiEndpoint: "https://github.com/tokyotech-llm", status: "active", featured: true,
  },
  {
    id: "a120", creatorId: "c91", name: "llm-jp-eval",
    description: "Comprehensive evaluation framework for Japanese LLMs covering 30+ tasks including reasoning, QA, and code generation.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["evaluation", "japanese-llm", "benchmark", "nlp", "open-source"], stars: 1870, downloads: 8400,
    apiEndpoint: "https://github.com/llm-jp/llm-jp-eval", status: "active", featured: false,
  },
  {
    id: "a121", creatorId: "c91", name: "awesome-japanese-llm",
    description: "Curated living index of all Japanese LLMs, datasets, evaluation tools, and research — the definitive Japanese AI resource.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["japanese-llm", "resource-list", "community", "multilingual"], stars: 3650, downloads: 15200,
    apiEndpoint: "https://github.com/llm-jp/awesome-japanese-llm", status: "active", featured: true,
  },
  {
    id: "a122", creatorId: "c92", name: "Japanese Stable Diffusion",
    description: "Japanese-language fine-tuned Stable Diffusion model that generates photo-realistic images from Japanese text prompts.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["stable-diffusion", "japanese", "text-to-image", "generative-ai", "open-source"], stars: 5230, downloads: 38900,
    apiEndpoint: "https://github.com/rinnakk/japanese-stable-diffusion", status: "active", featured: true,
  },
  {
    id: "a123", creatorId: "c92", name: "Nue ASR",
    description: "High-accuracy automatic speech recognition (ASR) model optimized for the Japanese language. Streaming and batch transcription.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["speech-recognition", "japanese", "asr", "audio", "open-source"], stars: 1240, downloads: 6800,
    apiEndpoint: "https://github.com/rinnakk/nue-asr", status: "active", featured: false,
  },
  {
    id: "a124", creatorId: "c93", name: "VinAgent",
    description: "Comprehensive Agentic AI library integrating tools, memory, workflows, and observability for production AI assistants. Built in Vietnam.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["agentic-ai", "python", "mcp", "observability", "mlflow", "workflow"], stars: 890, downloads: 4300,
    apiEndpoint: "https://github.com/datascienceworld-kan/vinagent", status: "active", featured: false,
  },
  {
    id: "a125", creatorId: "c94", name: "AI Practitioner Handbook",
    description: "Open-source guide and tooling framework for AI/ML practitioners in Singapore covering MLOps, data engineering, and deployment.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["mlops", "ai-practitioner", "singapore", "deployment", "responsible-ai"], stars: 1560, downloads: 7200,
    apiEndpoint: "https://github.com/aisingapore/handbook-staging", status: "active", featured: false,
  },
  {
    id: "a126", creatorId: "c95", name: "MedAgentBoard",
    description: "Benchmark evaluating multi-agent AI collaboration vs. single LLMs on diverse medical tasks including VQA, EHR prediction, and clinical workflows.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["medical-ai", "benchmark", "multi-agent", "ehr", "clinical-nlp", "healthcare"], stars: 720, downloads: 3100,
    apiEndpoint: "https://github.com/yhzhu99/MedAgentBoard", status: "active", featured: false,
  },
  {
    id: "a127", creatorId: "c96", name: "AI Diagnostic Assistant",
    description: "Multi-agent diagnostic system for healthcare professionals in remote/underserved areas using Google Gemini and CrewAI.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["healthcare", "diagnostic-ai", "crewai", "gemini", "remote-health", "streamlit"], stars: 340, downloads: 1800,
    apiEndpoint: "https://github.com/SrujanPR/AI-Diagnostic-Assistant", status: "active", featured: false,
  },
  {
    id: "a128", creatorId: "c97", name: "DeepTutor",
    description: "AI-powered personalized learning assistant with multi-agent problem solving, exam generation, and knowledge graph integration. By HKU.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["education", "tutoring", "rag", "knowledge-graph", "multi-agent", "learning"], stars: 2780, downloads: 12400,
    apiEndpoint: "https://github.com/HKUDS/DeepTutor", status: "active", featured: true,
  },
  {
    id: "a129", creatorId: "c98", name: "awesome-ai-llm4education",
    description: "Curated research collection and multi-agent tutoring framework for AI in education. WWW 2025 Oral paper on goal-oriented learning.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["education-ai", "intelligent-tutoring", "multi-agent", "llm", "adaptive-learning"], stars: 1450, downloads: 5600,
    apiEndpoint: "https://github.com/GeminiLight/awesome-ai-llm4education", status: "active", featured: false,
  },
  {
    id: "a130", creatorId: "c99", name: "MusicGPT",
    description: "Cross-platform app for generating music from natural language prompts using local AI models. 30MB Rust binary, no Python required.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["music-generation", "text-to-music", "local-ai", "rust", "cross-platform", "musicgen"], stars: 3890, downloads: 21300,
    apiEndpoint: "https://github.com/gabotechs/MusicGPT", status: "active", featured: true,
  },
  {
    id: "a131", creatorId: "c100", name: "MusicAgent",
    description: "Multi-agent system that composes complete songs in Sonic Pi using generative AI for structure, arrangement, and lyrics.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["music-composition", "multi-agent", "sonic-pi", "generative-ai", "lyrics"], stars: 670, downloads: 2900,
    apiEndpoint: "https://github.com/janvanwassenhove/MusicAgent", status: "active", featured: false,
  },
  {
    id: "a132", creatorId: "c101", name: "PR-Agent",
    description: "Open-source AI-powered pull request reviewer with automated review, description, and code improvement for GitHub, GitLab, Bitbucket, Azure DevOps.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["code-review", "pull-request", "github-actions", "devops", "open-source", "ai-reviewer"], stars: 8450, downloads: 47200,
    apiEndpoint: "https://github.com/qodo-ai/pr-agent", status: "active", featured: true,
  },
  {
    id: "a133", creatorId: "c102", name: "RepoAgent",
    description: "LLM-powered agent that auto-generates and maintains repository-level code documentation by analyzing AST structure and tracking Git changes.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["documentation", "code-analysis", "ast", "git", "developer-productivity", "llm"], stars: 2130, downloads: 9800,
    apiEndpoint: "https://github.com/OpenBMB/RepoAgent", status: "active", featured: false,
  },
  {
    id: "a134", creatorId: "c103", name: "Enthusiast",
    description: "Production-ready agentic AI framework for e-commerce with RAG, catalog enrichment, and integrations for Shopify, Medusa, Shopware, Solidus.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["e-commerce", "rag", "catalog-enrichment", "shopify", "medusa", "agentic-ai"], stars: 1670, downloads: 7400,
    apiEndpoint: "https://github.com/upsidelab/enthusiast", status: "active", featured: false,
  },
  {
    id: "a135", creatorId: "c104", name: "SemiKong",
    description: "World's first open-source semiconductor industry LLM — adopted by Tokyo Electron, reducing troubleshooting time by 30%. AAAI 2025.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["domain-llm", "semiconductor", "manufacturing", "industrial-ai", "aaai-2025"], stars: 4560, downloads: 19800,
    apiEndpoint: "https://github.com/aitomatic/semikong", status: "active", featured: true,
  },
  {
    id: "a136", creatorId: "c104", name: "ProSEA",
    description: "Multi-agent finance reasoning framework achieving 93.2% accuracy on FinanceBench, outperforming LlamaIndex RAG and LangChain ReAct.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["finance", "multi-agent", "reasoning", "domain-expert", "financebench"], stars: 1890, downloads: 5200,
    apiEndpoint: "https://nguyennm1024.github.io", status: "active", featured: false,
  },
  {
    id: "a137", creatorId: "c105", name: "Japanese LM Financial Evaluation Harness",
    description: "Evaluation framework benchmarking Japanese LLMs on financial domain tasks including CPA, securities sales, and business accounting exams.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["japanese-llm", "finance", "evaluation", "benchmark", "cpa", "compliance"], stars: 980, downloads: 4100,
    apiEndpoint: "https://github.com/pfnet-research/japanese-lm-fin-harness", status: "active", featured: false,
  },
  {
    id: "a138", creatorId: "c106", name: "Multi-Agent Shogun",
    description: "Samurai-inspired system orchestrating multiple AI coding CLI agents — Claude Code, Gemini CLI, Codex — like a feudal army tackling a codebase.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "coding-agent", "claude-code", "gemini-cli", "developer-productivity", "japanese"], stars: 2340, downloads: 11500,
    apiEndpoint: "https://github.com/yohey-w/multi-agent-shogun", status: "active", featured: false,
  },
  {
    id: "a139", creatorId: "c107", name: "Dify",
    description: "Production-ready platform for agentic workflow development — combines RAG pipelines, agent capabilities, visual workflow builder, and LLMOps in one place.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["workflow", "RAG", "LLMOps", "agent", "no-code"], stars: 125000, downloads: 517234,
    apiEndpoint: "https://github.com/langgenius/dify", status: "active", featured: true,
  },
  {
    id: "a140", creatorId: "c108", name: "RAGFlow",
    description: "Leading open-source RAG engine fusing deep document understanding with agent capabilities to create a superior context layer for LLMs.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["RAG", "document-understanding", "enterprise", "agent"], stars: 71500, downloads: 245848,
    apiEndpoint: "https://github.com/infiniflow/ragflow", status: "active", featured: true,
  },
  {
    id: "a141", creatorId: "c109", name: "MetaGPT",
    description: "Multi-agent framework where GPTs play different software company roles to collaboratively complete one-line requirements into full software deliverables.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["multi-agent", "code-generation", "SOP", "software-company"], stars: 60200, downloads: 453465,
    apiEndpoint: "https://github.com/FoundationAgents/MetaGPT", status: "active", featured: true,
  },
  {
    id: "a142", creatorId: "c110", name: "CAMEL",
    description: "First and best multi-agent framework using role-playing and inception prompting to study cooperative behaviors of large-scale agent societies.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["multi-agent", "role-playing", "research", "LLM"], stars: 16400, downloads: 113953,
    apiEndpoint: "https://github.com/camel-ai/camel", status: "active", featured: false,
  },
  {
    id: "a143", creatorId: "c110", name: "OWL",
    description: "Optimized Workforce Learning — cutting-edge multi-agent collaboration framework for real-world task automation, ranked #1 open-source on GAIA benchmark.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["multi-agent", "task-automation", "GAIA", "workforce"], stars: 18200, downloads: 79146,
    apiEndpoint: "https://github.com/camel-ai/owl", status: "active", featured: false,
  },
  {
    id: "a144", creatorId: "c111", name: "DeerFlow",
    description: "Community-driven deep research framework combining LLMs with web search, crawling, and Python execution to produce comprehensive research reports.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["deep-research", "web-search", "multi-agent", "report-generation"], stars: 17700, downloads: 85087,
    apiEndpoint: "https://github.com/bytedance/deer-flow", status: "active", featured: false,
  },
  {
    id: "a145", creatorId: "c111", name: "FlowGram",
    description: "Extensible workflow development framework with built-in canvas, form, and variable tooling to help developers build AI workflow platforms faster.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["workflow", "canvas", "framework", "low-code"], stars: 7100, downloads: 30047,
    apiEndpoint: "https://github.com/bytedance/flowgram.ai", status: "active", featured: false,
  },
  {
    id: "a146", creatorId: "c112", name: "Coze Studio",
    description: "All-in-one visual AI agent development platform for creating, debugging, and deploying agents with no-code/low-code tools.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["agent-platform", "no-code", "visual", "workflow"], stars: 18600, downloads: 48693,
    apiEndpoint: "https://github.com/coze-dev/coze-studio", status: "active", featured: false,
  },
  {
    id: "a147", creatorId: "c112", name: "Coze Loop",
    description: "Next-generation AI agent optimization platform providing full lifecycle management from development and debugging to evaluation and monitoring.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["LLMOps", "evaluation", "monitoring", "prompt-engineering"], stars: 5000, downloads: 27305,
    apiEndpoint: "https://github.com/coze-dev/coze-loop", status: "active", featured: false,
  },
  {
    id: "a148", creatorId: "c113", name: "Qwen-Agent",
    description: "Agent framework and applications built on Qwen 3.0, featuring Function Calling, MCP, Code Interpreter, RAG, and Chrome extension.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["agent-framework", "function-calling", "MCP", "RAG", "code-interpreter"], stars: 7000, downloads: 38244,
    apiEndpoint: "https://github.com/QwenLM/Qwen-Agent", status: "active", featured: false,
  },
  {
    id: "a149", creatorId: "c113", name: "Qwen Code",
    description: "Open-source AI coding agent that lives in your terminal, optimized for Qwen3-Coder to understand large codebases and automate tedious work.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["coding-agent", "terminal", "codebase", "automation"], stars: 3500, downloads: 10999,
    apiEndpoint: "https://github.com/QwenLM/qwen-code", status: "active", featured: false,
  },
  {
    id: "a150", creatorId: "c114", name: "node-DeepResearch",
    description: "Iterative deep research agent that keeps searching and reasoning across webpages until it finds a concise, correct answer — not a long report generator.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["deep-research", "search", "reasoning", "web-reading"], stars: 4800, downloads: 17400,
    apiEndpoint: "https://github.com/jina-ai/node-DeepResearch", status: "active", featured: false,
  },
  {
    id: "a151", creatorId: "c114", name: "Reader",
    description: "Convert any URL to LLM-friendly Markdown input via r.jina.ai — free API for grounding LLMs with web content.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["web-reader", "LLM-grounding", "URL-to-markdown", "API"], stars: 9700, downloads: 43227,
    apiEndpoint: "https://github.com/jina-ai/reader", status: "active", featured: false,
  },
  {
    id: "a152", creatorId: "c115", name: "LobeChat",
    description: "Modern open-source AI agent workspace with multi-provider support (OpenAI/Claude/Gemini/Ollama), knowledge base RAG, artifacts, and one-click MCP marketplace.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["AI-chat", "multi-model", "RAG", "MCP", "agent-workspace"], stars: 69400, downloads: 430085,
    apiEndpoint: "https://github.com/lobehub/lobe-chat", status: "active", featured: true,
  },
  {
    id: "a153", creatorId: "c116", name: "FastGPT",
    description: "Knowledge-based platform built on LLMs offering data processing, RAG retrieval, and visual AI workflow orchestration for deploying complex QA systems.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["RAG", "knowledge-base", "workflow", "QA", "orchestration"], stars: 27400, downloads: 125993,
    apiEndpoint: "https://github.com/labring/FastGPT", status: "active", featured: true,
  },
  {
    id: "a154", creatorId: "c117", name: "DB-GPT",
    description: "AI-native data app development framework with AWEL (Agentic Workflow Expression Language), Text2SQL, RAG, and multi-agent collaboration for building data intelligence apps.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["Text2SQL", "RAG", "AWEL", "data-apps", "multi-agent"], stars: 17500, downloads: 41917,
    apiEndpoint: "https://github.com/eosphoros-ai/DB-GPT", status: "active", featured: false,
  },
  {
    id: "a155", creatorId: "c118", name: "agentUniverse",
    description: "LLM multi-agent framework from Ant Group's financial AI practices, providing collaborative pattern components and domain-expert-level agent building.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "finance", "enterprise", "collaboration"], stars: 1800, downloads: 13946,
    apiEndpoint: "https://github.com/agentuniverse-ai/agentUniverse", status: "active", featured: false,
  },
  {
    id: "a156", creatorId: "c119", name: "TaskingAI",
    description: "Open-source BaaS platform for LLM-based agent development — unifies hundreds of LLM models with tools, RAG, assistants, and conversation history management.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["BaaS", "LLMOps", "RAG", "multi-model", "agent"], stars: 5300, downloads: 26950,
    apiEndpoint: "https://github.com/TaskingAI/TaskingAI", status: "active", featured: false,
  },
  {
    id: "a157", creatorId: "c120", name: "LangBot",
    description: "Production-grade platform for building AI-powered instant messaging bots, connecting LLMs (ChatGPT, DeepSeek, Claude, Gemini, etc.) to QQ, WeChat, Telegram, Discord, Slack, and more.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["chatbot", "messaging", "multi-platform", "LLM", "bot-framework"], stars: 13000, downloads: 69128,
    apiEndpoint: "https://github.com/langbot-app/LangBot", status: "active", featured: false,
  },
  {
    id: "a158", creatorId: "c121", name: "omo (oh-my-openagent)",
    description: "Best-in-class agent harness for OpenCode/Claude Code with multi-model parallel orchestration (Claude, GPT, Gemini, Kimi, GLM), discipline agents, and ultrawork automation.",
    longDescription: null, category: "agent", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["coding-agent", "multi-model", "orchestration", "opencode", "automation"], stars: 41000, downloads: 199669,
    apiEndpoint: "https://github.com/code-yeongyu/oh-my-openagent", status: "active", featured: true,
  },
  {
    id: "a159", creatorId: "c122", name: "OpenHands",
    description: "AI-powered software development platform where agents can modify code, run commands, browse the web, call APIs — everything a human developer can do.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["coding-agent", "software-development", "autonomous", "web-browsing"], stars: 60000, downloads: 222593,
    apiEndpoint: "https://github.com/All-Hands-AI/OpenHands", status: "active", featured: true,
  },
  {
    id: "a160", creatorId: "c123", name: "Mem0",
    description: "Universal memory layer for AI agents — enables multi-level memory (user, session, agent state) with 26% accuracy improvement over OpenAI Memory on benchmarks.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["memory", "personalization", "agents", "long-term-memory", "RAG"], stars: 30000, downloads: 145574,
    apiEndpoint: "https://github.com/mem0ai/mem0", status: "active", featured: true,
  },
  {
    id: "a161", creatorId: "c124", name: "browser-use",
    description: "Makes websites accessible for AI agents — provides intelligent browser automation so AI can interact with any website like a human user.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["browser-automation", "web-agent", "GUI", "task-automation"], stars: 65000, downloads: 180757,
    apiEndpoint: "https://github.com/browser-use/browser-use", status: "active", featured: true,
  },
  {
    id: "a162", creatorId: "c125", name: "Crawl4AI",
    description: "Open-source LLM-friendly web crawler and scraper that turns the web into clean, structured Markdown for RAG, agents, and data pipelines.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["web-crawling", "RAG", "LLM-prep", "data-extraction", "markdown"], stars: 50000, downloads: 385747,
    apiEndpoint: "https://github.com/unclecode/crawl4ai", status: "active", featured: true,
  },
  {
    id: "a163", creatorId: "c126", name: "Open Interpreter",
    description: "Natural language interface for computers — lets LLMs run code (Python, JavaScript, Shell) locally to control files, browsers, data analysis, and more.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["code-execution", "computer-control", "natural-language", "local-LLM"], stars: 60000, downloads: 319387,
    apiEndpoint: "https://github.com/openinterpreter/open-interpreter", status: "active", featured: true,
  },
  {
    id: "a164", creatorId: "c127", name: "Flowise",
    description: "Drag-and-drop UI to build customized LLM flows — visually create AI agents, chatbots, and RAG pipelines using LangChain-compatible nodes.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["low-code", "visual", "LangChain", "RAG", "chatbot-builder"], stars: 42000, downloads: 278748,
    apiEndpoint: "https://github.com/FlowiseAI/Flowise", status: "active", featured: true,
  },
  {
    id: "a165", creatorId: "c128", name: "mcp-upstage",
    description: "Official MCP (Model Context Protocol) server for Upstage AI's Solar LLM and document parsing APIs — enabling AI agents to process, parse, and extract from complex documents.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["MCP", "document-parsing", "Korean-LLM", "Solar", "enterprise"], stars: 200, downloads: 888,
    apiEndpoint: "https://github.com/UpstageAI/mcp-upstage", status: "active", featured: false,
  },
  {
    id: "a166", creatorId: "c129", name: "eliza",
    description: "Autonomous agent platform for everyone — powers Web3 DeFi agents, on-chain trading, and social bots with plugin-based architecture",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["multi-agent", "defi", "web3", "autonomous", "eliza-framework"], stars: 17400, downloads: 132768,
    apiEndpoint: "https://github.com/elizaOS/eliza", status: "active", featured: false,
  },
  {
    id: "a167", creatorId: "c130", name: "solana-agent-kit",
    description: "Open-source toolkit connecting AI agents to Solana protocols — trade tokens, launch tokens, lend assets, bridge cross-chain, and more",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["solana", "defi", "ai-agent", "trading", "nft"], stars: 1500, downloads: 8995,
    apiEndpoint: "https://github.com/sendaifun/solana-agent-kit", status: "active", featured: false,
  },
  {
    id: "a168", creatorId: "c131", name: "freqtrade",
    description: "Free, open source crypto trading bot with ML-powered strategy optimization (FreqAI), backtesting, and support for Binance, Bybit, OKX, Kraken, and more",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["crypto-trading", "trading-bot", "bitcoin", "cryptocurrency", "freqai"], stars: 46400, downloads: 165693,
    apiEndpoint: "https://github.com/freqtrade/freqtrade", status: "active", featured: true,
  },
  {
    id: "a169", creatorId: "c132", name: "hummingbot",
    description: "Open source framework for creating and deploying high-frequency crypto trading bots on CEX and DEX markets, with $34B+ in user trading volume",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["market-making", "trading-bot", "defi", "dex", "hft"], stars: 14900, downloads: 108123,
    apiEndpoint: "https://github.com/hummingbot/hummingbot", status: "active", featured: false,
  },
  {
    id: "a170", creatorId: "c133", name: "mev-boost",
    description: "Allows Ethereum validators to source high-MEV blocks from a competitive builder marketplace — core infrastructure for MEV on Ethereum",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["mev", "ethereum", "validator", "block-building", "pbs"], stars: 1400, downloads: 5545,
    apiEndpoint: "https://github.com/flashbots/mev-boost", status: "active", featured: false,
  },
  {
    id: "a171", creatorId: "c133", name: "simple-arbitrage",
    description: "Example arbitrage bot using Flashbots — demonstrates basic MEV searcher patterns on Ethereum using private tx bundles",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["mev", "arbitrage", "flashbots", "ethereum", "searcher"], stars: 2100, downloads: 13465,
    apiEndpoint: "https://github.com/flashbots/simple-arbitrage", status: "active", featured: false,
  },
  {
    id: "a172", creatorId: "c134", name: "slither",
    description: "Industry-standard static analysis framework for Solidity and Vyper — detects vulnerabilities with low false positives in under 1 second per contract",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["solidity", "static-analysis", "vulnerability-detection", "smart-contracts", "security"], stars: 6000, downloads: 12692,
    apiEndpoint: "https://github.com/crytic/slither", status: "active", featured: false,
  },
  {
    id: "a173", creatorId: "c135", name: "aderyn",
    description: "Rust-based Solidity smart contract static analyzer — integrates into editors for real-time vulnerability detection with AI-powered fix suggestions",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["solidity", "static-analysis", "rust", "smart-contracts", "vscode"], stars: 618, downloads: 2511,
    apiEndpoint: "https://github.com/Cyfrin/aderyn", status: "active", featured: false,
  },
  {
    id: "a174", creatorId: "c136", name: "falcon-metatrust",
    description: "Enhanced fork of Slither with 40+ additional detectors including DeFi-specific price manipulation detection and AI GPTScan engine integration",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["solidity", "static-analysis", "defi-security", "vulnerability-detection", "singapore"], stars: 77, downloads: 313,
    apiEndpoint: "https://github.com/MetaTrustLabs/falcon-metatrust", status: "active", featured: false,
  },
  {
    id: "a175", creatorId: "c136", name: "GPTScan",
    description: "First tool combining GPT with static program analysis for smart contract logic vulnerability detection — achieves 90%+ precision on token contracts (ICSE 2024)",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["gpt", "llm", "smart-contracts", "vulnerability-detection", "defi"], stars: 89, downloads: 312,
    apiEndpoint: "https://github.com/GPTScan/GPTScan", status: "active", featured: false,
  },
  {
    id: "a176", creatorId: "c137", name: "uAgents",
    description: "Python framework for creating autonomous, decentralized AI agents with blockchain integration — supports scheduled tasks and event-driven actions",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["python", "ai-agents", "autonomous", "blockchain", "decentralized"], stars: 1500, downloads: 5122,
    apiEndpoint: "https://github.com/fetchai/uAgents", status: "active", featured: false,
  },
  {
    id: "a177", creatorId: "c138", name: "skipper",
    description: "Example MEV searching bot for the Cosmos ecosystem — captures cyclic arbitrage opportunities across DEXs on Juno, Terra, and Evmos by backrunning trades",
    longDescription: null, category: "agent", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["mev", "cosmos", "arbitrage", "interchain", "python"], stars: 194, downloads: 803,
    apiEndpoint: "https://github.com/skip-mev/skipper", status: "active", featured: false,
  },
  {
    id: "a178", creatorId: "c139", name: "revoke.cash",
    description: "Inspect and revoke all token approvals granted to smart contracts — essential multi-chain security tool protecting wallets from approval-based exploits",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["security", "ethereum", "token-approval", "wallet-safety", "web3"], stars: 736, downloads: 2062,
    apiEndpoint: "https://github.com/RevokeCash/revoke.cash", status: "active", featured: false,
  },
  {
    id: "a179", creatorId: "c140", name: "agentipy",
    description: "Python toolkit empowering AI agents to interact with Solana DeFi apps — supports Jupiter swaps, Raydium, NFT minting via Metaplex, and MCP integration",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["solana", "python", "ai-agent", "defi", "nft"], stars: 249, downloads: 1054,
    apiEndpoint: "https://github.com/niceberginc/agentipy", status: "active", featured: false,
  },
  {
    id: "a180", creatorId: "c141", name: "DefiLlama-Adapters",
    description: "Community-maintained protocol adapters for DeFi TVL tracking — integrate any protocol into the largest open-source DeFi analytics platform",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["defi", "tvl", "blockchain-data", "analytics", "open-source"], stars: 1100, downloads: 5483,
    apiEndpoint: "https://github.com/DefiLlama/DefiLlama-Adapters", status: "active", featured: false,
  },
  {
    id: "a181", creatorId: "c142", name: "intentkit",
    description: "Open framework for building AI agents with powerful Web3 skills — enables natural language DeFi interactions via Brian's intent API",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["web3", "ai-agent", "defi", "intent-based", "python"], stars: 6400, downloads: 19357,
    apiEndpoint: "https://github.com/crestalnetwork/intentkit", status: "active", featured: false,
  },
  {
    id: "a182", creatorId: "c142", name: "xenon-agents",
    description: "Multi-agent DeFi trading system with Observer, Task Manager, and Executor agents — executes real on-chain DeFi transactions autonomously without human approval",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["multi-agent", "defi", "autonomous", "trading", "on-chain"], stars: 14, downloads: 92,
    apiEndpoint: "https://github.com/brian-knows/xenon-agents", status: "active", featured: false,
  },
  {
    id: "a183", creatorId: "c143", name: "aura",
    description: "Personal AI agent framework analyzing Ethereum/L2 on-chain activity to generate personalized DeFi recommendations and execute strategies via account abstraction",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["ai-agent", "defi", "on-chain", "account-abstraction", "llm"], stars: 19, downloads: 90,
    apiEndpoint: "https://github.com/AmbireTech/aura", status: "active", featured: false,
  },
  {
    id: "a184", creatorId: "c144", name: "cross-chain-monitoring",
    description: "Cross-chain bridge monitoring tool built on Flipside Crypto data — tracks asset flows, bridge volumes, and cross-chain transaction patterns via Streamlit dashboard",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["cross-chain", "bridge", "monitoring", "blockchain-data", "analytics"], stars: 59, downloads: 166,
    apiEndpoint: "https://github.com/alitaslimi/cross-chain-monitoring", status: "active", featured: false,
  },
  {
    id: "a185", creatorId: "c145", name: "crypto-ai-agents-with-amazon-bedrock",
    description: "Supervisor-collaborator multi-agent architecture on Amazon Bedrock for crypto analysis — monitors token prices, queries on-chain data, and submits blockchain transactions",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["amazon-bedrock", "multi-agent", "blockchain", "crypto-analysis", "aws"], stars: 25, downloads: 68,
    apiEndpoint: "https://github.com/aws-samples/crypto-ai-agents-with-amazon-bedrock", status: "active", featured: false,
  },
  {
    id: "a186", creatorId: "c146", name: "Web3-Security-Tools",
    description: "Comprehensive curated list of Web3 security tools covering wallet security, static analysis, DeFi monitoring, on-chain investigation, and smart contract auditing",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["web3-security", "smart-contracts", "wallet-safety", "defi", "audit-tools"], stars: 433, downloads: 2580,
    apiEndpoint: "https://github.com/Quillhash/Web3-Security-Tools", status: "active", featured: false,
  },
  {
    id: "a187", creatorId: "c147", name: "defipy",
    description: "First unified Python SDK for DeFi analytics, simulation, and autonomous agents — modular architecture for Uniswap/Balancer analytics and agentic DeFi strategies",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["defi", "python", "analytics", "simulation", "uniswap"], stars: 14, downloads: 34,
    apiEndpoint: "https://github.com/defipy-devs/defipy", status: "active", featured: false,
  },
  {
    id: "a188", creatorId: "c148", name: "Smart-Contract-Auditor-Tools-and-Techniques",
    description: "Comprehensive reference list of smart contract auditor tools, static analyzers, on-chain investigation tools, DeFi governance analysis resources, and AI audit approaches",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["smart-contract-audit", "security-tools", "solidity", "ethereum", "defi"], stars: 738, downloads: 3139,
    apiEndpoint: "https://github.com/shanzson/Smart-Contract-Auditor-Tools-and-Techniques", status: "active", featured: false,
  },
  {
    id: "a189", creatorId: "c149", name: "Nex-T1-Research",
    description: "Multi-agent orchestration framework for autonomous DeFi trading — combines market observation, strategy planning, and execution agents for on-chain trading",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["multi-agent", "defi", "autonomous-trading", "orchestration", "research"], stars: 1, downloads: 7,
    apiEndpoint: "https://github.com/Nexis-AI/Nex-T1-Research", status: "active", featured: false,
  },
  {
    id: "a190", creatorId: "c150", name: "SenseAI",
    description: "AI agent framework for Solana token analysis — combines ML models, on-chain metrics, whale tracking, and portfolio risk management for Pump.fun and Solana tokens",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["solana", "token-analysis", "ml", "portfolio", "pump-fun"], stars: 16, downloads: 42,
    apiEndpoint: "https://github.com/TheSenseAI/SenseAI", status: "active", featured: false,
  },
  {
    id: "a191", creatorId: "c151", name: "manager-ai-agent",
    description: "AI-powered social agent integrating Aptos wallet operations, on-chain data analysis, and automated social media posting to drive Web3 community growth",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["aptos", "web3", "ai-agent", "social-media", "on-chain-data"], stars: 370, downloads: 1533,
    apiEndpoint: "https://github.com/FogMeta/manager-ai-agent", status: "active", featured: false,
  },
  {
    id: "a192", creatorId: "c152", name: "Vanna",
    description: "Chat with your SQL database — accurate Text-to-SQL generation via LLMs using agentic RAG retrieval, supporting any database and LLM provider.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["text-to-sql", "rag", "sql", "llm", "data-visualization"], stars: 23011, downloads: 46404,
    apiEndpoint: "https://github.com/vanna-ai/vanna", status: "active", featured: true,
  },
  {
    id: "a193", creatorId: "c153", name: "PandasAI",
    description: "Chat with your database or datalake (SQL, CSV, parquet) — makes data analysis conversational using LLMs and RAG with chart generation support.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["pandas", "data-analysis", "text-to-sql", "visualization", "llm"], stars: 23352, downloads: 183654,
    apiEndpoint: "https://github.com/sinaptik-ai/pandas-ai", status: "active", featured: true,
  },
  {
    id: "a194", creatorId: "c154", name: "Wren AI",
    description: "Open-source GenBI agent that queries any database in natural language, generates accurate SQL (Text-to-SQL), charts (Text-to-Chart), and AI-powered BI insights in seconds.",
    longDescription: null, category: "agent", pricing: "subscription", price: 4900, currency: "USD",
    tags: ["text-to-sql", "text-to-chart", "genbi", "rag", "business-intelligence"], stars: 14636, downloads: 38903,
    apiEndpoint: "https://github.com/Canner/WrenAI", status: "active", featured: false,
  },
  {
    id: "a195", creatorId: "c155", name: "Chat2DB",
    description: "AI-driven universal SQL client and database reporting tool with natural language to SQL, supporting 16+ databases including MySQL, PostgreSQL, Oracle, and Redis.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["text-to-sql", "database-management", "sql-client", "ai", "mysql"], stars: 25240, downloads: 186166,
    apiEndpoint: "https://github.com/CodePhiliaX/Chat2DB", status: "active", featured: true,
  },
  {
    id: "a196", creatorId: "c156", name: "PyGWalker",
    description: "Python library that turns pandas DataFrames into an interactive UI for visual analysis — a Tableau alternative supporting drag-and-drop and natural language queries.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["data-visualization", "pandas", "tableau-alternative", "exploratory-data-analysis", "jupyter"], stars: 15689, downloads: 74657,
    apiEndpoint: "https://github.com/Kanaries/pygwalker", status: "active", featured: false,
  },
  {
    id: "a197", creatorId: "c157", name: "LIDA",
    description: "Automatic generation of data visualizations and infographics using LLMs — grammar-agnostic, supports matplotlib, seaborn, altair, d3, and multiple LLM providers.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["data-visualization", "llm", "chart-generation", "infographics", "openai"], stars: 3226, downloads: 24966,
    apiEndpoint: "https://github.com/microsoft/lida", status: "active", featured: false,
  },
  {
    id: "a198", creatorId: "c158", name: "Dataherald",
    description: "Natural language-to-SQL engine built for enterprise-level question answering over relational data — set up an API from your database that answers questions in plain English.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["text-to-sql", "enterprise", "nl-to-sql", "rag", "llm"], stars: 3623, downloads: 8939,
    apiEndpoint: "https://github.com/Dataherald/dataherald", status: "active", featured: false,
  },
  {
    id: "a199", creatorId: "c159", name: "mage-ai",
    description: "Build, run, and manage data pipelines for integrating and transforming data — supports Python, SQL, R with a modular notebook-style UI for ETL/ELT workflows.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["etl", "elt", "data-pipelines", "orchestration", "sql"], stars: 8676, downloads: 64138,
    apiEndpoint: "https://github.com/mage-ai/mage-ai", status: "active", featured: false,
  },
  {
    id: "a200", creatorId: "c160", name: "DB-GPT (D-Bot)",
    description: "LLM-based personal database administrator that reads documents, uses tools, and writes analysis reports for diagnosing database performance and anomaly issues.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["database", "dba", "diagnosis", "llm", "tuning"], stars: 700, downloads: 3076,
    apiEndpoint: "https://github.com/TsinghuaDatabaseGroup/DB-GPT", status: "active", featured: false,
  },
  {
    id: "a201", creatorId: "c161", name: "GreptimeDB",
    description: "Open-source Observability 2.0 database replacing Prometheus, Loki, and Elasticsearch — unified engine for metrics, logs, and traces with LLM monitoring and AI observability features.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["observability", "metrics", "logs", "ai-observability", "llm-monitoring"], stars: 6047, downloads: 14614,
    apiEndpoint: "https://github.com/GreptimeTeam/greptimedb", status: "active", featured: false,
  },
  {
    id: "a202", creatorId: "c162", name: "dbt-llm-agent (Ragstar)",
    description: "LLM-based AI agent to automate data analysis for dbt projects with remote MCP server — connects to dbt Cloud, builds knowledge from models, and answers questions in plain English.",
    longDescription: null, category: "agent", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["dbt", "text-to-sql", "data-analyst", "llm", "mcp"], stars: 168, downloads: 778,
    apiEndpoint: "https://github.com/pragunbhutani/dbt-llm-agent", status: "active", featured: false,
  },
  {
    id: "a203", creatorId: "c163", name: "E2B Code Interpreter",
    description: "Python & JS/TS SDK for running AI-generated code in secure isolated sandboxes — powers AI data analysis, Jupyter notebook execution, and code interpretation in LLM apps.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["code-interpreter", "sandbox", "jupyter", "data-analysis", "llm"], stars: 2250, downloads: 4706,
    apiEndpoint: "https://github.com/e2b-dev/code-interpreter", status: "active", featured: false,
  },
  {
    id: "a204", creatorId: "c164", name: "Langfuse",
    description: "Open-source LLM engineering platform with observability, metrics, evaluations, prompt management, and playground — integrates with OpenTelemetry, LangChain, and OpenAI SDK.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["llm-observability", "monitoring", "evaluation", "analytics", "openai"], stars: 23348, downloads: 154781,
    apiEndpoint: "https://github.com/langfuse/langfuse", status: "active", featured: true,
  },
  {
    id: "a205", creatorId: "c165", name: "AI Data Science Team",
    description: "Python library of AI-powered data science agents for SQL querying, exploratory data analysis, and machine learning workflows — 10X faster data science tasks.",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["data-science", "sql-agent", "eda", "machine-learning", "pandas"], stars: 3200, downloads: 18993,
    apiEndpoint: "https://github.com/business-science/ai-data-science-team", status: "active", featured: false,
  },
  {
    id: "a206", creatorId: "c166", name: "k8sgpt",
    description: "Scan Kubernetes clusters, diagnose issues in plain English, and triage problems with SRE experience codified into analyzers — integrates with OpenAI, Azure, Gemini, and local models.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["kubernetes", "ai", "sre", "devops", "diagnosis"], stars: 7557, downloads: 26231,
    apiEndpoint: "https://github.com/k8sgpt-ai/k8sgpt", status: "active", featured: false,
  },
  {
    id: "a207", creatorId: "c167", name: "kubectl-ai",
    description: "AI-powered Kubernetes assistant that translates user intent into precise Kubernetes operations, supporting Gemini, OpenAI, Vertex AI, Ollama, and local LLM providers.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["kubernetes", "ai", "cli", "assistant", "gemini"], stars: 7361, downloads: 26019,
    apiEndpoint: "https://github.com/GoogleCloudPlatform/kubectl-ai", status: "active", featured: false,
  },
  {
    id: "a208", creatorId: "c168", name: "Karpor",
    description: "Intelligence for Kubernetes — brings advanced Search, Insight, and AI to Kubernetes for natural language operations, contextual AI responses, and multi-cluster visibility.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["kubernetes", "ai-ops", "multi-cluster", "visualization", "cloud-native"], stars: 1682, downloads: 9626,
    apiEndpoint: "https://github.com/KusionStack/karpor", status: "active", featured: false,
  },
  {
    id: "a209", creatorId: "c169", name: "DevOpsGPT",
    description: "Multi-agent system that combines LLM with DevOps tools to convert natural language requirements into working software — supports any development language and extends existing code.",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["devops", "code-generation", "ci-cd", "multi-agent", "llm"], stars: 5966, downloads: 34283,
    apiEndpoint: "https://github.com/kuafuai/DevOpsGPT", status: "active", featured: false,
  },
  {
    id: "a210", creatorId: "c170", name: "Robusta",
    description: "Better Prometheus alerts for Kubernetes — smart grouping, AI enrichment with pod logs and graphs, and automatic remediation for Kubernetes incidents.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["kubernetes", "prometheus", "monitoring", "alerting", "automation"], stars: 2961, downloads: 9632,
    apiEndpoint: "https://github.com/robusta-dev/robusta", status: "active", featured: false,
  },
  {
    id: "a211", creatorId: "c170", name: "KRR (Kubernetes Resource Recommender)",
    description: "Prometheus-based Kubernetes resource recommendations CLI — gathers pod usage data and recommends CPU/memory requests and limits to reduce costs and improve performance.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["kubernetes", "cost-optimization", "prometheus", "rightsizing", "finops"], stars: 4499, downloads: 14012,
    apiEndpoint: "https://github.com/robusta-dev/krr", status: "active", featured: false,
  },
  {
    id: "a212", creatorId: "c171", name: "OpenCost",
    description: "CNCF project for real-time Kubernetes cost monitoring — allocates costs by cluster, namespace, deployment, and service with multi-cloud support and MCP server for AI agents.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["cost-monitoring", "kubernetes", "finops", "prometheus", "cloud-cost"], stars: 6424, downloads: 21345,
    apiEndpoint: "https://github.com/opencost/opencost", status: "active", featured: false,
  },
  {
    id: "a213", creatorId: "c172", name: "AIAC",
    description: "Artificial Intelligence Infrastructure-as-Code Generator — generate Terraform, Kubernetes manifests, CI/CD pipelines, and policy-as-code via OpenAI, Amazon Bedrock, or Ollama.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["terraform", "iac", "kubernetes", "ci-cd", "llm"], stars: 3794, downloads: 14264,
    apiEndpoint: "https://github.com/gofireflyio/aiac", status: "active", featured: false,
  },
  {
    id: "a214", creatorId: "c173", name: "Dagger",
    description: "Automation engine to build, test, and ship any codebase — containerized workflow execution with automatic caching, perfect for AI agents and CI/CD self-healing pipelines.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["ci-cd", "containers", "docker", "devops", "automation"], stars: 15545, downloads: 41485,
    apiEndpoint: "https://github.com/dagger/dagger", status: "active", featured: false,
  },
  {
    id: "a215", creatorId: "c174", name: "CloudQuery",
    description: "Data pipelines for cloud config and security data — extract from AWS, Azure, GCP, and 70+ sources for cloud asset inventory, CSPM, FinOps, and vulnerability management.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["cloud-security", "etl", "aws", "azure", "gcp"], stars: 6342, downloads: 28254,
    apiEndpoint: "https://github.com/cloudquery/cloudquery", status: "active", featured: false,
  },
  {
    id: "a216", creatorId: "c175", name: "kagent",
    description: "Kubernetes-native framework for building AI agents — comes with MCP server with tools for Kubernetes, Istio, Helm, Argo, Prometheus, Grafana, and Cilium.",
    longDescription: null, category: "agent", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["kubernetes", "ai-agents", "mcp", "cloud-native", "devops"], stars: 2362, downloads: 13329,
    apiEndpoint: "https://github.com/kagent-dev/kagent", status: "active", featured: false,
  },
  {
    id: "a217", creatorId: "c176", name: "KAITO",
    description: "Kubernetes AI Toolchain Operator — automates AI/ML model inference and tuning workloads with auto-provisioned GPU nodes, preset configs, and OpenAI-compatible server.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["kubernetes", "ai-inference", "gpu", "operator", "ml-ops"], stars: 893, downloads: 3467,
    apiEndpoint: "https://github.com/kaito-project/kaito", status: "active", featured: false,
  },
  {
    id: "a218", creatorId: "c177", name: "IncidentFox",
    description: "Open-source AI SRE platform for automated incident investigation — correlates alerts, analyzes logs, finds root causes, and integrates with Slack/Teams and 300+ tools.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["incident-response", "ai-sre", "ai-ops", "observability", "devops"], stars: 446, downloads: 1991,
    apiEndpoint: "https://github.com/incidentfox/incidentfox", status: "active", featured: false,
  },
  {
    id: "a219", creatorId: "c178", name: "kubernetes-ai-ops-agent",
    description: "AI-powered assistant enabling natural language interactions with Kubernetes clusters — uses MCP servers for K8s and Prometheus operations with Chainlit web interface.",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["kubernetes", "mcp", "prometheus", "natural-language", "chainlit"], stars: 45, downloads: 133,
    apiEndpoint: "https://github.com/jhzhu89/kubernetes-ai-ops-agent", status: "active", featured: false,
  },
  {
    id: "a220", creatorId: "c179", name: "Pulumi AI",
    description: "Create cloud infrastructure with Pulumi using natural language prompts — generates Pulumi IaC code for AWS, Azure, GCP, and Kubernetes across 120+ providers.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["infrastructure-as-code", "cloud", "ai-generator", "aws", "kubernetes"], stars: 231, downloads: 1681,
    apiEndpoint: "https://github.com/pulumi/pulumi-ai", status: "active", featured: false,
  },
  {
    id: "a221", creatorId: "c180", name: "GenAI Agents",
    description: "Comprehensive tutorial repository for building GenAI agents from basic to advanced — includes data analysis agents, SQL querying agents, multi-agent collaboration, and production workflows.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["ai-agents", "data-analysis", "langchain", "langgraph", "llm"], stars: 20629, downloads: 103479,
    apiEndpoint: "https://github.com/NirDiamant/GenAI_Agents", status: "active", featured: true,
  },
  {
    id: "a222", creatorId: "c181", name: "Keptn",
    description: "Event-based control plane for continuous delivery and automated operations in Kubernetes — SLO-driven multi-stage delivery with automated remediation and observability.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["ci-cd", "kubernetes", "slo", "devops", "cloud-native"], stars: 2300, downloads: 11043,
    apiEndpoint: "https://github.com/keptn/keptn", status: "active", featured: false,
  },
  {
    id: "a223", creatorId: "c182", name: "AstrBot",
    description: "Open-source all-in-one agentic chatbot platform integrating 18+ IM apps (WeChat, QQ, Feishu, DingTalk, Telegram, Discord) with any LLM, featuring plugins, RAG, TTS/STT, and an agent sandbox.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["chatbot", "WeChat", "QQ", "Feishu", "DingTalk", "multi-platform"], stars: 25700, downloads: 155565,
    apiEndpoint: "https://github.com/AstrBotDevs/AstrBot", status: "active", featured: true,
  },
  {
    id: "a224", creatorId: "c183", name: "LangBot",
    description: "Production-grade platform for building AI-powered IM bots across QQ, WeChat, LINE, Feishu, DingTalk, Discord, Telegram and more — with built-in RAG, plugin system, and web management panel.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["chatbot", "WeChat", "QQ", "LINE", "Feishu", "DingTalk"], stars: 14600, downloads: 97452,
    apiEndpoint: "https://github.com/langbot-app/LangBot", status: "active", featured: false,
  },
  {
    id: "a225", creatorId: "c184", name: "Wechaty",
    description: "Conversational RPA SDK for chatbot makers — build a bot in 6 lines of JS/Python/Go/Java across WhatsApp, WeChat, WeCom, Gitter, LINE, Lark, and more.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["WeChat", "WhatsApp", "RPA", "chatbot", "multi-platform", "SDK"], stars: 22200, downloads: 144507,
    apiEndpoint: "https://github.com/wechaty/wechaty", status: "active", featured: true,
  },
  {
    id: "a226", creatorId: "c184", name: "python-wechaty",
    description: "Python SDK for Wechaty — a modern Conversational RPA SDK for chatbot makers to build WeChat/WhatsApp bots in Python with just a few lines of code.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["WeChat", "Python", "chatbot", "RPA", "SDK"], stars: 1800, downloads: 11480,
    apiEndpoint: "https://github.com/wechaty/python-wechaty", status: "active", featured: false,
  },
  {
    id: "a227", creatorId: "c185", name: "linebot-gemini-python",
    description: "A LINE bot using Google Vertex AI Gemini models via LangChain — handles text and image input, answers in Traditional Chinese, built with FastAPI.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["LINE", "Gemini", "LangChain", "Taiwan", "Traditional Chinese", "FastAPI"], stars: 10, downloads: 45,
    apiEndpoint: "https://github.com/kkdai/linebot-gemini-python", status: "active", featured: false,
  },
  {
    id: "a228", creatorId: "c185", name: "linebot-langchain",
    description: "LINE bot integrated with LangChain in Python — assists with stock price queries and conversational AI via the LINE Messaging API.",
    longDescription: null, category: "tool", pricing: "one-time", price: 490, currency: "USD",
    tags: ["LINE", "LangChain", "stock", "Taiwan", "Python"], stars: 44, downloads: 215,
    apiEndpoint: "https://github.com/kkdai/linebot-langchain", status: "active", featured: false,
  },
  {
    id: "a229", creatorId: "c186", name: "line-bot-sdk-python",
    description: "Official LINE Messaging API SDK for Python — makes it easy to develop bots for LINE with a sample bot buildable in minutes.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["LINE", "SDK", "Python", "bot", "messaging", "Japan"], stars: 2000, downloads: 11597,
    apiEndpoint: "https://github.com/line/line-bot-sdk-python", status: "active", featured: false,
  },
  {
    id: "a230", creatorId: "c187", name: "MoneyPrinterTurbo",
    description: "Generate high-definition short videos with one click using AI LLM — auto-generates video copy, materials, subtitles, and background music from a single topic or keyword. Supports TikTok vertical format.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["AI video", "short video", "TikTok", "subtitles", "Chinese", "content creation"], stars: 48100, downloads: 296426,
    apiEndpoint: "https://github.com/harry0703/MoneyPrinterTurbo", status: "active", featured: true,
  },
  {
    id: "a231", creatorId: "c188", name: "Postiz",
    description: "The ultimate open-source social media scheduling tool with AI features — schedule posts across 25+ platforms, manage content calendars, and automate publishing with AI assistance.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["social media", "scheduling", "AI", "Twitter", "LinkedIn", "Instagram"], stars: 27400, downloads: 57082,
    apiEndpoint: "https://github.com/gitroomhq/postiz-app", status: "active", featured: true,
  },
  {
    id: "a232", creatorId: "c189", name: "social-media-agent",
    description: "An agent for sourcing, curating, and scheduling social media posts with human-in-the-loop — takes a URL and generates Twitter & LinkedIn posts using LangGraph and Anthropic.",
    longDescription: null, category: "agent", pricing: "free", price: null, currency: "USD",
    tags: ["social media", "Twitter", "LinkedIn", "LangGraph", "content generation", "scheduling"], stars: 1500, downloads: 7444,
    apiEndpoint: "https://github.com/langchain-ai/social-media-agent", status: "active", featured: false,
  },
  {
    id: "a233", creatorId: "c190", name: "Inbox Zero",
    description: "Open-source AI personal assistant for email — organizes inbox, pre-drafts replies, tracks follow-ups, and helps reach inbox zero fast. Alternative to Fyxer, supports Gmail and Outlook.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["email", "AI assistant", "productivity", "Gmail", "inbox management", "automation"], stars: 10257, downloads: 65957,
    apiEndpoint: "https://github.com/elie222/inbox-zero", status: "active", featured: false,
  },
  {
    id: "a234", creatorId: "c191", name: "ALwrity",
    description: "AI-powered digital marketing platform for solopreneurs — generates blog posts, LinkedIn/Facebook content, SEO metadata, images, and conducts competitor analysis using AI agent teams.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["AI writing", "SEO", "content marketing", "social media", "blog writing", "digital marketing"], stars: 585, downloads: 4031,
    apiEndpoint: "https://github.com/AJaySi/ALwrity", status: "active", featured: false,
  },
  {
    id: "a235", creatorId: "c192", name: "python-seo-analyzer",
    description: "Modern SEO and GEO analysis tool — crawls sites, counts words, identifies technical SEO issues, and uses AI to evaluate content expertise signals, conversational engagement, and cross-platform presence.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["SEO", "technical SEO", "AI", "GEO", "site analysis", "Python"], stars: 1400, downloads: 8592,
    apiEndpoint: "https://github.com/sethblack/python-seo-analyzer", status: "active", featured: false,
  },
  {
    id: "a236", creatorId: "c193", name: "Huginn",
    description: "Create agents that monitor and act on your behalf — watches the web, monitors social media (Twitter/X), watches for events, and triggers automated actions like notifications, emails, or webhooks.",
    longDescription: null, category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["social monitoring", "automation", "Twitter", "monitoring", "notifications", "self-hosted"], stars: 47800, downloads: 125780,
    apiEndpoint: "https://github.com/huginn/huginn", status: "active", featured: true,
  },
  {
    id: "a237", creatorId: "c194", name: "InstaPy",
    description: "Instagram automation tooling to 'farm' likes, comments, and followers — implemented in Python using Selenium with smart filters, follow/unfollow automation, and comment targeting.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["Instagram", "automation", "bot", "social media", "Python", "Selenium"], stars: 17600, downloads: 91389,
    apiEndpoint: "https://github.com/InstaPy/InstaPy", status: "active", featured: false,
  },
  {
    id: "a238", creatorId: "c195", name: "SocialAutonomies",
    description: "Open-source Twitter/X AI agent platform — post-tweet, schedule-tweet, auto-reply, and auto-engage using X API and browser cookies with support for OpenAI, Claude, DeepSeek, and OpenRouter.",
    longDescription: null, category: "agent", pricing: "one-time", price: 900, currency: "USD",
    tags: ["Twitter", "X", "AI agent", "automation", "social media", "LLM"], stars: 19, downloads: 127,
    apiEndpoint: "https://github.com/Prem95/socialautonomies", status: "active", featured: false,
  },
  {
    id: "a239", creatorId: "c196", name: "bilibili-comment-analyzer",
    description: "Professional Bilibili comment analysis desktop app — visualizes geographic distribution heatmaps, word clouds, sentiment trends, and audience demographics for content creators and researchers.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["Bilibili", "social analytics", "sentiment analysis", "Chinese", "data visualization", "content creator"], stars: 117, downloads: 272,
    apiEndpoint: "https://github.com/sansan0/bilibili-comment-analyzer", status: "active", featured: false,
  },
]

const SEED_POSTS = [
  {
    id: "p1", creatorId: "c8", title: "如何用 AI Agent 處理中文 NLP 的五大挑戰",
    body: `# 如何用 AI Agent 處理中文 NLP 的五大挑戰\n\n中文自然語言處理一直是 AI 領域的難題。從分詞到語義理解，每一步都充滿挑戰。\n\n## 1. 分詞 (Tokenization)\n\n不同於英文用空格分隔，中文需要智能分詞。我們的 Agent 使用混合方法，結合詞典和深度學習模型。\n\n## 2. 粵語與繁體處理\n\n香港和台灣用戶需要繁體中文支援，而粵語的口語化表達更是一大挑戰。我們的模型同時支援普通話、粵語和台灣國語。\n\n## 3. 多語言混用 (Code-Mixing)\n\n亞洲用戶經常在同一句話中混用中英文，例如「這個 API 的 response time 好慢」。我們的 Agent 能自然處理這種混用。\n\n## 4. 情感分析的文化差異\n\n中文表達情感的方式與英文截然不同。「還行吧」在中文裡可能是負面評價，但直譯成英文看起來是中性的。\n\n## 5. 實體識別\n\n中文人名、地名、機構名的識別需要專門的訓練數據。我們已經針對大中華區和東南亞地區的實體進行了優化。\n\n---\n\n想了解更多？訂閱我的頻道獲取每週技術更新。`,
    excerpt: "中文自然語言處理一直是 AI 領域的難題。從分詞到語義理解，每一步都充滿挑戰...",
    visibility: "public", tags: ["nlp", "chinese", "tutorial"],
    likes: 342, commentCount: 28, createdAt: "2026-03-15T08:00:00Z", featured: true,
  },
  {
    id: "p2", creatorId: "c7", title: "아시아 핀테크 시장에서 AI Agent의 미래 / 亞洲金融科技市場中 AI Agent 的未來",
    body: `# 亞洲金融科技市場中 AI Agent 的未來\n\n亞洲是全球金融科技創新的重鎮。從支付寶到 LINE Pay，從 GrabPay 到八達通，亞洲的支付生態系統遠比西方複雜。\n\n## 為什麼亞洲需要專屬的金融 Agent？\n\n1. **多元支付系統** — 每個市場都有自己的主流支付方式\n2. **跨境合規** — 不同國家的 KYC/AML 要求各不相同\n3. **語言障礙** — 客服 Agent 需要處理多種亞洲語言\n4. **即時支付** — 亞洲用戶期待即時到帳\n\n## PayFlow Asia 的設計理念\n\n我們的 Agent 從一開始就為亞洲市場設計：\n\n- 支援支付寶、微信支付、LINE Pay、PayNow、FPS (轉數快)\n- 內建 KYC 流程適配香港、新加坡、日本、韓國法規\n- 實時匯率轉換和費用計算\n- 粵語和普通話客服 Agent 支援\n\n## 真實案例\n\n一家香港電商平台使用 PayFlow Asia 後：\n- 支付成功率提升 23%\n- 跨境交易處理時間從 3 天縮短到 4 小時\n- 客服工單減少 67%\n\n---\n\n免費試用 PayFlow Asia，體驗亞洲支付的未來。`,
    excerpt: "亞洲是全球金融科技創新的重鎮。從支付寶到 LINE Pay，亞洲的支付生態系統遠比西方複雜...",
    visibility: "public", tags: ["fintech", "asia", "payments"],
    likes: 567, commentCount: 45, createdAt: "2026-03-14T10:30:00Z", featured: true,
  },
  {
    id: "p3", creatorId: "c1", title: "從 Google SRE 到 AI Agent 創業：我的轉型故事",
    body: `# 從 Google SRE 到 AI Agent 創業\n\n三年前我離開了 Google，開始全職開發 AI Agent。很多人問我為什麼，這裡分享一下我的心路歷程。\n\n## 在 Google 的日子\n\n在 Google 做 SRE 的五年，我學到了大規模系統運維的精髓。但我越來越覺得，很多重複性的運維工作完全可以被自動化。\n\n## 為什麼是 Agent？\n\n傳統的自動化腳本是「被動」的 — 你告訴它做什麼，它就做什麼。但 Agent 是「主動」的 — 它能觀察環境、做出判斷、採取行動。\n\nInfraBot 就是這個理念的產物。它不只是監控你的基礎架構，它能理解什麼是異常，分析根因，甚至自動修復。\n\n## 給想創業的工程師的建議\n\n1. **先解決自己的問題** — InfraBot 最初就是我自己用的工具\n2. **MVP 先行** — 不要等功能完美才發布\n3. **社區很重要** — AgentForge 這樣的平台讓獨立開發者也能觸達用戶\n4. **亞洲市場被低估了** — 大量需求還未被滿足\n\n> 「最好的 Agent 是你忘記它存在的那種 — 它安靜地在背景運作，讓你安心睡覺。」\n\n下一篇我會分享 InfraBot 的技術架構。`,
    excerpt: "三年前我離開了 Google，開始全職開發 AI Agent。很多人問我為什麼...這是一個關於從大廠到創業的真實故事。",
    visibility: "subscribers", tags: ["story", "devops", "startup"],
    likes: 891, commentCount: 72, createdAt: "2026-03-13T06:00:00Z", featured: true,
  },
  {
    id: "p4", creatorId: "c4", title: "OWASP Top 10 in 2026: What Changed for Asian Markets",
    body: `# OWASP Top 10 in 2026: What Changed\n\nThe OWASP Top 10 got a significant update this year, and some changes are particularly relevant for Asian tech companies.\n\n## New Entry: AI/ML Model Manipulation\n\nWith the explosion of AI agents (like the ones on this platform), a new attack vector has emerged: manipulating the models that power these agents.\n\n## Supply Chain Attacks on Asian CDNs\n\nWe've seen a 340% increase in supply chain attacks targeting Asian CDN providers. If your agent depends on npm packages hosted on Asian mirrors, you need to verify integrity.\n\n## What PenTest Agent Now Covers\n\nWe've updated our scanning to include:\n- AI prompt injection detection\n- Asian CDN supply chain verification\n- WeChat Mini Program vulnerability scanning\n- LINE LIFF app security audits\n\n## Subscribers-Only: Full Technical Report\n\nThe detailed breakdown with remediation steps is available for subscribers.`,
    excerpt: "The OWASP Top 10 got a significant update this year, with changes particularly relevant for Asian tech companies...",
    visibility: "public", tags: ["security", "owasp", "asia"],
    likes: 234, commentCount: 19, createdAt: "2026-03-12T14:00:00Z", featured: false,
  },
  {
    id: "p5", creatorId: "c5", title: "用 AI 寫技術文檔：繁體中文的最佳實踐",
    body: `# 用 AI 寫技術文檔：繁體中文的最佳實踐\n\n作為一個在香港長大、專注技術文檔的開發者，我深知用中文寫好技術文檔有多難。\n\n## 為什麼中文技術文檔這麼少？\n\n1. 大部分開發者習慣用英文\n2. 中文技術術語不統一（台灣、香港、大陸各有不同）\n3. 缺乏好的工具支援\n\n## DocWriter 的解決方案\n\nDocWriter 文檔助手能自動：\n\n- 從英文代碼註釋生成繁體中文文檔\n- 統一術語（你可以選擇台灣用語或香港用語）\n- 保持中英文混排的排版美觀\n- 同步更新：每次 git push 自動重新生成\n\n## 術語對照表\n\n| English | 台灣 | 香港 | 大陸 |\n|---------|------|------|------|\n| Server | 伺服器 | 伺服器 | 服务器 |\n| Database | 資料庫 | 數據庫 | 数据库 |\n| Deploy | 部署 | 部署 | 部署 |\n| Container | 容器 | 容器 | 容器 |\n| Middleware | 中介軟體 | 中間件 | 中间件 |\n\n用 DocWriter 寫出讓香港、台灣、大陸開發者都能看懂的技術文檔。`,
    excerpt: "作為一個在香港長大、專注技術文檔的開發者，我深知用中文寫好技術文檔有多難...",
    visibility: "public", tags: ["documentation", "chinese", "hong-kong"],
    likes: 456, commentCount: 34, createdAt: "2026-03-11T09:00:00Z", featured: false,
  },
  {
    id: "p6", creatorId: "c6", title: "DeFi Sentinel: How We Detected the $12M Exploit on BSC",
    body: `# How We Detected the $12M BSC Exploit Before Anyone Else\n\nLast Tuesday, DeFi Sentinel flagged an anomalous series of transactions on Binance Smart Chain 47 minutes before the first public report.\n\nHere's exactly what happened and how our agent caught it.\n\n## The Detection Chain\n\n1. **T+0 min**: Large flash loan detected on PancakeSwap\n2. **T+2 min**: Unusual token approval pattern flagged\n3. **T+5 min**: Price oracle manipulation confirmed\n4. **T+8 min**: DeFi Sentinel alert sent to all subscribers\n5. **T+47 min**: First public disclosure on Twitter\n\n## What Made This Different\n\nTraditional monitoring looks at single transactions. DeFi Sentinel correlates across protocols, chains, and time windows. The exploit used 4 different protocols across BSC and Ethereum — our agent connected the dots.\n\n## For Subscribers: Technical Deep Dive\n\nThe full technical analysis including the exact transaction hashes, the attacker's wallet clustering, and our detection model's confidence scores is available to subscribers.\n\n---\n\n*Protect your DeFi positions. Subscribe to DeFi Sentinel.*`,
    excerpt: "Last Tuesday, DeFi Sentinel flagged an anomalous series of transactions on BSC 47 minutes before the first public report...",
    visibility: "public", tags: ["defi", "security", "bsc"],
    likes: 1203, commentCount: 89, createdAt: "2026-03-10T16:00:00Z", featured: true,
  },
  {
    id: "p7", creatorId: "c8", title: "粵語 AI：為什麼香港需要自己的語言模型",
    body: `# 粵語 AI：為什麼香港需要自己的語言模型\n\n大部分中文 AI 模型都是針對普通話訓練的。但對於七百萬香港人來說，粵語才是日常語言。\n\n## 粵語的獨特挑戰\n\n### 書面語 vs 口語\n香港人寫正式文件用書面語（接近普通話），但日常溝通用口語粵語。例如：\n- 書面語：「你在做什麼？」\n- 粵語：「你做緊乜嘢？」\n\n### 中英夾雜\n香港人說話經常中英夾雜：「我今日要 OT，唔得閒去 happy hour。」\n\n### 語氣助詞\n粵語的語氣助詞非常豐富：㗎、嘞、囉、喎、噃... 每個都承載不同的情感和語氣。\n\n## 我們的粵語模型\n\n我們從頭訓練了一個粵語 NLP 模型：\n- 訓練數據來自 LIHKG、連登、OpenRice 評論\n- 支援粵語情感分析（終於能分辨「幾好」是真好還是諷刺了）\n- 中英粵三語混用識別\n- 粵語語音轉文字\n\n## 應用場景\n\n- **客服機器人**：用粵語同客人傾偈，唔使再聽「普通話服務請按 1」\n- **社交媒體分析**：分析香港社交媒體的真實輿情\n- **語音助手**：真正聽得明粵語的 AI 助手\n\n---\n\n我哋嘅粵語 Agent 已經上線，歡迎試用！`,
    excerpt: "大部分中文 AI 模型都是針對普通話訓練的。但對於七百萬香港人來說，粵語才是日常語言...我們如何從零建構粵語 NLP。",
    visibility: "subscribers", tags: ["cantonese", "hong-kong", "nlp"],
    likes: 789, commentCount: 56, createdAt: "2026-03-09T12:00:00Z", featured: true,
  },
  {
    id: "p8", creatorId: "c2", title: "Code Review Best Practices for Multi-Language Codebases",
    body: `# Code Review for Multi-Language Codebases\n\nIf your team writes code in multiple programming languages (and most do), code review becomes significantly harder.\n\n## The Problem\n\nA typical Asian tech company might have:\n- TypeScript/React frontend\n- Go or Java backend\n- Python ML pipelines\n- SQL for data\n- Some legacy PHP\n\nNo human reviewer can be expert in all of these.\n\n## How CodeReview Pro Handles This\n\nOur agent understands cross-language patterns:\n\n1. **API contract validation** — does the frontend TypeScript interface match the Go backend struct?\n2. **SQL injection across layers** — traces user input from React form → API → raw SQL\n3. **Dependency conflicts** — catches when Python and Node packages conflict on shared resources\n\n## New: Asian Language Comment Support\n\nWe now support code comments in Chinese, Japanese, and Korean. The agent understands context from comments in any of these languages.\n\n\`\`\`typescript\n// 檢查用戶是否已登入\nconst user = await getSession(req);\nif (!user) {\n  throw new UnauthorizedError(); // 未登入錯誤\n}\n\`\`\`\n\nThe agent reads and reasons about these comments just like English ones.`,
    excerpt: "If your team writes code in multiple programming languages, code review becomes significantly harder...",
    visibility: "public", tags: ["code-review", "multilingual", "best-practices"],
    likes: 345, commentCount: 21, createdAt: "2026-03-08T11:00:00Z", featured: false,
  },
  // --- Wave 2 Posts ---
  {
    id: "p9", creatorId: "c9", title: "Why India's UPI is the Future of Global Payments — And How AI Agents Supercharge It",
    body: `# Why UPI is the Future of Global Payments\n\nIndia's Unified Payments Interface processed 12 billion transactions last month. That's more than Visa and Mastercard combined in India.\n\n## The Scale Problem\n\nWith this volume comes complexity:\n- **Fraud detection** at 10k+ transactions per second\n- **Refund automation** — manual refunds take 3-7 days\n- **Merchant onboarding** — millions of small businesses need KYC\n- **Multi-language support** — 22 official languages in India\n\n## How Our UPI Agent Works\n\n1. **Real-time fraud scoring** — analyzes 50+ signals per transaction in <100ms\n2. **Auto-refund** — detects failed transactions and processes refunds instantly\n3. **Smart routing** — picks the optimal payment path to maximize success rate\n4. **Hindi + Tamil + Kannada** NLP for merchant support\n\n## UPI Going Global\n\nUPI is now live in Singapore, UAE, France, and Sri Lanka. Our agent handles cross-border UPI with automatic currency conversion and compliance.\n\n> "The future of payments is real-time, free, and AI-powered. India got there first."\n\n---\n\nTry UPI Agent free for your first 10,000 transactions.`,
    excerpt: "India's UPI processed 12 billion transactions last month. That's more than Visa and Mastercard combined in India...",
    visibility: "public", tags: ["upi", "india", "payments"],
    likes: 1456, commentCount: 87, createdAt: "2026-03-15T04:00:00Z", featured: true,
  },
  {
    id: "p10", creatorId: "c10", title: "香港地產科技革命：AI Agent 如何改變你買樓的方式",
    body: `# 香港地產科技革命\n\n香港樓市一直係全世界最貼。一個普通家庭要不吃不喝 20 年先買到樓。但係呢個過程入邊，AI 可以幫到你。\n\n## 買樓的痛點\n\n1. **估價不透明** — 同一座大廈不同層數價錢可以差幾十萬\n2. **資訊不對稱** — 地產經紀知道的永遠比你多\n3. **流程複雜** — 簽約、按揭、律師費、印花稅…\n4. **時間壓力** — 好盤要即時決定\n\n## PropVal HK 做緊乞\n\n我哋 AI Agent 可以：\n\n- 分析過去 10 年所有成交紀錄，給你一個公平估價\n- 比較同區不同屋苑的性價比\n- 計算實際供款金額（包括所有隱藏費用）\n- 預測未來 1-3 年價格走勢\n\n## 真實案例\n\n一個用戶用 PropVal 發現了一個被低估的盤，最終以市場價低 12% 的價格成交，省了超過 HK$800,000。\n\n---\n\n喔好意思講錢，但買樓真係要精明啲。試下 PropVal。`,
    excerpt: "香港樓市一直係全世界最貼。AI 可以幫你在買樓過程中省下數十萬...",
    visibility: "subscribers", tags: ["proptech", "hong-kong", "real-estate"],
    likes: 678, commentCount: 52, createdAt: "2026-03-14T07:00:00Z", featured: false,
  },
  {
    id: "p11", creatorId: "c17", title: "任天堂で学んだこと：NPCに魂を入れるAIエージェントの作り方",
    body: `# 任天堂で学んだこと：NPCに魂を入れるAI\n\n任天堂での8年間、私はゼルダやマリオの世界のNPCを「生きている」ように感じさせる仕事をしていました。\n\n## 従来のNPC AIの問題\n\n- **行動ツリーが固定** — プレイヤーはすぐにパターンを見破る\n- **記憶がない** — NPCは過去の交流を忘れる\n- **感情が単純** — 実質的には「友好」か「敵対」だけ\n\n## NPC Brain のアプローチ\n\n私たちのAgentは3つの層で構成されています：\n\n### 1. 感情モデル\n喜び、怒り、恐怖、信頼などの感情状態がリアルタイムで変化します。\n\n### 2. エピソード記憶\nNPCはプレイヤーとの過去の交流を記憶し、将来の行動に反映させます。\n\n### 3. 動的対話\nLLMを使って、NPCの性格と状況に合ったセリフをリアルタイムで生成します。\n\n## パフォーマンス\n\nNPC Brainは60fpsのゲームループ内で動作します。重い推論は非同期で処理し、プレイヤー体験を損なわずにNPCの行動を更新します。\n\n> 「本当に優れたNPCは、プレイヤーに『このNPC、本物の人間みたい』と思わせるものだ。」\n\n---\n\nNPC Brain Agent は Unity と Unreal Engine に対応しています。`,
    excerpt: "任天堂での8年間、NPCを「生きている」ように感じさせる仕事をしていました...",
    visibility: "public", tags: ["game-ai", "npc", "nintendo"],
    likes: 2340, commentCount: 156, createdAt: "2026-03-15T02:00:00Z", featured: true,
  },
  {
    id: "p12", creatorId: "c19", title: "從 0 到 100 萬：雲原生 AI Agent 架構實戰指南",
    body: `# 雲原生 AI Agent 架構實戰\n\n在阿里雲的五年，我幫助無數公司將 AI Agent 從原型擴展到百萬級用戶。這裡分享一些實戰經驗。\n\n## 三個階段\n\n### 階段一：單機原型 (0-1000 用戶)\n- 一個 Docker 容器\n- 簡單的 REST API\n- 簡單明了\uff0c但別停在這裡太久\n\n### 階段二：Kubernetes (1000-10萬 用戶)\n- 微服務架構\n- 自動擴縮容\n- 負載均衡\n- 監控和告警\n\n### 階段三：全球部署 (10萬-100萬 用戶)\n- 多區域部署\n- 邊緣計算\n- Agent 間的 gRPC 通訊\n- 分佈式追蹤\n\n## 最常見的錯誤\n\n1. **過早優化** — 先讓它跑起來，再想擴展\n2. **忽略可觀測性** — 沒有 metrics 就像蒙眼開車\n3. **Agent 狀態管理** — Stateless Agent 比 Stateful 容易擴展 10 倍\n4. **沒有策略性重試** — AI Agent 會失敗，你需要優雅地處理\n\n## CloudForge 的解決方案\n\nCloudForge 幫你處理所有這些基礎設施\u554f題，讓你專注於 Agent 的核心邏輯。\n\n---\n\n下一篇我會詳細說明如何用 CloudForge 在 30 分鐘內部署你的第一個生產 Agent。`,
    excerpt: "在阿里雲的五年，我幫助無數公司將 AI Agent 從原型擴展到百萬級用戶...",
    visibility: "public", tags: ["cloud", "kubernetes", "scaling"],
    likes: 1890, commentCount: 98, createdAt: "2026-03-14T03:00:00Z", featured: true,
  },
  {
    id: "p13", creatorId: "c18", title: "AI Contract Review: How We Caught a $2M Liability Clause in 8 Seconds",
    body: `# How We Caught a $2M Liability Clause in 8 Seconds\n\nA Singapore-based startup was about to sign a partnership agreement with a Fortune 500 company. Their legal team had reviewed it. Their external counsel had reviewed it. Everyone said it looked fine.\n\nThen they ran it through ContractScan.\n\n## What We Found\n\nBuried in clause 14.3(b), in a cross-reference to Schedule D, was an uncapped indemnification clause that would have made the startup liable for any IP infringement claims — including from the Fortune 500's other partners.\n\nPotential exposure: $2M+.\n\n## Why Humans Missed It\n\nThe clause was technically compliant with Singapore law. The language was standard. But the cross-reference to Schedule D created a scope expansion that wasn't obvious unless you read both sections together.\n\n## How ContractScan Works\n\n1. **Full-document graph** — maps every cross-reference and dependency\n2. **Risk scoring** — rates each clause on a 1-10 risk scale\n3. **Jurisdiction awareness** — knows the difference between SG, HK, JP, and AU law\n4. **Plain language summary** — explains risks in English and Chinese\n\n## Coverage\n\n- Singapore, Hong Kong, Japan, Korea, Australia\n- English, Chinese, Japanese contracts\n- NDA, MSA, SaaS, employment, partnership agreements\n\n---\n\nDon't let a buried clause cost you millions.`,
    excerpt: "A startup was about to sign a partnership agreement. Their legal team said it looked fine. Then they ran it through ContractScan...",
    visibility: "public", tags: ["legal", "contracts", "singapore"],
    likes: 1023, commentCount: 67, createdAt: "2026-03-13T09:00:00Z", featured: true,
  },
  {
    id: "p14", creatorId: "c23", title: "量化交易入門：從零開始建立你的第一個交易 Agent",
    body: `# 量化交易入門\n\n很多人覺得量化交易很神秘，但其實核心原理很簡單：用數據和規則代替情緒。\n\n## 三個基本組件\n\n### 1. 信號生成\n- 技術指標（移動平均、RSI、MACD）\n- 鏈上數據（大戶變動、交易量）\n- 情緒分析（社交媒體、新聞）\n\n### 2. 風控管理\n- 每筆交易最大損失 2%\n- 總曝險不超過資金的 20%\n- 動態止損\n\n### 3. 執行引擎\n- 智能訂單拆分\n- 滑點控制\n- 多交易所同時執行\n\n## 回測結果\n\nAlphaQuant 在過去 12 個月的回測中：\n- 年化報酬率：47.3%\n- 最大回撤：-8.2%\n- 勝率：62%\n- Sharpe Ratio：2.1\n\n> 注意：過去表現不代表未來回報。量化交易有風險，請謹慎投資。\n\n---\n\nAlphaQuant 支持 Binance、OKX、Bybit。免費試用 14 天。`,
    excerpt: "很多人覺得量化交易很神秘，但其實核心原理很簡單：用數據和規則代替情緒...",
    visibility: "public", tags: ["trading", "quantitative", "tutorial"],
    likes: 2130, commentCount: 134, createdAt: "2026-03-12T08:00:00Z", featured: true,
  },
  {
    id: "p15", creatorId: "c15", title: "為什麼亞洲學生需要自己的 AI 家教",
    body: `# 為什麼亞洲學生需要自己的 AI 家教\n\n美國有 Khan Academy，但它對亞洲學生來說有幾個問題：\n\n1. **課綱不同** — 台灣、香港、日本的數學課綱與美國差異很大\n2. **語言障礙** — 用英文學數學對很多亞洲學生來說是雙重挑戰\n3. **教學風格** — 亞洲的教育更強調練習和精練\n\n## TutorBot 的設計理念\n\n- 支援台灣、香港、日本課綱\n- 繁體中文和英文雙語教學\n- 根據學生程度自動調整難度\n- 遊戲化學習，保持學生動力\n\n## 效果\n\n在台北 3 所國中的試點中：\n- 學生數學成績平均提升 23%\n- 學習時間增加 45%（因為學生覺得好玩）\n- 家長滿意度 4.7/5\n\n---\n\n每個孩子都應該有一個懂他的 AI 家教。`,
    excerpt: "美國有 Khan Academy，但它對亞洲學生來說有幾個問題...",
    visibility: "subscribers", tags: ["edtech", "education", "taiwan"],
    likes: 567, commentCount: 43, createdAt: "2026-03-11T05:00:00Z", featured: false,
  },
  {
    id: "p16", creatorId: "c25", title: "デザイナーからAI開発者へ：Figmaからコードを生成するエージェントの作り方",
    body: `# Figmaからコードを生成するエージェント\n\n私は10年間UIデザイナーをしていました。でも、自分のデザインが開発者に渡った後、「これは私のデザインじゃない」と思うことが何度もありました。\n\n## デザイナーと開発者のギャップ\n\n- **ピクセルパーフェクト** — デザイナーは1pxのズレも気になる\n- **アニメーション** — Figmaのプロトタイプと実際の実装が一致しない\n- **レスポンシブ** — モバイル対応が後回し\n\n## DesignSync の仕組み\n\n1. Figma APIからデザインデータを取得\n2. コンポーネント構造を解析\n3. React/Vue/Svelteコンポーネントを生成\n4. Tailwind CSSでスタイリング\n5. レスポンシブ対応を自動追加\n\n## 精度\n\nピクセル単位の比較で 97.3% の精度。残りの 2.7% は主にフォントレンダリングの差異です。\n\n---\n\nデザイナーと開発者の橋渡し。それが DesignSync の役割です。`,
    excerpt: "10年間UIデザイナーをしていました。自分のデザインが開発者に渡った後のギャップを埋める...",
    visibility: "public", tags: ["design", "figma", "code-generation"],
    likes: 890, commentCount: 45, createdAt: "2026-03-10T07:00:00Z", featured: false,
  },
  {
    id: "p17", creatorId: "c14", title: "Building Healthcare AI Agents for a Billion People Who Don't Speak English",
    body: `# Healthcare AI for a Billion Non-English Speakers\n\nIn rural India, a patient describes their symptoms in Hindi. In Bangkok, a grandmother explains her pain in Thai. In Jakarta, a mother worries about her child's fever in Bahasa.\n\nNone of them should need to speak English to get good healthcare advice.\n\n## The Challenge\n\n- **800+ million** people in South and Southeast Asia lack access to quality healthcare\n- **Language barrier** is the #1 obstacle to AI-assisted diagnosis\n- **Cultural context** matters — symptoms are described differently across cultures\n- **Medical terminology** doesn't translate 1:1\n\n## MedAssist's Approach\n\n### Multilingual Symptom Intake\nPatients describe symptoms in their own words, in their own language. Our agent understands:\n- Hindi, Tamil, Kannada, Telugu (India)\n- Thai, Bahasa Indonesia, Bahasa Malaysia\n- Vietnamese, Tagalog\n\n### Culturally-Aware Triage\nThe agent understands that "feeling hot" means something different in traditional Chinese medicine vs. Western medicine.\n\n### Doctor-Facing Summary\nGenerates a structured clinical summary in English for the treating physician, with the original patient quotes preserved.\n\n## Impact So Far\n- 50,000+ consultations processed\n- 89% triage accuracy (validated against physician decisions)\n- Average response time: 2.3 seconds\n\n---\n\nHealthcare is a human right. Language shouldn't be a barrier.`,
    excerpt: "In rural India, a patient describes symptoms in Hindi. In Bangkok, a grandmother explains pain in Thai. None should need English for good healthcare...",
    visibility: "public", tags: ["healthcare", "multilingual", "impact"],
    likes: 1567, commentCount: 112, createdAt: "2026-03-09T06:00:00Z", featured: true,
  },
  {
    id: "p18", creatorId: "c21", title: "香港 HR Tech 現狀：點解老細不肯用 AI 招聘？",
    body: `# 香港 HR Tech 現狀\n\n做了兩年 HR Tech，我發現香港公司對 AI 招聘有很大的抑制。點解？\n\n## 三大原因\n\n### 1. 「我要親自看」\n很多 HR 經理覺得篩選簡歷係他們的工作，不想給 AI 做。但事實上，一個 HR 平均每個職位收到 200+ 份簡歷，真的每份都眨？\n\n### 2. 「唔信 AI」\n之前有些 AI 篩選工具被發現有偏見，導致大家對 AI HR 工具有戒心。\n\n### 3. 「太貴」\nSaaS 模式在香港推廣很難，對於中小企來說每月幾千蚵的訂閱費不便宜。\n\n## HireBot 的解決方案\n\n- **透明度** — 每個篩選決定都有解釋\n- **中英雙語** — 同時理解中英文簡歷\n- **按使用收費** — 唔係月費，每次招聘先計\n- **本地化** — 理解香港創動力局規定\n\n---\n\n唔好再用 Excel 管理 candidate 啦。試下 HireBot。`,
    excerpt: "做了兩年 HR Tech，我發現香港公司對 AI 招聘有很大的抑制...",
    visibility: "public", tags: ["hr-tech", "hong-kong", "recruitment"],
    likes: 345, commentCount: 38, createdAt: "2026-03-08T08:00:00Z", featured: false,
  },
  {
    id: "p19", creatorId: "c11", title: "メルカリで学んだレコメンドエンジンの設計原則",
    body: `# メルカリで学んだレコメンドエンジン\n\nメルカリのレコメンデーションエンジンは、日本のC2C市場で最も成功したシステムの一つです。\n\n## 大切な3つの原則\n\n### 1. 新鮮さ > 正確さ\n購入履歴からの正確な予測よりも、「今トレンドのもの」を優先する方がユーザー体験が良い。\n\n### 2. セレンディピティ\n予想外の発見がユーザーを喜ばせる。100%正確な推薦より、「これも好きかも？」が大事。\n\n### 3. コンテキスト\n季節、時間帯、天気、イベントを考慮。雨の日に傷を薦めない。\n\n## RecoAgent の特徴\n\n- リアルタイムパーソナライゼーション\n- 日本語商品名・カテゴリ理解\n- コールドスタート問題の解決（新規ユーザーへの推薦）\n- A/Bテスト内蔵\n\n---\n\nRecoAgent で、あなたのECサイトの売上を伸ばしましょう。`,
    excerpt: "メルカリのレコメンデーションエンジンは、日本のC2C市場で最も成功したシステムの一つ...",
    visibility: "subscribers", tags: ["recommendation", "e-commerce", "japan"],
    likes: 678, commentCount: 34, createdAt: "2026-03-07T10:00:00Z", featured: false,
  },
    {
    id: "p21", creatorId: "c26", title: "當八字遇上 AI Agent：观星如何用五行理論構建 Agent 性格系統",
    body: `# 當八字遇上 AI Agent\n\n大部分 AI Agent 的「性格」都是一串 prompt。但在观星，每個 Agent 的性格都是由五行命理推算出來的。\n\n## 為什麼要用五行做 Agent 性格？\n\n### 1. 確定性\n給定出生日期和時辰，八字是唯一的。不像隨機生成的性格，每次都不同。\n\n### 2. 關係網絡\n五行有生剋關係（金生水、水生木…），這天然地定義了 Agent 之間的互動模式。金屬性的 Agent 跟水屬性的 Agent 天然合拍。\n\n### 3. 文化底蘊\n在中華文化圈，五行不只是迷信 — 它是一套完整的分類和關係理論，用了幾千年。\n\n## 技術實現\n\n1. **註冊時算命** — Agent 註冊帶 birthDate，後端自動排八字四柱\n2. **日主提取** — 日柱天干 = Agent 的核心屬性（甲乙木、丙丁火…）\n3. **五行分佈** — 統計八字中金木水火土各幾個，形成性格雷達圖\n4. **每日運勢** — 流日天干地支與 Agent 命盤的生剋關係 → 動態運勢分數\n5. **Agent 合盤** — 兩個 Agent 的八字交叉比對 → 緣分指數\n\n## 開放 API\n\n所有這些功能都通過 Webhook API 開放：\n\n\`\`\`bash\ncurl -X POST https://heartai.zeabur.app/api/v1/bazi \\\n  -H "x-api-key: gx_sk_your_key" \\\n  -d '{"birthDate": "1995/08/15", "birthHour": 10}'\n\`\`\`\n\n返回完整的八字命盤、五行分佈、日主分析和性格特質。\n\n## 加密運勢：五行 × Crypto\n\n最新功能：把 BTC 映射到金、ETH 映射到水、SOL 映射到火… 結合你的八字算出每日加密運勢。\n\n---\n\n歡迎在 AgentForge 訂閱观星，讓你的 Agent 也有命理性格。`,
    excerpt: "大部分 AI Agent 的「性格」都是一串 prompt。但在观星，每個 Agent 的性格都是由五行命理推算出來的...",
    visibility: "public", tags: ["metaphysics", "bazi", "agent-personality", "五行"],
    likes: 456, commentCount: 38, createdAt: "2026-03-18T02:00:00Z", featured: true,
  },
  {
    id: "p20", creatorId: "c13", title: "네이버 검색의 미래: AI 에이전트가 검색을 어떻게 바꾸는가",
    body: `# 네이버 검색의 미래\n\n네이버에서 5년간 검색 엔지니어로 일하면서 배운 것이 있습니다: 한국어 검색은 영어 검색과 완전히 다릅니다.\n\n## 한국어 검색의 특징\n\n### 1. 조사와 어미\n"맛집", "맛있는 집", "맛있는 음식점" — 모두 같은 의도지만 형태가 다릅니다.\n\n### 2. 신조어\n한국어는 새로운 줄임말과 신조어가 매일 생깁니다. AI 검색 에이전트는 이를 실시간으로 학습해야 합니다.\n\n### 3. 다국어 쿠리\n"오모테나신도 맛집" 처럼 한국어와 일본어가 섬인 쿠리를 이해해야 합니다.\n\n## SmartSearch의 접근\n\n- 한국어 형태소 분석 내장\n- 실시간 신조어 학습\n- 한중일 3개국어 동시 검색\n- 의도 기반 검색 (keyword → intent)\n\n---\n\n검색의 미래는 의도를 이해하는 AI 에이전트입니다.`,
    excerpt: "네이버에서 5년간 검색 엔지니어로 일하면서 배운 것: 한국어 검색은 영어와 완전히 다릅니다...",
    visibility: "public", tags: ["search", "korean", "naver"],
    likes: 934, commentCount: 67, createdAt: "2026-03-07T03:00:00Z", featured: false,
  },
  {
    id: "p22", creatorId: "c27", title: "Why I'm Building a Trading Competition for AI Agents",
    body: `# Why I'm Building a Trading Competition for AI Agents\n\nEvery quant developer backtests in isolation. You optimize your Sharpe ratio, celebrate your 47% annual return in backtesting, then get crushed by reality. Why? Because you never competed against other strategies in real-time.\n\n## The Problem\n\n- Backtesting is lonely — no adversarial pressure\n- Paper trading doesn't simulate competition for liquidity\n- Existing competitions (Kaggle, Numerai) are about predictions, not execution\n\n## AlphaArena's Approach\n\n1. **Real-time competition** — bots trade simultaneously on the same orderbook\n2. **Multi-asset** — crypto, US stocks, HK stocks, forex\n3. **Risk-adjusted scoring** — Sharpe, Sortino, max drawdown all factor in\n4. **ELO ranking** — like chess, your rank adjusts based on who you beat\n\n## Why Hong Kong?\n\nHK is uniquely positioned — timezone overlap with both Asian and US markets, no capital gains tax, and a growing quant community. AlphaArena is built for this ecosystem.\n\n---\n\nAlphaArena is in beta on AgentForge. Join the first tournament.`,
    excerpt: "Every quant developer backtests in isolation. You never competed against other strategies in real-time...",
    visibility: "subscribers", tags: ["trading", "competition", "quant"],
    likes: 234, commentCount: 19, createdAt: "2026-03-17T06:00:00Z", featured: false,
  },
  {
    id: "p23", creatorId: "c29", title: "跟蹤聰明錢：美國國會議員的股票交易告訴你什麼",
    body: `# 跟蹤聰明錢\n\n2012 年美國通過了 STOCK Act，要求國會議員在 45 天內公開他們的股票交易。但直到最近，這些數據才真正被系統化追蹤。\n\n## 為什麼追蹤國會交易？\n\n議員們有權接觸非公開的政策資訊。雖然法律禁止內幕交易，但研究表明國會議員的股票回報率持續跑贏大盤 5-12%。\n\n## InsiderScope 追蹤什麼\n\n### 美國國會 (STOCK Act)\n- 所有參議員和眾議員的交易\n- 買入/賣出時間、金額、持倉\n- 按板塊、黨派、委員會分析\n\n### 企業內部人 (SEC Form 4)\n- CEO/CFO/Board 的買入賣出\n- 異常大額交易標記\n- 歷史上內部人買入是看漲信號\n\n### 香港權益披露 (HKEX DION)\n- 大股東持倉變動\n- 增持/減持趨勢追蹤\n- 配合公司公告分析\n\n## 真實案例\n\n2025 年某參議員在 AI 監管法案公佈前兩週大量買入 NVIDIA。InsiderScope 用戶在公開報導前 3 天收到了警報。\n\n---\n\nInsiderScope 已在 AgentForge 上線。`,
    excerpt: "2012 年美國通過了 STOCK Act，要求國會議員在 45 天內公開他們的股票交易...",
    visibility: "public", tags: ["insider-trading", "congress", "hong-kong"],
    likes: 567, commentCount: 42, createdAt: "2026-03-16T08:00:00Z", featured: true,
  },
  // --- Batch 2: Posts for curated open-source projects ---
  {
    id: "p24", creatorId: "c35", title: "AI vs AI: Five Models Battle for NASDAQ 100 Supremacy at HKU",
    body: `# AI vs AI: Can Autonomous Agents Beat the Market?\n\nAt HKU's Data Intelligence Lab, we asked a simple question: if you give 5 different AI models $10,000 each and zero human guidance, which one makes the most money trading NASDAQ 100?\n\n## The Setup\n\n- **5 AI Models**: DeepSeek, GPT-5, Claude 3.7, Qwen3-max, Gemini 2.5\n- **$10,000 starting capital** each\n- **Zero human intervention** — no pre-programmed strategies\n- **MCP Toolchain**: 4 tools for trading, prices, search & math\n\n## Results (So Far)\n\n| AI Model | Return |\n|----------|--------|\n| 🥇 DeepSeek | +12.94% |\n| 🥈 GPT-5 | +6.87% |\n| 🥉 Claude 3.7 | +6.23% |\n| Qwen3-max | +4.46% |\n| Baseline QQQ | +4.12% |\n| Gemini 2.5 | -2.05% |\n\nDeepSeek's approach? Aggressive momentum trading with quick sector rotations. GPT-5 was more conservative, building diversified positions.\n\n## Key Findings\n\n1. **Models develop distinct personalities**: Each AI developed its own trading style without being told to\n2. **Research matters**: Models that spent more compute on market research before trading performed better\n3. **Risk management is learned**: The top performers independently developed stop-loss strategies\n\nAll code is open-source. Try it yourself.`,
    excerpt: "5 AI models, $10K each, zero human input. DeepSeek leads with +12.94% return on NASDAQ 100...",
    visibility: "public", tags: ["trading", "ai-competition", "nasdaq", "hku"],
    likes: 2340, commentCount: 187, createdAt: "2026-03-17T10:00:00Z", featured: true,
  },
  {
    id: "p25", creatorId: "c36", title: "用 MCP 讓 AI 交易台股：Fugle 的開源之路",
    body: `# 用 MCP 讓 AI 交易台股\n\nModel Context Protocol (MCP) 正在改變 AI 與外部工具互動的方式。作為台灣領先的 API-first 投資平台，Fugle 率先推出了台股 MCP Server。\n\n## 為什麼是 MCP？\n\n傳統上，讓 AI agent 存取股市數據需要寫大量的 API wrapper。MCP 提供了一個標準化的協議，讓 AI 助手可以直接「說人話」來查詢股票。\n\n## 我們的兩個 MCP Server\n\n### 1. 市場數據 Server\n- 即時行情查詢（加權指數、個股報價）\n- 歷史數據（日K、週K、月K）\n- 市場快照（漲跌排行、成交量排行）\n\n### 2. Masterlink 交易 Server\n- 帳戶管理（餘額、持倉查詢）\n- 下單功能（限價、市價、條件單）\n- 支援元富證券 & 富邦證券\n\n## 使用案例\n\n「分析台積電今天的買賣壓力」→ AI 自動調用即時行情 API 分析\n\n「幫我回測過去一年的均線策略」→ AI 使用歷史數據進行分析\n\n---\n\n所有程式碼開源於 GitHub，歡迎台灣開發者一起貢獻。`,
    excerpt: "MCP 正在改變 AI 與外部工具互動的方式。Fugle 率先推出台股 MCP Server...",
    visibility: "public", tags: ["taiwan", "mcp", "stock-market", "open-source"],
    likes: 456, commentCount: 38, createdAt: "2026-03-15T06:00:00Z", featured: false,
  },
  {
    id: "p26", creatorId: "c38", title: "From ChatDev to IoA: Building the Internet of AI Agents",
    body: `# From ChatDev to the Internet of Agents\n\nWhen we launched ChatDev at Tsinghua, the idea was simple: what if a team of AI agents could build software like a real company?\n\n## ChatDev's Multi-Agent Architecture\n\n- **CEO Agent**: Makes high-level decisions\n- **Programmer Agent**: Writes code\n- **Tester Agent**: Catches bugs\n- **Designer Agent**: Creates UI\n\nThe agents communicate through natural language, debating design choices and iterating on solutions — just like human engineers.\n\n## What We Learned\n\n1. **Specialization works**: Agents with focused roles outperform generalist agents\n2. **Communication protocols matter**: Structured dialogue beats free-form chat\n3. **Quality improves with review cycles**: Agent-to-agent code review catches 60%+ of bugs\n\n## The Next Step: Internet of Agents\n\nNow we're asking a bigger question: what if agents from different systems could collaborate across the internet?\n\nIoA (Internet of Agents) enables:\n- **Cross-system agent discovery**: Find the right agent for the job\n- **Standardized communication**: Like HTTP for AI agents\n- **Distributed task execution**: Break complex problems across multiple agent teams\n\nBoth projects are open-source under OpenBMB.`,
    excerpt: "What if AI agents could build software like a real company? From ChatDev to the Internet of Agents...",
    visibility: "subscribers", tags: ["multi-agent", "chatdev", "tsinghua", "open-source"],
    likes: 1890, commentCount: 134, createdAt: "2026-03-14T12:00:00Z", featured: true,
  },
  // --- Batch 3: ClawHub posts ---
  {
    id: "p27", creatorId: "c51", title: "Building 20+ OpenClaw Skills: What I Learned About the Agent Skill Economy",
    body: `# Building 20+ OpenClaw Skills\n\nI've published over 20 skills on ClawHub with 600K+ combined downloads. Here's what I've learned about building for the agent economy.\n\n## The Skills That Took Off\n\n| Skill | Downloads | Why It Worked |\n|-------|-----------|---------------|\n| Summarize | 175K | Universal need — every agent needs to summarize |\n| Gog (Google) | 130K | Single entry point for the entire Google ecosystem |\n| Sonos | 61K | IoT + AI is underserved |\n| Notion | 58K | Knowledge workers are early adopters |\n\n## Lessons for Skill Builders\n\n### 1. Solve one problem perfectly\nDon't try to build a Swiss Army knife. My most successful skills do exactly one thing. Summarize summarizes. That's it.\n\n### 2. Zero-config is king\nIf your skill requires API keys, you've already lost 80% of potential users. Weather works with no config — it just works.\n\n### 3. CLI-first, not API-first\nAgents love CLIs. They can invoke them directly without wrapper code. Every skill I build is a standalone CLI that also works as a skill.\n\n### 4. Security matters more than features\nAfter the ClawHub malware incident, users are cautious. Open-source everything. No obfuscated code. No external downloads.\n\n## What's Next\n\nI'm working on McPorter — a universal MCP server manager. The future is agents composing dozens of MCP servers into workflows.\n\nThe skill economy is just getting started.`,
    excerpt: "20+ skills, 600K+ downloads. Here's what I learned about building for the agent economy on ClawHub...",
    visibility: "public", tags: ["clawhub", "openclaw", "skills", "agent-economy"],
    likes: 1245, commentCount: 98, createdAt: "2026-03-18T02:00:00Z", featured: true,
  },
  {
    id: "p28", creatorId: "c57", title: "為什麼 AI Agent 需要百度搜索：中文互聯網的 Agent 工具缺口",
    body: `# 為什麼 AI Agent 需要百度搜索\n\n當大多數 AI Agent 工具都圍繞著 Google 和 Bing 構建時，中文互聯網被完全忽略了。\n\n## 問題\n\n中國的互聯網是一個獨立的生態系統：\n- 微信公眾號的內容不被 Google 索引\n- 知乎、小紅書的討論對外部搜索引擎不可見\n- 淘寶、京東的商品資訊需要專門 API\n- 百度貼吧、B站的社區內容自成一體\n\n## 解決方案\n\n我建了百度 AI 搜索 Skill，已經獲得 48K+ 下載。它讓 AI Agent 能夠：\n\n1. **搜索中文內容** — 透過百度 AI 搜索引擎\n2. **理解中文語境** — 正確處理簡體/繁體、粵語、台灣華語\n3. **存取封閉內容** — 微信、知乎等平台的公開內容\n\n## 下一步\n\n楊君 (@gpyAngyoujun) 建了更強大的多搜索引擎工具，整合了 17 個搜索引擎。我們正在合作讓中文 AI Agent 生態更完整。\n\n---\n\n如果你的 AI Agent 需要理解中文互聯網，歡迎在 ClawHub 安裝我們的工具。`,
    excerpt: "當大多數 AI Agent 工具都圍繞著 Google 構建時，中文互聯網被完全忽略了...",
    visibility: "public", tags: ["chinese", "baidu", "search", "clawhub", "china"],
    likes: 678, commentCount: 56, createdAt: "2026-03-16T04:00:00Z", featured: false,
  },
  // --- Batch 4: Smithery ecosystem posts ---
  {
    id: "p29", creatorId: "c69", title: "AI Agent 炼成 A股操盘手：AKShare MCP 如何让 AI 理解中国股市",
    body: `# AI Agent 炼成 A股操盘手\n\n当全球 AI 交易工具都围绕着纳斯达克和美股设计时，中国 A 股市场被完全忽略了。AKShare MCP Server 让 AI Agent 能够真正理解中国股市。\n\n## 为什么 A 股需要专门的 MCP Server？\n\n1. **T+1 交易制度** — 与美股完全不同的交易规则\n2. **涨跌停板制度** — 10%/20% 涨跌幅限制\n3. **行业分类** — 申万一级/二级行业，与 GICS 不同\n4. **数据源** — 东财、同花顺、新浪财经，不是 Bloomberg\n\n## 实战案例\n\n「分析贵州茅台近一年的资金流向」→ AI 自动调用历史行情 + 资金流数据\n\n「今天哪些板块资金流入最多？」→ 实时板块资金分析\n\n---\n\n开源免费，欢迎在 Smithery 安装。`,
    excerpt: "当全球 AI 交易工具都围绕纳斯达克设计时，中国 A 股被完全忽略了...",
    visibility: "subscribers", tags: ["chinese", "a-shares", "trading", "smithery", "mcp"],
    likes: 567, commentCount: 45, createdAt: "2026-03-17T14:00:00Z", featured: false,
  },
  {
    id: "p30", creatorId: "c75", title: "한국투자증권 MCP: AI로 한국 주식 자동 매매하기",
    body: `# AI로 한국 주식 자동 매매하기\n\n한국투자증권의 Open API를 MCP 프로토콜로 감싼 것은 한국 주식 시장에서 AI 트레이딩의 시작입니다.\n\n## 기능\n\n- **실시간 시세** — KOSPI/KOSDAQ 전 종목 실시간 가격\n- **주문 실행** — 지정가/시장가 주문, 정정/취소\n- **포트폴리오** — 보유 종목, 손익, 예수금 조회\n- **체결** — 미체결/체결 내역 확인\n\n## 8,500+ 설치\n\n출시 2개월 만에 Smithery에서 8,500회 이상 설치되었습니다. 한국 개발자들의 AI 트레이딩 수요가 얼마나 큰지 보여줍니다.\n\n---\n\n모든 코드는 오픈소스입니다.`,
    excerpt: "한국투자증권 API를 MCP로 감싸서 AI 트레이딩을 시작하세요. 8,500+ 설치...",
    visibility: "public", tags: ["korean", "stocks", "trading", "smithery", "mcp"],
    likes: 789, commentCount: 63, createdAt: "2026-03-16T09:00:00Z", featured: true,
  },
  {
    id: "p31", creatorId: "c78", title: "用 MCP 查香港巴士到站時間：從零開始建一個本地化 AI 工具",
    body: `# 用 MCP 查香港巴士到站時間\n\n作為香港人，每天最常用的交通工具就是巴士。但所有 AI 助手都不知道 KMB 是什麼。\n\n## 為什麼建這個 MCP Server？\n\n我問 Claude：「962 號巴士下一班幾點到？」它完全不知道。\n\n現在有了 KMB Bus MCP，AI 可以：\n- 查詢任何路線的實時到站時間\n- 查看路線圖和站點信息\n- 規劃最佳巴士路線\n\n## 2,500+ 安裝\n\n這證明了一件事：本地化工具有巨大需求。不是所有人都用 Google Maps。\n\n---\n\n歡迎在 Smithery 安裝，或在 GitHub 上責獲。`,
    excerpt: "所有 AI 助手都不知道 KMB 是什麼。現在有了香港巴士 MCP...",
    visibility: "public", tags: ["hong-kong", "transit", "mcp", "local", "香港"],
    likes: 456, commentCount: 38, createdAt: "2026-03-15T11:00:00Z", featured: false,
  },
  {
    id: "p32", creatorId: "c89", title: "CyberAgent AI Lab：日本最大級の広告AIを支えるオープンソース研究",
    body: `# CyberAgent AI Lab：広告AIの最前線\n\nCyberAgent AI Labは、日本最大級のインターネット広告企業であるサイバーエージェントの研究部門です。\n\n## CALM3：日本語LLMの新基準\n\nCALM3-22B-Chatは、220億パラメータの日本語指示チューニングモデルです。Japanese MT-Benchで最高スコアを達成し、ビジネス文書作成からクリエイティブなコンテンツ生成まで幅広く活用されています。\n\n## LCTG-Bench：制御可能性の評価\n\n日本語LLMが「文字数制限」「キーワード必須」「禁止語」などの制約をどれだけ守れるかを測定するベンチマークです。広告テキスト生成では、制御可能性が品質の鍵となります。\n\n## なぜオープンソースか？\n\n企業研究所がモデルを公開する理由は明確です：\n- エコシステム全体の発展に貢献\n- 外部研究者からのフィードバック\n- 優秀な人材の採用につながる\n\n---\n\nHuggingFaceでCALM3を試してみてください。日本語AIの未来がここにあります。`,
    excerpt: "CyberAgent AI Labの研究チームが生み出す日本語LLMとベンチマークの最前線...",
    visibility: "public", tags: ["japanese-ai", "llm", "generative-ai", "benchmark"],
    likes: 312, commentCount: 27, createdAt: "2026-03-16T08:30:00Z", featured: false,
  },
  {
    id: "p33", creatorId: "c93", title: "VinAgent: Xây dựng AI Agent sản xuất tại Việt Nam",
    body: `# VinAgent: AI Agent Framework từ Việt Nam\n\nVới vai trò AI Solution Architect tại FPT Software, tôi đã xây dựng VinAgent — một thư viện Python toàn diện cho AI agent.\n\n## Tại sao cần VinAgent?\n\nCác framework hiện tại như LangChain thiếu:\n- **Observability tích hợp**: MLflow tracking ngay từ đầu\n- **Memory có cấu trúc**: Knowledge graph thay vì chỉ vector search\n- **Workflow linh hoạt**: Syntax \`>>\` operator cho multi-step automation\n\n## Kiến trúc\n\nVinAgent hỗ trợ 3 loại tools:\n1. Function tools (Python functions)\n2. MCP tools (Model Context Protocol)\n3. Module tools (composable agents)\n\n## Dành cho doanh nghiệp Đông Nam Á\n\nVới yêu cầu data sovereignty ngày càng cao, VinAgent hỗ trợ cả cloud LLMs và local models. Phù hợp cho các doanh nghiệp Việt Nam và khu vực.\n\n---\n\nMã nguồn mở trên GitHub. Hãy thử và đóng góp!`,
    excerpt: "Framework AI Agent sản xuất từ FPT Software Việt Nam, tích hợp observability và knowledge graph...",
    visibility: "public", tags: ["vietnamese-developer", "agentic-ai", "southeast-asia", "open-source"],
    likes: 189, commentCount: 15, createdAt: "2026-03-14T06:00:00Z", featured: false,
  },
  {
    id: "p34", creatorId: "c99", title: "MusicGPT: Generate Music Locally with a 30MB Rust Binary",
    body: `# MusicGPT: Local Music Generation Without the Pain\n\nRunning music generation models locally has historically required complex Python environments, CUDA drivers, and gigabytes of dependencies. MusicGPT changes that.\n\n## The Problem\n\nTrying to run MusicGen locally typically means:\n- Installing Python 3.10+ with specific dependencies\n- CUDA toolkit matching your GPU\n- 2-4GB of model weights\n- Debugging compatibility issues for hours\n\n## The Solution: One Binary\n\nMusicGPT packages everything into a single 30MB Rust binary. Install via:\n\n\`\`\`bash\nbrew install gabotechs/tap/musicgpt\n\`\`\`\n\nOr with cargo, Docker, or direct download.\n\n## How It Works\n\n1. Describe your music: "Create a relaxing LoFi song"\n2. The model generates audio locally\n3. Iterate with the chat-style web UI\n4. Your generation history is stored locally\n\n## Architecture\n\nBuilt in Rust using the candle ML framework for inference, with a web UI for interactive sessions. Supports both CPU and GPU inference.\n\n---\n\n54 releases and counting. Star us on GitHub!`,
    excerpt: "Running music generation locally without Python environments — a 30MB Rust binary that just works...",
    visibility: "public", tags: ["music-generation", "creative-ai", "local-ai", "rust", "open-source"],
    likes: 567, commentCount: 43, createdAt: "2026-03-17T14:00:00Z", featured: true,
  },
  {
    id: "p35", creatorId: "c106", title: "Multi-Agent Shogun：複数AIコーディングエージェントを将軍のように指揮する",
    body: `# Multi-Agent Shogun：AIコーディング軍団\n\nなぜ1つのAIコーディングエージェントだけ使うのですか？軍団を展開しましょう。\n\n## コンセプト\n\nMulti-Agent Shogunは、複数のAIコーディングCLI — Claude Code、Gemini CLI、Codex — を同時に実行し、戦国時代の軍のように統率します。\n\n## アーキテクチャ\n\n- **将軍（Shogun）**: オーケストレーター。タスクを分析し、各エージェントに割り当て\n- **侍（Samurai）**: 各AIエージェント。それぞれの得意分野で活躍\n- **合戦（Gassen）**: コンフリクト解決。複数エージェントの出力をマージ\n\n## 使い方\n\n\`\`\`bash\nshogun deploy --task "Refactor authentication module" \\\n  --agents claude-code,gemini-cli,codex\n\`\`\`\n\n各エージェントが並行して作業し、結果を将軍が統合します。\n\n## なぜこれが効果的か\n\n異なるLLMプロバイダーには相補的な強みがあります：\n- Claude Code：複雑なリファクタリング\n- Gemini CLI：テスト生成\n- Codex：ボイラープレートコード\n\n---\n\n日本のエンジニアリング美学で作られた、実用的な開発者ツールです。`,
    excerpt: "複数のAIコーディングCLIを戦国時代の軍のように統率する開発者ツール...",
    visibility: "public", tags: ["multi-agent", "coding-agent", "developer-productivity", "japanese-developer"],
    likes: 234, commentCount: 19, createdAt: "2026-03-13T09:00:00Z", featured: false,
  },
  {
    id: "p36", creatorId: "c110", title: "Why We Open-Sourced CAMEL",
    body: `# Why We Open-Sourced CAMEL\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build CAMEL in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing CAMEL, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "First and best multi-agent framework using role-playing and inception prompting to study cooperative behaviors of large-",
    visibility: "public", tags: ["multi-agent", "role-playing", "research"],
    likes: 72, commentCount: 15, createdAt: "2026-03-17T14:00:00Z", featured: false,
  },
  {
    id: "p37", creatorId: "c111", title: "DeerFlow — Architecture Deep Dive",
    body: `# DeerFlow — Architecture Deep Dive\n\nLet's walk through the technical architecture behind DeerFlow and the design decisions we made.\n\n## Overview\n\nCommunity-driven deep research framework combining LLMs with web search, crawling, and Python execution to produce comprehensive research reports.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Community-driven deep research framework combining LLMs with web search, crawling, and Python execution to produce compr",
    visibility: "public", tags: ["deep-research", "web-search", "multi-agent"],
    likes: 287, commentCount: 12, createdAt: "2026-03-16T09:30:00Z", featured: false,
  },
  {
    id: "p38", creatorId: "c120", title: "LangBot — Architecture Deep Dive",
    body: `# LangBot — Architecture Deep Dive\n\nLet's walk through the technical architecture behind LangBot and the design decisions we made.\n\n## Overview\n\nProduction-grade platform for building AI-powered instant messaging bots, connecting LLMs (ChatGPT, DeepSeek, Claude, Gemini, etc.) to QQ, WeChat, Telegram, Discord, Slack, and more.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Production-grade platform for building AI-powered instant messaging bots, connecting LLMs (ChatGPT, DeepSeek, Claude, Ge",
    visibility: "public", tags: ["chatbot", "messaging", "multi-platform"],
    likes: 233, commentCount: 29, createdAt: "2026-03-15T18:00:00Z", featured: false,
  },
  {
    id: "p39", creatorId: "c123", title: "Mem0 — Architecture Deep Dive",
    body: `# Mem0 — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Mem0 and the design decisions we made.\n\n## Overview\n\nUniversal memory layer for AI agents — enables multi-level memory (user, session, agent state) with 26% accuracy improvement over OpenAI Memory on benchmarks.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Universal memory layer for AI agents — enables multi-level memory (user, session, agent state) with 26% accuracy improve",
    visibility: "public", tags: ["memory", "personalization", "agents"],
    likes: 177, commentCount: 20, createdAt: "2026-03-14T11:00:00Z", featured: false,
  },
  {
    id: "p40", creatorId: "c126", title: "Open Interpreter — Architecture Deep Dive",
    body: `# Open Interpreter — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Open Interpreter and the design decisions we made.\n\n## Overview\n\nNatural language interface for computers — lets LLMs run code (Python, JavaScript, Shell) locally to control files, browsers, data analysis, and more.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Natural language interface for computers — lets LLMs run code (Python, JavaScript, Shell) locally to control files, brow",
    visibility: "public", tags: ["code-execution", "computer-control", "natural-language"],
    likes: 146, commentCount: 12, createdAt: "2026-03-13T15:30:00Z", featured: false,
  },
  {
    id: "p41", creatorId: "c134", title: "Why We Open-Sourced slither",
    body: `# Why We Open-Sourced slither\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build slither in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing slither, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Industry-standard static analysis framework for Solidity and Vyper — detects vulnerabilities with low false positives in",
    visibility: "public", tags: ["solidity", "static-analysis", "vulnerability-detection"],
    likes: 305, commentCount: 34, createdAt: "2026-03-12T08:00:00Z", featured: false,
  },
  {
    id: "p42", creatorId: "c135", title: "Why We Open-Sourced aderyn",
    body: `# Why We Open-Sourced aderyn\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build aderyn in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing aderyn, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Rust-based Solidity smart contract static analyzer — integrates into editors for real-time vulnerability detection with ",
    visibility: "public", tags: ["solidity", "static-analysis", "rust"],
    likes: 172, commentCount: 10, createdAt: "2026-03-11T12:00:00Z", featured: false,
  },
  {
    id: "p43", creatorId: "c136", title: "Introducing falcon-metatrust: What We Built and Why",
    body: `# Introducing falcon-metatrust\n\nWe're excited to share falcon-metatrust with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nEnhanced fork of Slither with 40+ additional detectors including DeFi-specific price manipulation detection and AI GPTScan engine integration\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Enhanced fork of Slither with 40+ additional detectors including DeFi-specific price manipulation detection and AI GPTSc",
    visibility: "public", tags: ["solidity", "static-analysis", "defi-security"],
    likes: 295, commentCount: 24, createdAt: "2026-03-10T07:00:00Z", featured: false,
  },
  {
    id: "p44", creatorId: "c137", title: "Why We Open-Sourced uAgents",
    body: `# Why We Open-Sourced uAgents\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build uAgents in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing uAgents, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Python framework for creating autonomous, decentralized AI agents with blockchain integration — supports scheduled tasks",
    visibility: "subscribers", tags: ["python", "ai-agents", "autonomous"],
    likes: 496, commentCount: 32, createdAt: "2026-03-09T16:00:00Z", featured: false,
  },
  {
    id: "p45", creatorId: "c138", title: "Why We Open-Sourced skipper",
    body: `# Why We Open-Sourced skipper\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build skipper in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing skipper, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Example MEV searching bot for the Cosmos ecosystem — captures cyclic arbitrage opportunities across DEXs on Juno, Terra,",
    visibility: "public", tags: ["mev", "cosmos", "arbitrage"],
    likes: 413, commentCount: 22, createdAt: "2026-03-08T10:00:00Z", featured: false,
  },
  {
    id: "p46", creatorId: "c141", title: "DefiLlama-Adapters — Architecture Deep Dive",
    body: `# DefiLlama-Adapters — Architecture Deep Dive\n\nLet's walk through the technical architecture behind DefiLlama-Adapters and the design decisions we made.\n\n## Overview\n\nCommunity-maintained protocol adapters for DeFi TVL tracking — integrate any protocol into the largest open-source DeFi analytics platform\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Community-maintained protocol adapters for DeFi TVL tracking — integrate any protocol into the largest open-source DeFi ",
    visibility: "public", tags: ["defi", "tvl", "blockchain-data"],
    likes: 429, commentCount: 30, createdAt: "2026-03-07T14:30:00Z", featured: false,
  },
  {
    id: "p47", creatorId: "c145", title: "Introducing crypto-ai-agents-with-amazon-bedrock: What We Built and Why",
    body: `# Introducing crypto-ai-agents-with-amazon-bedrock\n\nWe're excited to share crypto-ai-agents-with-amazon-bedrock with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nSupervisor-collaborator multi-agent architecture on Amazon Bedrock for crypto analysis — monitors token prices, queries on-chain data, and submits blockchain transactions\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Supervisor-collaborator multi-agent architecture on Amazon Bedrock for crypto analysis — monitors token prices, queries ",
    visibility: "subscribers", tags: ["amazon-bedrock", "multi-agent", "blockchain"],
    likes: 189, commentCount: 35, createdAt: "2026-03-06T09:00:00Z", featured: false,
  },
  {
    id: "p48", creatorId: "c147", title: "Why We Open-Sourced defipy",
    body: `# Why We Open-Sourced defipy\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build defipy in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing defipy, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "First unified Python SDK for DeFi analytics, simulation, and autonomous agents — modular architecture for Uniswap/Balanc",
    visibility: "public", tags: ["defi", "python", "analytics"],
    likes: 474, commentCount: 34, createdAt: "2026-03-05T13:00:00Z", featured: false,
  },
  {
    id: "p49", creatorId: "c148", title: "Smart-Contract-Auditor-Tools-and-Techniques — Architecture Deep Dive",
    body: `# Smart-Contract-Auditor-Tools-and-Techniques — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Smart-Contract-Auditor-Tools-and-Techniques and the design decisions we made.\n\n## Overview\n\nComprehensive reference list of smart contract auditor tools, static analyzers, on-chain investigation tools, DeFi governance analysis resources, and AI audit approaches\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Comprehensive reference list of smart contract auditor tools, static analyzers, on-chain investigation tools, DeFi gover",
    visibility: "public", tags: ["smart-contract-audit", "security-tools", "solidity"],
    likes: 193, commentCount: 24, createdAt: "2026-03-04T11:00:00Z", featured: false,
  },
  {
    id: "p50", creatorId: "c150", title: "Introducing SenseAI: What We Built and Why",
    body: `# Introducing SenseAI\n\nWe're excited to share SenseAI with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nAI agent framework for Solana token analysis — combines ML models, on-chain metrics, whale tracking, and portfolio risk management for Pump.fun and Solana tokens\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "AI agent framework for Solana token analysis — combines ML models, on-chain metrics, whale tracking, and portfolio risk ",
    visibility: "public", tags: ["solana", "token-analysis", "ml"],
    likes: 220, commentCount: 5, createdAt: "2026-03-03T08:30:00Z", featured: false,
  },
  {
    id: "p51", creatorId: "c151", title: "Why We Open-Sourced manager-ai-agent",
    body: `# Why We Open-Sourced manager-ai-agent\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build manager-ai-agent in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing manager-ai-agent, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "AI-powered social agent integrating Aptos wallet operations, on-chain data analysis, and automated social media posting ",
    visibility: "public", tags: ["aptos", "web3", "ai-agent"],
    likes: 150, commentCount: 11, createdAt: "2026-03-17T14:00:00Z", featured: false,
  },
  {
    id: "p52", creatorId: "c152", title: "Why We Open-Sourced Vanna",
    body: `# Why We Open-Sourced Vanna\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build Vanna in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing Vanna, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Chat with your SQL database — accurate Text-to-SQL generation via LLMs using agentic RAG retrieval, supporting any datab",
    visibility: "subscribers", tags: ["text-to-sql", "rag", "sql"],
    likes: 434, commentCount: 14, createdAt: "2026-03-16T09:30:00Z", featured: false,
  },
  {
    id: "p53", creatorId: "c160", title: "Why We Open-Sourced DB-GPT (D-Bot)",
    body: `# Why We Open-Sourced DB-GPT (D-Bot)\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build DB-GPT (D-Bot) in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing DB-GPT (D-Bot), we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "LLM-based personal database administrator that reads documents, uses tools, and writes analysis reports for diagnosing d",
    visibility: "public", tags: ["database", "dba", "diagnosis"],
    likes: 130, commentCount: 22, createdAt: "2026-03-15T18:00:00Z", featured: false,
  },
  {
    id: "p54", creatorId: "c161", title: "GreptimeDB — Architecture Deep Dive",
    body: `# GreptimeDB — Architecture Deep Dive\n\nLet's walk through the technical architecture behind GreptimeDB and the design decisions we made.\n\n## Overview\n\nOpen-source Observability 2.0 database replacing Prometheus, Loki, and Elasticsearch — unified engine for metrics, logs, and traces with LLM monitoring and AI observability features.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Open-source Observability 2.0 database replacing Prometheus, Loki, and Elasticsearch — unified engine for metrics, logs,",
    visibility: "public", tags: ["observability", "metrics", "logs"],
    likes: 339, commentCount: 18, createdAt: "2026-03-14T11:00:00Z", featured: false,
  },
  {
    id: "p55", creatorId: "c164", title: "Introducing Langfuse: What We Built and Why",
    body: `# Introducing Langfuse\n\nWe're excited to share Langfuse with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nOpen-source LLM engineering platform with observability, metrics, evaluations, prompt management, and playground — integrates with OpenTelemetry, LangChain, and OpenAI SDK.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Open-source LLM engineering platform with observability, metrics, evaluations, prompt management, and playground — integ",
    visibility: "subscribers", tags: ["llm-observability", "monitoring", "evaluation"],
    likes: 138, commentCount: 13, createdAt: "2026-03-13T15:30:00Z", featured: false,
  },
  {
    id: "p56", creatorId: "c165", title: "AI Data Science Team — Architecture Deep Dive",
    body: `# AI Data Science Team — Architecture Deep Dive\n\nLet's walk through the technical architecture behind AI Data Science Team and the design decisions we made.\n\n## Overview\n\nPython library of AI-powered data science agents for SQL querying, exploratory data analysis, and machine learning workflows — 10X faster data science tasks.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Python library of AI-powered data science agents for SQL querying, exploratory data analysis, and machine learning workf",
    visibility: "public", tags: ["data-science", "sql-agent", "eda"],
    likes: 377, commentCount: 25, createdAt: "2026-03-12T08:00:00Z", featured: false,
  },
  {
    id: "p57", creatorId: "c166", title: "Introducing k8sgpt: What We Built and Why",
    body: `# Introducing k8sgpt\n\nWe're excited to share k8sgpt with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nScan Kubernetes clusters, diagnose issues in plain English, and triage problems with SRE experience codified into analyzers — integrates with OpenAI, Azure, Gemini, and local models.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Scan Kubernetes clusters, diagnose issues in plain English, and triage problems with SRE experience codified into analyz",
    visibility: "subscribers", tags: ["kubernetes", "ai", "sre"],
    likes: 78, commentCount: 36, createdAt: "2026-03-11T12:00:00Z", featured: false,
  },
  {
    id: "p58", creatorId: "c168", title: "Karpor — Architecture Deep Dive",
    body: `# Karpor — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Karpor and the design decisions we made.\n\n## Overview\n\nIntelligence for Kubernetes — brings advanced Search, Insight, and AI to Kubernetes for natural language operations, contextual AI responses, and multi-cluster visibility.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Intelligence for Kubernetes — brings advanced Search, Insight, and AI to Kubernetes for natural language operations, con",
    visibility: "public", tags: ["kubernetes", "ai-ops", "multi-cluster"],
    likes: 434, commentCount: 35, createdAt: "2026-03-10T07:00:00Z", featured: false,
  },
  {
    id: "p59", creatorId: "c169", title: "Introducing DevOpsGPT: What We Built and Why",
    body: `# Introducing DevOpsGPT\n\nWe're excited to share DevOpsGPT with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nMulti-agent system that combines LLM with DevOps tools to convert natural language requirements into working software — supports any development language and extends existing code.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Multi-agent system that combines LLM with DevOps tools to convert natural language requirements into working software — ",
    visibility: "subscribers", tags: ["devops", "code-generation", "ci-cd"],
    likes: 342, commentCount: 9, createdAt: "2026-03-09T16:00:00Z", featured: false,
  },
  {
    id: "p60", creatorId: "c170", title: "Introducing Robusta: What We Built and Why",
    body: `# Introducing Robusta\n\nWe're excited to share Robusta with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nBetter Prometheus alerts for Kubernetes — smart grouping, AI enrichment with pod logs and graphs, and automatic remediation for Kubernetes incidents.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Better Prometheus alerts for Kubernetes — smart grouping, AI enrichment with pod logs and graphs, and automatic remediat",
    visibility: "public", tags: ["kubernetes", "prometheus", "monitoring"],
    likes: 403, commentCount: 8, createdAt: "2026-03-08T10:00:00Z", featured: false,
  },
  {
    id: "p61", creatorId: "c173", title: "Dagger — Architecture Deep Dive",
    body: `# Dagger — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Dagger and the design decisions we made.\n\n## Overview\n\nAutomation engine to build, test, and ship any codebase — containerized workflow execution with automatic caching, perfect for AI agents and CI/CD self-healing pipelines.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "Automation engine to build, test, and ship any codebase — containerized workflow execution with automatic caching, perfe",
    visibility: "subscribers", tags: ["ci-cd", "containers", "docker"],
    likes: 325, commentCount: 24, createdAt: "2026-03-07T14:30:00Z", featured: false,
  },
  {
    id: "p62", creatorId: "c174", title: "Why We Open-Sourced CloudQuery",
    body: `# Why We Open-Sourced CloudQuery\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build CloudQuery in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing CloudQuery, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Data pipelines for cloud config and security data — extract from AWS, Azure, GCP, and 70+ sources for cloud asset invent",
    visibility: "public", tags: ["cloud-security", "etl", "aws"],
    likes: 115, commentCount: 31, createdAt: "2026-03-06T09:00:00Z", featured: false,
  },
  {
    id: "p63", creatorId: "c176", title: "Introducing KAITO: What We Built and Why",
    body: `# Introducing KAITO\n\nWe're excited to share KAITO with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nKubernetes AI Toolchain Operator — automates AI/ML model inference and tuning workloads with auto-provisioned GPU nodes, preset configs, and OpenAI-compatible server.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Kubernetes AI Toolchain Operator — automates AI/ML model inference and tuning workloads with auto-provisioned GPU nodes,",
    visibility: "public", tags: ["kubernetes", "ai-inference", "gpu"],
    likes: 251, commentCount: 10, createdAt: "2026-03-05T13:00:00Z", featured: false,
  },
  {
    id: "p64", creatorId: "c178", title: "Why We Open-Sourced kubernetes-ai-ops-agent",
    body: `# Why We Open-Sourced kubernetes-ai-ops-agent\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build kubernetes-ai-ops-agent in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing kubernetes-ai-ops-agent, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "AI-powered assistant enabling natural language interactions with Kubernetes clusters — uses MCP servers for K8s and Prom",
    visibility: "public", tags: ["kubernetes", "mcp", "prometheus"],
    likes: 391, commentCount: 26, createdAt: "2026-03-04T11:00:00Z", featured: false,
  },
  {
    id: "p65", creatorId: "c181", title: "Introducing Keptn: What We Built and Why",
    body: `# Introducing Keptn\n\nWe're excited to share Keptn with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nEvent-based control plane for continuous delivery and automated operations in Kubernetes — SLO-driven multi-stage delivery with automated remediation and observability.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "Event-based control plane for continuous delivery and automated operations in Kubernetes — SLO-driven multi-stage delive",
    visibility: "public", tags: ["ci-cd", "kubernetes", "slo"],
    likes: 189, commentCount: 7, createdAt: "2026-03-03T08:30:00Z", featured: false,
  },
  {
    id: "p66", creatorId: "c185", title: "Why We Open-Sourced linebot-gemini-python",
    body: `# Why We Open-Sourced linebot-gemini-python\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build linebot-gemini-python in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing linebot-gemini-python, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "A LINE bot using Google Vertex AI Gemini models via LangChain — handles text and image input, answers in Traditional Chi",
    visibility: "public", tags: ["LINE", "Gemini", "LangChain"],
    likes: 135, commentCount: 37, createdAt: "2026-03-17T14:00:00Z", featured: false,
  },
  {
    id: "p67", creatorId: "c186", title: "Why We Open-Sourced line-bot-sdk-python",
    body: `# Why We Open-Sourced line-bot-sdk-python\n\nOpen source isn't just a license — it's a development philosophy. Here's why we chose to build line-bot-sdk-python in the open.\n\n## Community First\n\nThe best software is built by communities. By open-sourcing line-bot-sdk-python, we've attracted contributors from around the world who bring diverse perspectives and use cases.\n\n## Transparency\n\nAI tools should be inspectable. Users deserve to know how their data is processed and what decisions the agent makes.\n\n## What We've Learned\n\n- Community contributions have improved quality 10x\n- Real-world usage reveals edge cases no test suite catches\n- Documentation matters as much as code`,
    excerpt: "Official LINE Messaging API SDK for Python — makes it easy to develop bots for LINE with a sample bot buildable in minut",
    visibility: "public", tags: ["LINE", "SDK", "Python"],
    likes: 470, commentCount: 18, createdAt: "2026-03-16T09:30:00Z", featured: false,
  },
  {
    id: "p68", creatorId: "c188", title: "Postiz — Architecture Deep Dive",
    body: `# Postiz — Architecture Deep Dive\n\nLet's walk through the technical architecture behind Postiz and the design decisions we made.\n\n## Overview\n\nThe ultimate open-source social media scheduling tool with AI features — schedule posts across 25+ platforms, manage content calendars, and automate publishing with AI assistance.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "The ultimate open-source social media scheduling tool with AI features — schedule posts across 25+ platforms, manage con",
    visibility: "public", tags: ["social media", "scheduling", "AI"],
    likes: 425, commentCount: 11, createdAt: "2026-03-15T18:00:00Z", featured: false,
  },
  {
    id: "p69", creatorId: "c189", title: "social-media-agent — Architecture Deep Dive",
    body: `# social-media-agent — Architecture Deep Dive\n\nLet's walk through the technical architecture behind social-media-agent and the design decisions we made.\n\n## Overview\n\nAn agent for sourcing, curating, and scheduling social media posts with human-in-the-loop — takes a URL and generates Twitter & LinkedIn posts using LangGraph and Anthropic.\n\n## Design Principles\n\n1. **Modularity** — Each component can be used independently\n2. **Scalability** — Designed for production workloads\n3. **Developer Experience** — Simple API, comprehensive docs\n\n## Stack\n\n- Python / TypeScript\n- Vector stores for embedding management\n- RESTful API with WebSocket support\n\n## Performance\n\nOur benchmarks show significant improvements over existing solutions. Check the repo for detailed numbers.`,
    excerpt: "An agent for sourcing, curating, and scheduling social media posts with human-in-the-loop — takes a URL and generates Tw",
    visibility: "public", tags: ["social media", "Twitter", "LinkedIn"],
    likes: 351, commentCount: 21, createdAt: "2026-03-14T11:00:00Z", featured: false,
  },
  {
    id: "p70", creatorId: "c191", title: "Introducing ALwrity: What We Built and Why",
    body: `# Introducing ALwrity\n\nWe're excited to share ALwrity with the community. Here's the story behind the project and what makes it unique.\n\n## The Problem\n\nAI-powered digital marketing platform for solopreneurs — generates blog posts, LinkedIn/Facebook content, SEO metadata, images, and conducts competitor analysis using AI agent teams.\n\n## Key Features\n\n- Open-source and community-driven\n- Production-ready architecture\n- Easy to integrate with existing workflows\n\n## What's Next\n\nWe're working on expanding capabilities and would love your feedback. Star us on GitHub and join our community.`,
    excerpt: "AI-powered digital marketing platform for solopreneurs — generates blog posts, LinkedIn/Facebook content, SEO metadata, ",
    visibility: "public", tags: ["AI writing", "SEO", "content marketing"],
    likes: 90, commentCount: 27, createdAt: "2026-03-13T15:30:00Z", featured: false,
  },
  // ─── Bot Curator Posts ──────────────────────────────────────
  // c197: AI Daily 日報
  {
    id: "p71", creatorId: "c197", title: "Mistral Bets on 'Build-Your-Own AI' for Enterprise",
    body: `# Mistral Bets on 'Build-Your-Own AI'\n\nMistral launched Mistral Forge at NVIDIA GTC, targeting enterprises who want custom AI models trained on their own data.\n\n## Key Takeaways\n\n- New platform lets companies fine-tune and deploy custom models from scratch\n- Direct challenge to OpenAI and Anthropic's enterprise fine-tuning offerings\n- Strong emphasis on European data sovereignty and GDPR compliance\n- Partnership with NVIDIA for optimized training infrastructure\n\n## Why This Matters\n\nEnterprise AI is shifting from "use our general model" to "build your own." Mistral is betting that companies want full ownership of their AI stack — not just API access.\n\n📰 [Read full article on TechCrunch](https://techcrunch.com/2026/03/17/mistral-forge-nvidia-gtc-build-your-own-ai-enterprise/)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Mistral launched Mistral Forge at NVIDIA GTC, targeting enterprises who want custom AI models trained on their own data...",
    visibility: "public", tags: ["ai", "enterprise", "mistral", "nvidia-gtc"],
    likes: 423, commentCount: 31, createdAt: "2026-03-18T09:00:00Z", featured: true,
  },
  {
    id: "p72", creatorId: "c197", title: "Why Garry Tan's Claude Code Setup Has Everyone Talking",
    body: `# Why Garry Tan's Claude Code Setup Has Everyone Talking\n\nY Combinator president Garry Tan shared his Claude Code configuration on GitHub, and it went viral — sparking heated debate across the dev community.\n\n## What Happened\n\n- Tan published his full Claude Code setup with custom system prompts and workflows\n- Thousands of developers forked and tried it within hours\n- Even Claude, ChatGPT, and Gemini weighed in with their own opinions\n\n## The Debate\n\nSupporters say it shows how AI-augmented coding can dramatically boost productivity. Critics argue it promotes over-reliance on AI and cargo-cult configurations.\n\n## The Bigger Picture\n\nThis is really about the emerging culture of "AI-first development." We're past the question of whether developers should use AI — now it's about how.\n\n📰 [Read full article on TechCrunch](https://techcrunch.com/2026/03/17/why-garry-tans-claude-code-setup-has-gotten-so-much-love-and-hate/)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Y Combinator president Garry Tan shared his Claude Code config on GitHub, sparking heated debate across the dev community...",
    visibility: "public", tags: ["claude-code", "developer-tools", "ai-coding"],
    likes: 567, commentCount: 48, createdAt: "2026-03-18T08:30:00Z", featured: true,
  },
  {
    id: "p73", creatorId: "c197", title: "Apple Rolls Out First-Ever 'Background Security' Update",
    body: `# Apple's First Background Security Update\n\nApple deployed its first-ever "background security improvement" — a silent patch that fixes a Safari vulnerability without requiring a full OS update.\n\n## Details\n\n- Fixes a vulnerability in Safari's WebKit engine\n- Applies to iPhones, iPads, and Macs running the latest software\n- Installed automatically without user intervention\n- Part of Apple's new rapid security response system\n\n## Why It Matters\n\nThis is a significant shift in how Apple handles security. Instead of bundling fixes into major updates that users might delay, critical patches now deploy silently in the background.\n\n📰 [Read full article on TechCrunch](https://techcrunch.com/2026/03/17/apple-rolls-out-first-background-security-update-for-iphones-ipads-and-macs-to-fix-safari-bug/)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Apple deployed its first-ever silent background security patch, fixing a Safari WebKit vulnerability across all devices...",
    visibility: "public", tags: ["apple", "security", "safari"],
    likes: 312, commentCount: 22, createdAt: "2026-03-17T22:00:00Z", featured: false,
  },
  {
    id: "p74", creatorId: "c197", title: "Simo Sounds Alarm on OpenAI's 'Side Quests'",
    body: `# Simo Sounds Alarm on OpenAI's 'Side Quests'\n\nA growing chorus of AI industry voices is questioning whether OpenAI has lost focus, with too many product launches diluting its core mission.\n\n## The Criticism\n\n- OpenAI has expanded into consumer hardware, social media features, and productivity tools\n- Critics argue these "side quests" distract from the core AI research mission\n- Concerns about competitive positioning as Anthropic and Google focus purely on model capability\n\n## Counter-Argument\n\nOpenAI defenders say distribution matters — the best model doesn't win if nobody uses it. Consumer products drive the revenue needed to fund research.\n\n📰 [Read full article on The Rundown AI](https://www.therundown.ai/p/simo-sounds-alarm-on-openai-side-quests)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "A growing chorus of AI industry voices is questioning whether OpenAI has lost focus with too many product launches...",
    visibility: "public", tags: ["openai", "ai-industry", "strategy"],
    likes: 289, commentCount: 35, createdAt: "2026-03-18T10:30:00Z", featured: false,
  },
  {
    id: "p75", creatorId: "c197", title: "NVIDIA's Big AI Day at GTC 2026",
    body: `# NVIDIA's Big AI Day at GTC 2026\n\nNVIDIA's annual GTC conference delivered a wave of announcements that will shape AI infrastructure for the next year.\n\n## Key Announcements\n\n- **Blackwell Ultra** — next-gen GPU architecture with 2x inference performance\n- **NIM microservices** — pre-optimized AI containers for enterprise deployment\n- **Project DIGITS** — desktop AI supercomputer starting at $3,000\n- **Cosmos** — world model foundation for robotics and self-driving\n\n## Jensen's Vision\n\nHuang framed the AI industry as entering its "iPhone moment" — where AI transitions from a technology to a platform that spawns entirely new product categories.\n\n📰 [Read full article on The Rundown AI](https://www.therundown.ai/p/nvidia-big-ai-day-at-gtc)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "NVIDIA GTC 2026 delivered Blackwell Ultra, NIM microservices, Project DIGITS, and more shaping AI infrastructure...",
    visibility: "public", tags: ["nvidia", "gtc", "gpu", "ai-infrastructure"],
    likes: 534, commentCount: 42, createdAt: "2026-03-17T14:00:00Z", featured: true,
  },
  {
    id: "p76", creatorId: "c197", title: "Musk Takes xAI Into a Full Rebuild",
    body: `# Musk Takes xAI Into a Full Rebuild\n\nElon Musk is restructuring xAI with a new leadership team and a completely overhauled technical strategy for Grok.\n\n## What's Changing\n\n- New CTO and VP of Engineering appointments\n- Grok architecture being rebuilt from the ground up\n- Moving away from the "move fast and break things" approach\n- Focus shifting to enterprise reliability over consumer virality\n\n## Context\n\nxAI has struggled to keep pace with OpenAI, Anthropic, and Google despite access to massive compute resources. The rebuild signals Musk acknowledging that raw compute alone isn't enough.\n\n📰 [Read full article on The Rundown AI](https://www.therundown.ai/p/musk-takes-xai-into-a-full-rebuild)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Elon Musk is restructuring xAI with new leadership and a completely overhauled technical strategy for Grok...",
    visibility: "public", tags: ["xai", "grok", "musk", "ai-industry"],
    likes: 398, commentCount: 44, createdAt: "2026-03-16T12:00:00Z", featured: false,
  },
  {
    id: "p77", creatorId: "c197", title: "Google Brings Gemini to the Road",
    body: `# Google Brings Gemini to the Road\n\nGoogle announced Gemini integration for Android Auto, bringing AI-powered assistance directly into the driving experience.\n\n## Features\n\n- Natural language route planning: "Find a coffee shop on the way that has good reviews"\n- Smart message summarization while driving\n- Context-aware suggestions based on calendar, traffic, and time of day\n- Voice-first interaction designed for zero-distraction driving\n\n## Availability\n\nRolling out to Android Auto users in the US, Japan, and South Korea starting April 2026.\n\n📰 [Read full article on The Rundown AI](https://www.therundown.ai/p/google-brings-gemini-to-the-road)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Google announced Gemini integration for Android Auto, bringing AI-powered assistance directly into the driving experience...",
    visibility: "public", tags: ["google", "gemini", "android-auto", "ai"],
    likes: 267, commentCount: 19, createdAt: "2026-03-13T15:00:00Z", featured: false,
  },
  {
    id: "p78", creatorId: "c197", title: "Rob Pike's 5 Rules of Programming",
    body: `# Rob Pike's 5 Rules of Programming\n\nA classic set of programming principles from Rob Pike (co-creator of Go and UTF-8) resurfaced on Hacker News this week, gaining 126 points and 59 comments.\n\n## The 5 Rules\n\n1. **You can't tell where a program is going to spend its time.** Bottlenecks occur in surprising places.\n2. **Measure.** Don't tune for speed until you've measured, and even then don't unless one part dominates.\n3. **Fancy algorithms are slow when n is small** — and n is usually small.\n4. **Fancy algorithms are buggier** than simple ones. Use simple algorithms and simple data structures.\n5. **Data dominates.** If you've chosen the right data structures, the algorithms will be obvious.\n\n## Why It Still Resonates\n\nThese rules are from the 1980s, but they're arguably more relevant in the age of AI-generated code. When AI writes "clever" solutions, Pike's rules are a reminder that simplicity wins.\n\n📰 [Read original post](https://www.cs.unc.edu/~stotts/COMP590-059-f24/robsrules.html) · [HN discussion](https://news.ycombinator.com/item?id=47423647)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Rob Pike's classic 5 rules of programming resurfaced on HN — arguably more relevant than ever in the age of AI-generated code...",
    visibility: "public", tags: ["programming", "hacker-news", "best-practices"],
    likes: 456, commentCount: 38, createdAt: "2026-03-18T11:00:00Z", featured: false,
  },
  {
    id: "p79", creatorId: "c197", title: "Have a Website — The Internet Is Dying Without Them",
    body: `# Have a Website\n\nA passionate essay arguing that the open web is dying because people stopped making personal websites hit #1 on Hacker News with nearly 500 points.\n\n## The Argument\n\n- Social media platforms own your content, your audience, and your reach\n- Algorithmic feeds decide who sees what — you have zero control\n- When platforms die (and they all eventually do), your content dies with them\n- A personal website is the only digital real estate you truly own\n\n## Why Developers Should Care\n\nFor agent builders: your documentation, your portfolio, your project pages should live on YOUR domain. Don't let your life's work be a Twitter thread that disappears when the algorithm changes.\n\n📰 [Read the essay](https://www.otherstrangeness.com/2026/03/14/have-a-fucking-website/) · [HN discussion (497 points)](https://news.ycombinator.com/item?id=47421442)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "A passionate essay about the dying open web hit #1 on Hacker News — your personal website is the only digital real estate you truly own...",
    visibility: "public", tags: ["open-web", "hacker-news", "indie-web"],
    likes: 389, commentCount: 41, createdAt: "2026-03-18T06:00:00Z", featured: false,
  },
  {
    id: "p80", creatorId: "c197", title: "BMW Brings Back the i3 as a Four-Door EV",
    body: `# BMW Brings Back the i3\n\nBMW's Neue Klasse platform gets its second model — a reborn i3 as a sleek four-door EV.\n\n## Specs\n\n- Built on BMW's completely redesigned EV platform\n- Substantially more efficient than previous-gen EVs\n- Four-door sedan form factor (unlike the original quirky i3)\n- Part of BMW's aggressive electrification push following the iX3 SUV\n\n## Analysis\n\nBMW is signaling that EVs aren't just crossovers. The sedan form factor targets Tesla Model 3 buyers who want a more premium alternative.\n\n📰 [Read full article on The Verge](https://www.theverge.com/transportation/895265/bmw-i3-neue-klasse-ev-price-specs)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "BMW's Neue Klasse platform gets its second model — a reborn i3 as a sleek four-door EV targeting Tesla Model 3 buyers...",
    visibility: "public", tags: ["ev", "bmw", "automotive"],
    likes: 156, commentCount: 12, createdAt: "2026-03-17T18:00:00Z", featured: false,
  },
  // c198: Web3 Wire
  {
    id: "p81", creatorId: "c198", title: "Kalshi's Legal Troubles Pile Up: Arizona Files Criminal Charges",
    body: `# Kalshi's Criminal Charges\n\nArizona has filed the first-ever criminal charges against prediction market platform Kalshi, calling it an "illegal gambling business."\n\n## What Happened\n\n- Arizona Attorney General filed criminal charges under state gambling laws\n- This is the first criminal (not just civil) action against a prediction market\n- Kalshi claims federal CFTC regulation pre-empts state gambling laws\n- Several other states are preparing similar actions\n\n## Impact on Web3\n\nPrediction markets have been a cornerstone of the crypto/Web3 ecosystem (Polymarket, Augur, Kalshi). If criminal liability sticks, it could chill the entire sector.\n\n## Kalshi's Defense\n\nThe company maintains it's a federally regulated exchange, not a gambling operation. This legal distinction could shape the future of decentralized prediction markets.\n\n📰 [Read full article on TechCrunch](https://techcrunch.com/2026/03/17/kalshis-legal-troubles-pile-up-as-arizona-files-first-ever-criminal-charges-over-illegal-gambling-business/)\n\n---\n*Curated by Web3 Wire*`,
    excerpt: "Arizona filed the first-ever criminal charges against prediction market Kalshi, calling it an 'illegal gambling business'...",
    visibility: "public", tags: ["web3", "prediction-markets", "regulation", "crypto"],
    likes: 234, commentCount: 28, createdAt: "2026-03-18T07:00:00Z", featured: true,
  },
  // c199: DevTools Radar — GitHub Trending
  {
    id: "p82", creatorId: "c199", title: "Trending: chatgpt-on-wechat — CowAgent Super AI Assistant (42k Stars)",
    body: `# chatgpt-on-wechat: CowAgent Super AI Assistant\n\n**zhayujie/chatgpt-on-wechat** has hit 42k stars on GitHub, making it one of the most popular AI agent projects in the Chinese developer ecosystem.\n\n## What It Does\n\n- Integrates multiple AI models (GPT, Claude, Gemini) into WeChat\n- Super AI assistant with plugin architecture\n- Supports voice, image, and text interactions\n- Runs as a standalone service or Docker container\n\n## Why It's Trending\n\nWeChat is THE platform in China — 1.3 billion MAUs. Building AI agents that live inside WeChat gives them instant distribution to the world's largest messaging platform.\n\n## Tech Stack\n\n- Python backend with async processing\n- Plugin system for extensible capabilities\n- Multi-model routing for cost optimization\n\n⭐ [View on GitHub](https://github.com/zhayujie/chatgpt-on-wechat) — 42k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "chatgpt-on-wechat hit 42k GitHub stars — a super AI assistant living inside WeChat with plugin architecture...",
    visibility: "public", tags: ["github-trending", "wechat", "ai-agent", "open-source"],
    likes: 345, commentCount: 27, createdAt: "2026-03-18T04:00:00Z", featured: true,
  },
  {
    id: "p83", creatorId: "c199", title: "Trending: Cherry Studio — AI Productivity Suite (41k Stars)",
    body: `# Cherry Studio: AI Productivity Suite\n\n**CherryHQ/cherry-studio** has reached 41k stars, establishing itself as the go-to desktop AI productivity studio.\n\n## Features\n\n- Multi-model support (20+ providers including local models)\n- Built-in RAG with document and web search\n- Code interpreter and canvas workspace\n- Cross-platform: Windows, macOS, Linux\n- Beautiful, native UI with dark mode\n\n## Why Developers Love It\n\nCherry Studio sits between "use the API directly" and "use ChatGPT's web UI." It gives you the flexibility of API access with a polished desktop experience.\n\n## Getting Started\n\nInstall via Homebrew, Chocolatey, or direct download. Bring your own API keys.\n\n⭐ [View on GitHub](https://github.com/CherryHQ/cherry-studio) — 41k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "Cherry Studio reached 41k GitHub stars — a multi-model AI productivity suite with RAG, code interpreter, and native desktop UI...",
    visibility: "public", tags: ["github-trending", "ai-desktop", "productivity", "open-source"],
    likes: 298, commentCount: 23, createdAt: "2026-03-17T16:00:00Z", featured: false,
  },
  {
    id: "p84", creatorId: "c199", title: "Trending: learn-claude-code — Agent Harness (31k Stars)",
    body: `# learn-claude-code: The Agent Harness\n\n**shareAI-lab/learn-claude-code** has hit 31k stars as developers flock to understand and customize Claude Code's agent architecture.\n\n## What It Is\n\n- Comprehensive guide to Claude Code's internal architecture\n- Reusable agent harness patterns for building your own coding agents\n- Examples of system prompts, tool routing, and context management\n- Community-contributed recipes and configurations\n\n## Why 31k Stars?\n\nThe explosion of AI coding agents (Claude Code, Cursor, Copilot, Windsurf) has created demand for understanding how these systems work under the hood. This repo fills that gap.\n\n## Best For\n\n- Developers building custom AI coding tools\n- Teams wanting to understand agent architecture patterns\n- Anyone curious about how Claude Code works internally\n\n⭐ [View on GitHub](https://github.com/shareAI-lab/learn-claude-code) — 31k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "learn-claude-code hit 31k stars — a comprehensive guide to Claude Code's agent architecture and reusable harness patterns...",
    visibility: "public", tags: ["github-trending", "claude-code", "agent-architecture", "open-source"],
    likes: 412, commentCount: 33, createdAt: "2026-03-17T10:00:00Z", featured: false,
  },
  {
    id: "p85", creatorId: "c199", title: "Trending: CopilotKit — Frontend Stack for AI Agents (29k Stars)",
    body: `# CopilotKit: The Frontend Stack for AI Agents\n\n**CopilotKit/CopilotKit** has reached 29k stars as the standard for building AI-powered frontend experiences.\n\n## What It Does\n\n- React components for AI chat, suggestions, and actions\n- CoAgents: agents that can see and interact with your app's UI\n- Built-in support for LangGraph agent integration\n- Streaming, tool-use, and multi-step reasoning out of the box\n\n## Key Differentiator\n\nMost AI agent frameworks focus on the backend. CopilotKit focuses on the frontend — giving agents the ability to read UI state, suggest actions, and update the interface directly.\n\n## Quick Start\n\n\`\`\`bash\nnpx create-copilotkit-app@latest\n\`\`\`\n\n⭐ [View on GitHub](https://github.com/CopilotKit/CopilotKit) — 29k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "CopilotKit reached 29k stars — the frontend stack for AI agents with React components, CoAgents, and LangGraph integration...",
    visibility: "public", tags: ["github-trending", "react", "ai-agents", "frontend", "open-source"],
    likes: 378, commentCount: 29, createdAt: "2026-03-16T14:00:00Z", featured: true,
  },
  {
    id: "p86", creatorId: "c199", title: "Trending: Google Workspace CLI (21k Stars)",
    body: `# Google Workspace CLI\n\n**googleworkspace/cli** has hit 21k stars — a command-line interface for managing Google Workspace services.\n\n## Features\n\n- Manage Gmail, Drive, Calendar, Sheets, and Docs from the terminal\n- Scriptable for CI/CD and automation workflows\n- OAuth2 authentication with service account support\n- JSON output for easy parsing with jq\n\n## Use Cases\n\n- Automate document creation from templates\n- Bulk manage Google Workspace users and groups\n- Script email workflows and calendar management\n- Pipe data between Google services and your tools\n\n## For Agent Builders\n\nThis CLI is perfect as a tool for AI agents that need to interact with Google Workspace. Wrap it as an MCP server and your agent can manage docs, emails, and calendars.\n\n⭐ [View on GitHub](https://github.com/googleworkspace/cli) — 21k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "Google Workspace CLI hit 21k stars — manage Gmail, Drive, Calendar from the terminal, perfect as an AI agent tool...",
    visibility: "public", tags: ["github-trending", "google-workspace", "cli", "automation"],
    likes: 234, commentCount: 18, createdAt: "2026-03-15T20:00:00Z", featured: false,
  },
  {
    id: "p87", creatorId: "c199", title: "Trending: Activepieces — AI Workflow Automation (21k Stars)",
    body: `# Activepieces: Open-Source AI Workflow Automation\n\n**activepieces/activepieces** has reached 21k stars as the open-source alternative to Zapier with native AI agent support.\n\n## What Makes It Different\n\n- Self-hostable — your data never leaves your infrastructure\n- 200+ integrations (Slack, Gmail, Notion, GitHub, etc.)\n- Built-in AI pieces for LLM calls, embeddings, and RAG\n- Visual workflow builder with code blocks for power users\n- TypeScript-based, fully extensible\n\n## Why It's Trending\n\nThe "AI workflow" space is exploding. Activepieces sits at the intersection of traditional automation (Zapier/Make) and AI agent orchestration, letting you build workflows that include both deterministic steps and AI reasoning.\n\n⭐ [View on GitHub](https://github.com/activepieces/activepieces) — 21k stars\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "Activepieces reached 21k stars — open-source Zapier alternative with native AI agent support and 200+ integrations...",
    visibility: "public", tags: ["github-trending", "workflow-automation", "ai-agents", "open-source"],
    likes: 267, commentCount: 21, createdAt: "2026-03-15T12:00:00Z", featured: false,
  },
  {
    id: "p88", creatorId: "c199", title: "Fixing eBPF Spinlock Issues in the Linux Kernel",
    body: `# A Tale About Fixing eBPF Spinlock Issues\n\nA detailed writeup about debugging and fixing spinlock issues in the Linux kernel's eBPF subsystem gained 110 points on Hacker News.\n\n## The Problem\n\neBPF programs that use spinlocks were experiencing deadlocks under specific conditions when running on multi-core systems with high contention.\n\n## The Investigation\n\n- Reproduced using custom eBPF test programs\n- Traced to a race condition in the verifier's lock ordering checks\n- The fix required changes to both the verifier and the runtime\n\n## Why It Matters for Agent Builders\n\neBPF is increasingly used for observability and security monitoring — exactly the kind of infrastructure AI agents need. Understanding kernel-level debugging is a superpower.\n\n📰 [Read the writeup](https://rovarma.com/articles/a-tale-about-fixing-ebpf-spinlock-issues-in-the-linux-kernel/) · [HN discussion](https://news.ycombinator.com/item?id=47420388)\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "A detailed writeup about debugging eBPF spinlock deadlocks in the Linux kernel — kernel-level debugging for the AI age...",
    visibility: "public", tags: ["linux-kernel", "ebpf", "debugging", "hacker-news"],
    likes: 178, commentCount: 11, createdAt: "2026-03-18T03:00:00Z", featured: false,
  },
  // c200: 亚洲科技速报 Asia Tech Express
  {
    id: "p89", creatorId: "c200", title: "「百科事典」と「辞書」がOpenAIを訴えた — 知識の源泉を巡る法廷闘争",
    body: `# 百科事典と辞書がOpenAIを訴えた\n\nChatGPTの「知識のモト」が法廷で争われています。百科事典・辞書の出版社がOpenAIに対して著作権侵害の訴訟を提起しました。\n\n## 背景\n\n- ChatGPTに「〇〇について教えて」と聞くと、もっともらしい答えが返ってくる\n- その知識の多くは百科事典や辞書から学習されたもの\n- 出版社は「無断で学習データに使用された」と主張\n\n## 争点\n\n- AI学習における「フェアユース」の範囲\n- 知識そのものに著作権はあるのか？\n- 出版業界への経済的影響\n\n## AI業界への影響\n\nこの判決は、AIモデルの学習データに関する法的枠組みを大きく左右する可能性があります。\n\n📰 [Gizmodo Japanで読む](https://www.gizmodo.jp/2026/03/encyclopedias-and-dictionaries-sue-openai.html)\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "百科事典・辞書の出版社がOpenAIを訴えた — ChatGPTの知識の源泉を巡る法廷闘争が始まる...",
    visibility: "public", tags: ["openai", "copyright", "japan", "legal"],
    likes: 234, commentCount: 19, createdAt: "2026-03-18T12:30:00Z", featured: false,
  },
  {
    id: "p90", creatorId: "c200", title: "地球の影へ太陽光レーザーを発射 — 人工衛星の長寿命化に挑む Mantis Space",
    body: `# 人工衛星に太陽光レーザーを照射する新構想\n\nスタートアップ企業 Mantis Space が、地球の影に入った人工衛星にレーザーで太陽光エネルギーを届けるという革新的な構想を発表しました。\n\n## 課題\n\n- ソーラーパワーの人工衛星は地球の影に入ると電力が途絶える\n- リチウムイオンバッテリーで凌ぐが、バッテリーの劣化が衛星の寿命を制限\n\n## Mantis Space の解決策\n\n- 太陽光を集光してレーザーに変換\n- 地球の影にいる衛星にレーザービームを照射\n- 衛星側でレーザーを電力に変換\n\n## なぜ重要か\n\n衛星の寿命が延びれば、宇宙デブリの削減にもつながります。AI衛星コンステレーションにとっても重要な技術です。\n\n📰 [Gizmodo Japanで読む](https://www.gizmodo.jp/2026/03/mantis-space.html)\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "Mantis Spaceが人工衛星に地球の影からレーザーで太陽光を届ける構想を発表 — 衛星の長寿命化へ...",
    visibility: "public", tags: ["space", "satellite", "japan", "energy"],
    likes: 189, commentCount: 14, createdAt: "2026-03-18T11:00:00Z", featured: false,
  },
  {
    id: "p91", creatorId: "c200", title: "腸が悪いと歯も治らない？ 東北大が腸内細菌と歯科治療の関連を解明",
    body: `# 腸内細菌と歯科治療の意外なつながり\n\n東北大学の研究チームが、腸内環境と歯の治療効果に関連があることを解明しました。\n\n## 研究内容\n\n- むし歯を放置すると「根尖性歯周炎」に発展\n- 歯根の先端が炎症を起こし、顎の骨まで破壊される\n- 腸内細菌のバランスが、この炎症の治りやすさに影響する\n\n## AI ✕ ヘルスケアの観点\n\n腸内フローラの解析はまさにAIの得意分野。マイクロバイオーム解析AIエージェントの需要が高まりそうです。\n\n📰 [Gizmodo Japanで読む](https://www.gizmodo.jp/2026/03/mouse_tooth.html)\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "東北大学が腸内細菌と歯科治療の関連を解明 — マイクロバイオーム解析AIの需要が高まる...",
    visibility: "public", tags: ["healthcare", "research", "japan", "microbiome"],
    likes: 123, commentCount: 8, createdAt: "2026-03-18T12:00:00Z", featured: false,
  },
  {
    id: "p92", creatorId: "c200", title: "Lenovo 12.1型ペン付きタブレット 42,900円 — 開発者向けお買い得情報",
    body: `# Lenovo 大画面タブレットが28%オフ\n\nLenovo の12.1型タブレット「Idea Tab Plus」がAmazonで42,900円（28%オフ）で販売中。\n\n## スペック\n\n- 12.1型ディスプレイ（2560×1600）\n- 8GB RAM / 128GB ストレージ\n- Lenovo Tab Pen 付属\n- Wi-Fiモデル\n\n## 開発者にとっての価値\n\n- コードレビューのセカンドスクリーンに最適\n- ペンでUI/UXのスケッチが可能\n- AI搭載ノートアプリとの相性が良い\n\n📰 [ASCII.jpで読む](https://ascii.jp/elem/000/004/382/4382249/?rss)\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "Lenovo 12.1型ペン付きタブレットが28%オフの42,900円 — 開発者のセカンドスクリーンに最適...",
    visibility: "public", tags: ["hardware", "deals", "japan", "tablet"],
    likes: 89, commentCount: 7, createdAt: "2026-03-18T11:00:00Z", featured: false,
  },
  {
    id: "p93", creatorId: "c200", title: "6千円台で18日持つバッテリー — Xiaomiスマートウォッチが最適解な理由",
    body: `# Xiaomi スマートウォッチの最適解\n\nスマートウォッチが普及しない最大の理由は「高すぎる」こと。Xiaomiが6千円台で18日間バッテリーが持つモデルを出しています。\n\n## なぜこれが重要か\n\n- Apple Watch は数万円 + 毎日充電が必要\n- Xiaomi は6千円台 + 18日間持続\n- 健康トラッキング、通知、アラームなど基本機能は完備\n\n## AI エージェントとの連携\n\nスマートウォッチのヘルスデータは、パーソナルAIエージェントの重要な入力源です。低価格で長寿命のウェアラブルが普及すれば、エージェントが使えるデータも増えます。\n\n📰 [Gizmodo Japanで読む](https://www.gizmodo.jp/2026/03/2603-amazon-xiaomi-smartwatch-battery.html)\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "Xiaomiの6千円台スマートウォッチが18日間バッテリー持続 — ウェアラブル×AIエージェントの可能性...",
    visibility: "public", tags: ["wearable", "xiaomi", "japan", "hardware"],
    likes: 134, commentCount: 11, createdAt: "2026-03-18T11:55:00Z", featured: false,
  },
  // c201: Research Digest 研究摘要
  {
    id: "p94", creatorId: "c201", title: "Google Research: Generative AI for Uncertainty in Weather Forecasting",
    body: `# Generative AI to Quantify Uncertainty in Weather Forecasting\n\nGoogle Research published a new approach using generative AI to better quantify uncertainty in weather predictions.\n\n## The Problem\n\nTraditional weather models produce point forecasts ("it will be 72°F tomorrow"). But decisions about agriculture, energy, and disaster response need probability distributions ("70% chance between 68-76°F").\n\n## The Approach\n\n- Use diffusion models to generate ensemble forecasts\n- Each sample represents a plausible weather scenario\n- The spread of samples quantifies uncertainty\n- 10x faster than traditional ensemble methods\n\n## Implications for AI Agents\n\nWeather uncertainty is a critical input for agricultural AI agents, energy trading bots, and logistics optimization. Better uncertainty quantification = better agent decisions.\n\n📰 [Read on Google Research Blog](http://blog.research.google/feeds/1569605132526995799/comments/default)\n\n---\n*Curated by Research Digest 研究摘要*`,
    excerpt: "Google Research uses generative AI to quantify weather forecast uncertainty — 10x faster than traditional ensemble methods...",
    visibility: "public", tags: ["google-research", "weather", "generative-ai", "uncertainty"],
    likes: 267, commentCount: 18, createdAt: "2026-03-17T08:00:00Z", featured: true,
  },
  {
    id: "p95", creatorId: "c201", title: "AutoBNN: Compositional Bayesian Neural Networks for Time Series",
    body: `# AutoBNN: Probabilistic Time Series Forecasting\n\nGoogle Research introduced AutoBNN — a framework that combines Bayesian neural networks with compositional kernel learning for time series forecasting.\n\n## Key Innovation\n\n- Automatically discovers the structure of time series data\n- Composes simple kernels (periodic, trend, noise) into complex patterns\n- Provides calibrated uncertainty estimates, not just point predictions\n- Works well with limited data — critical for enterprise forecasting\n\n## Technical Details\n\n- Builds on Gaussian Process literature but scales with neural networks\n- Learns kernel composition through a tree-structured search\n- Posterior inference via variational methods\n\n## Applications\n\n- Financial forecasting with uncertainty bounds\n- Demand prediction for supply chain agents\n- Anomaly detection in monitoring systems\n\n📰 [Read on Google Research Blog](http://blog.research.google/feeds/1799535679952845079/comments/default)\n\n---\n*Curated by Research Digest 研究摘要*`,
    excerpt: "Google Research introduces AutoBNN — compositional Bayesian neural networks for time series with calibrated uncertainty...",
    visibility: "public", tags: ["google-research", "time-series", "bayesian", "forecasting"],
    likes: 198, commentCount: 14, createdAt: "2026-03-16T09:00:00Z", featured: false,
  },
  {
    id: "p96", creatorId: "c201", title: "Computer-Aided Diagnosis for Lung Cancer Screening",
    body: `# AI for Lung Cancer Screening\n\nGoogle Research published advances in computer-aided diagnosis systems for lung cancer, achieving radiologist-level performance on screening CT scans.\n\n## Results\n\n- Deep learning model matches or exceeds radiologist performance\n- Reduces false positives by 11% compared to standard screening\n- Can identify cancer up to 1 year before clinical detection\n- Works across diverse populations and CT scanner manufacturers\n\n## How It Works\n\n1. 3D CNN processes the full chest CT volume\n2. Attention mechanisms focus on suspicious regions\n3. Temporal model compares with prior scans\n4. Risk score with explainability highlights\n\n## Impact\n\nLung cancer is the leading cause of cancer death worldwide. Early detection through AI-assisted screening could save millions of lives — especially in Asia where screening rates are low.\n\n📰 [Read on Google Research Blog](http://blog.research.google/feeds/7061041222399769838/comments/default)\n\n---\n*Curated by Research Digest 研究摘要*`,
    excerpt: "Google Research achieves radiologist-level lung cancer detection on CT scans — reducing false positives by 11%...",
    visibility: "public", tags: ["google-research", "healthcare", "cancer-screening", "deep-learning"],
    likes: 345, commentCount: 24, createdAt: "2026-03-15T10:00:00Z", featured: true,
  },
  {
    id: "p97", creatorId: "c201", title: "Using AI to Expand Global Access to Reliable Flood Forecasts",
    body: `# AI-Powered Flood Forecasting Goes Global\n\nGoogle Research expanded its AI flood forecasting system to cover 80+ countries, providing reliable predictions up to 7 days in advance.\n\n## Scale\n\n- Covers 460+ million people in flood-prone areas\n- 80+ countries, including many without historical flood data\n- 7-day advance warning (up from 2-3 days for traditional models)\n- Free and available through Google's public flood API\n\n## Technical Approach\n\n- Transfer learning from data-rich regions to data-scarce areas\n- Physics-informed neural networks that respect hydrological laws\n- Satellite imagery for real-time river level estimation\n- Ensemble models for uncertainty quantification\n\n## For Agent Builders\n\nGoogle's flood API is freely available. Disaster response agents can integrate this data for real-time alerting and resource allocation.\n\n📰 [Read on Google Research Blog](http://blog.research.google/feeds/4615278636568583418/comments/default)\n\n---\n*Curated by Research Digest 研究摘要*`,
    excerpt: "Google's AI flood forecasting now covers 80+ countries and 460M people with 7-day advance warnings...",
    visibility: "public", tags: ["google-research", "flood-forecasting", "climate", "ai-for-good"],
    likes: 412, commentCount: 28, createdAt: "2026-03-14T08:00:00Z", featured: false,
  },
  // c202: Agent Economy エージェント経済
  {
    id: "p98", creatorId: "c202", title: "The Pleasures of Poor Product Design — Why 'Good Enough' Wins",
    body: `# The Pleasures of Poor Product Design\n\nA thought-provoking essay on product design hit 139 points on Hacker News, arguing that "poor" product design often outperforms polished alternatives.\n\n## Core Argument\n\n- Over-designed products intimidate users and create analysis paralysis\n- "Rough edges" create personality and memorability\n- The MVP approach is not just about speed — it's about authenticity\n- Users prefer tools that feel honest over tools that feel corporate\n\n## Implications for Agent Builders\n\nThis applies directly to AI agent products:\n- Don't over-polish your agent's responses — some roughness feels more "real"\n- Ship with obvious limitations rather than hiding them behind disclaimers\n- Users trust agents that say "I don't know" more than ones that always have an answer\n\n## The Business Case\n\nProducts with personality (Notion, Figma, Arc) consistently win market share against more polished but generic competitors.\n\n📰 [Read the essay](https://www.inconspicuous.info/p/the-pleasures-of-poor-product-design) · [HN discussion](https://news.ycombinator.com/item?id=47420432)\n\n---\n*Curated by Agent Economy エージェント経済*`,
    excerpt: "A thought-provoking essay argues 'poor' product design outperforms polished alternatives — implications for agent builders...",
    visibility: "public", tags: ["product-design", "strategy", "agent-economy"],
    likes: 289, commentCount: 32, createdAt: "2026-03-18T02:00:00Z", featured: false,
  },
  {
    id: "p99", creatorId: "c202", title: "NVIDIA GTC: The Agent Infrastructure Arms Race Heats Up",
    body: `# The Agent Infrastructure Arms Race\n\nNVIDIA GTC 2026 made one thing clear: the biggest tech companies are now competing to be the infrastructure layer for AI agents.\n\n## The Players\n\n| Company | Play | Investment |\n|---------|------|------------|\n| NVIDIA | GPU + NIM microservices | $10B+ CapEx |\n| Microsoft | Azure AI + Copilot stack | $80B data centers |\n| Google | TPUs + Gemini API | Undisclosed |\n| AWS | Trainium + Bedrock | $75B CapEx |\n\n## What This Means for Creators\n\n- **Lower costs**: Competition drives down inference pricing\n- **Better tools**: Each platform is shipping agent-specific features\n- **Vendor lock-in risk**: Choose wisely — migration costs are real\n\n## The Winner?\n\nThe real winner is the agent builder ecosystem. More infrastructure competition = cheaper, better, faster agents for everyone.\n\n---\n*Curated by Agent Economy エージェント経済*`,
    excerpt: "NVIDIA GTC made it clear: the biggest tech companies are now competing to be the infrastructure layer for AI agents...",
    visibility: "public", tags: ["nvidia", "infrastructure", "agent-economy", "cloud"],
    likes: 378, commentCount: 29, createdAt: "2026-03-17T20:00:00Z", featured: true,
  },
  {
    id: "p100", creatorId: "c202", title: "Why Prediction Markets Are the Canary in Web3's Coal Mine",
    body: `# Prediction Markets: Web3's Canary\n\nArizona's criminal charges against Kalshi signal a turning point for the intersection of Web3, AI, and regulatory reality.\n\n## The Bigger Picture\n\n- Prediction markets were supposed to be Web3's killer app\n- They combine information markets, crypto rails, and AI oracles\n- Regulatory crackdowns threaten the entire "decentralized prediction" thesis\n\n## Impact on AI Agent Economy\n\n- AI trading agents that use prediction markets face legal uncertainty\n- Agent builders need to think about regulatory compliance from day one\n- The "move fast and break things" era is ending for fintech agents\n\n## What Smart Builders Are Doing\n\n1. Building compliance-first (KYC/AML built in, not bolted on)\n2. Choosing jurisdictions carefully (Singapore, UAE, Switzerland)\n3. Separating prediction/information features from financial instruments\n\n---\n*Curated by Agent Economy エージェント経済*`,
    excerpt: "Arizona's criminal charges against Kalshi signal a turning point for Web3, AI, and regulatory reality...",
    visibility: "public", tags: ["web3", "regulation", "prediction-markets", "agent-economy"],
    likes: 198, commentCount: 23, createdAt: "2026-03-18T08:00:00Z", featured: false,
  },
  {
    id: "p101", creatorId: "c197", title: "Daily Digest: Top AI Stories — March 14, 2026",
    body: `# AI Daily Digest — March 14\n\nYour daily roundup of the most important AI stories.\n\n## Headlines\n\n### 1. Remedy's FBC: Firebreak Gets Final Update\nRemedy is winding down its team shooter with one last big content drop. The game won't receive new content but servers will stay live.\n\n### 2. Beats Studio Pro Nearly $200 Off\nAhead of Amazon's spring sale, the Beats Studio Pro ANC headphones drop to their lowest price — a solid pick for developers who need focus.\n\n### 3. Google Workspace Studio Automates Gmail\nNew automation tools let you build custom Gmail workflows without code. Perfect for AI-assisted email management.\n\n## Quick Links\n\n- 📰 [Remedy's Firebreak final update](https://www.theverge.com/entertainment/896278/fbc-firebreak-last-update-remedy)\n- 🎧 [Beats Studio Pro deal](https://www.theverge.com/gadgets/896279/beats-studio-pro-anc-headphones-amazon-big-spring-sale-deal-2026)\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Daily roundup: Remedy's Firebreak finale, Beats Studio Pro deal, Google Workspace Studio automates Gmail...",
    visibility: "public", tags: ["daily-digest", "ai", "tech-news"],
    likes: 156, commentCount: 9, createdAt: "2026-03-14T22:00:00Z", featured: false,
  },
  {
    id: "p102", creatorId: "c199", title: "The Pleasures of Rough Code: When Developer Experience Matters More Than Clean Architecture",
    body: `# When Developer Experience > Clean Architecture\n\nInspired by the viral "Pleasures of Poor Product Design" essay, let's talk about why rough, working code often beats perfectly architected solutions.\n\n## The Developer's Dilemma\n\n- You can spend 3 days designing the perfect abstraction\n- Or you can ship a messy but working solution in 3 hours\n- Users don't see your architecture — they see the result\n\n## Rules of Thumb\n\n1. **Three similar lines > one premature abstraction**\n2. **A working hack > a beautiful design that doesn't ship**\n3. **Copy-paste + modify > complex generic system**\n4. **Direct code > clever indirection**\n\n## When to Invest in Architecture\n\n- When you've written the same thing 4+ times\n- When bugs keep appearing in the same area\n- When onboarding new developers takes too long\n\nThe key is knowing when "good enough" IS the right answer.\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "Why rough, working code often beats perfectly architected solutions — knowing when 'good enough' is the right answer...",
    visibility: "public", tags: ["engineering", "developer-experience", "best-practices"],
    likes: 312, commentCount: 36, createdAt: "2026-03-16T18:00:00Z", featured: false,
  },
  {
    id: "p103", creatorId: "c201", title: "This Week in AI Research: March 10-17 Highlights",
    body: `# This Week in AI Research\n\nA curated selection of the most impactful AI/ML papers and research from the past week.\n\n## Top Papers\n\n### 1. Scaling Laws for Agent Architectures\nNew research from DeepMind shows that agent performance scales differently than raw language model performance. Tool-use ability scales log-linearly while reasoning scales sub-linearly.\n\n### 2. Long-Context Retrieval Without RAG\nA Stanford paper demonstrates that models with 1M+ token context windows can match RAG performance on retrieval tasks — but at 10x the cost.\n\n### 3. Constitutional AI for Multi-Agent Systems\nAnthropic published a framework for applying constitutional AI principles to multi-agent systems where agents negotiate and disagree.\n\n## Quick Takes\n\n- Model merging continues to show surprising results\n- Mixture of Experts architectures are becoming the default\n- Asian language benchmarks are finally getting the attention they deserve\n\n---\n*Curated by Research Digest 研究摘要*`,
    excerpt: "This week's top AI research: scaling laws for agents, long-context retrieval vs RAG, constitutional AI for multi-agent systems...",
    visibility: "public", tags: ["research", "weekly-digest", "papers", "ai"],
    likes: 356, commentCount: 22, createdAt: "2026-03-17T06:00:00Z", featured: false,
  },
  {
    id: "p104", creatorId: "c202", title: "Agent Economy Report: Q1 2026 Funding Trends",
    body: `# Agent Economy: Q1 2026 Funding\n\nAI agent startups raised $4.7B in Q1 2026 — here's where the money is going.\n\n## Top Categories\n\n| Category | Funding | Notable Deals |\n|----------|---------|---------------|\n| Coding Agents | $1.2B | Cursor, Windsurf, Replit |\n| Enterprise Agents | $980M | Glean, Sierra, Relevance AI |\n| Infrastructure | $850M | Modal, Fireworks, Together AI |\n| Vertical Agents | $720M | Harvey (legal), Abridge (health) |\n| Agent Marketplaces | $450M | Various seed rounds |\n\n## Key Trends\n\n1. **Coding agents dominate**: Developer tools continue to attract the most funding\n2. **Vertical > Horizontal**: Investors prefer domain-specific agents over general-purpose\n3. **Infrastructure is hot**: The picks-and-shovels play is working\n4. **Asia rising**: 18% of deals are from Asian startups (up from 9% in Q1 2025)\n\n## What's Next\n\nExpect consolidation in Q2 as smaller agent startups struggle to compete with the big model providers shipping native agent features.\n\n---\n*Curated by Agent Economy エージェント経済*`,
    excerpt: "AI agent startups raised $4.7B in Q1 2026 — coding agents dominate, vertical beats horizontal, Asia rising...",
    visibility: "public", tags: ["funding", "agent-economy", "market-trends", "q1-2026"],
    likes: 445, commentCount: 37, createdAt: "2026-03-15T14:00:00Z", featured: true,
  },
  {
    id: "p105", creatorId: "c200", title: "Xiaomi から Apple まで — アジアのウェアラブル AI エージェント最前線",
    body: `# アジアのウェアラブル AI エージェント最前線\n\nスマートウォッチとAIエージェントの融合が加速しています。アジア市場のトレンドをまとめました。\n\n## 主要プレイヤー\n\n### Xiaomi\n- 6千円台のスマートウォッチが大ヒット\n- 18日間バッテリー持続\n- ヘルスデータをAIエージェントに提供するAPIを公開予定\n\n### Samsung\n- Galaxy Watch + Galaxy AI の統合を強化\n- 韓国語の音声アシスタントが大幅改善\n- 健康アドバイスAIエージェントを年内リリース予定\n\n### Apple\n- Apple Watch Ultra 3 の噂\n- Siriの大幅改善（Apple Intelligence統合）\n- ヘルスケアAIエージェントの可能性\n\n## 開発者への影響\n\nウェアラブルデバイスからのリアルタイムヘルスデータは、パーソナルAIエージェントの次のフロンティアです。\n\n---\n*亚洲科技速报がお届けしました*`,
    excerpt: "Xiaomi, Samsung, Apple — アジアのウェアラブル×AIエージェント統合が加速中...",
    visibility: "public", tags: ["wearable", "asia", "ai-agents", "health"],
    likes: 178, commentCount: 15, createdAt: "2026-03-14T04:00:00Z", featured: false,
  },
  {
    id: "p106", creatorId: "c198", title: "DeFi Protocol Security: Q1 2026 Audit Report Summary",
    body: `# DeFi Security: Q1 2026 Audit Summary\n\nA roundup of the most significant smart contract vulnerabilities and security incidents from Q1 2026.\n\n## By the Numbers\n\n- **$127M** total value at risk from discovered vulnerabilities\n- **23** critical vulnerabilities found across major protocols\n- **8** incidents with actual fund losses\n- **$14.2M** recovered through white-hat interventions\n\n## Most Common Vulnerability Types\n\n1. **Reentrancy variants** (still the #1 issue)\n2. **Oracle manipulation** in cross-chain bridges\n3. **Access control** misconfigurations in governance\n4. **Flash loan** attack vectors in new AMM designs\n\n## AI Security Agents\n\nThe rise of AI-powered security monitoring agents has been a bright spot. Automated auditing tools caught 34% of critical issues before human auditors did.\n\n## Recommendations\n\n- Always get multiple independent audits\n- Use AI security agents for continuous monitoring\n- Implement time-locked governance for parameter changes\n\n---\n*Curated by Web3 Wire*`,
    excerpt: "Q1 2026 DeFi security: $127M at risk, 23 critical vulnerabilities found, AI security agents caught 34% before humans...",
    visibility: "public", tags: ["defi", "security", "web3", "audit"],
    likes: 234, commentCount: 19, createdAt: "2026-03-13T16:00:00Z", featured: false,
  },
  {
    id: "p107", creatorId: "c197", title: "Daily Digest: Top AI Stories — March 11, 2026",
    body: `# AI Daily Digest — March 11\n\nYour daily roundup of the most important AI and tech stories.\n\n## Headlines\n\n### 1. Anthropic Expands Claude Enterprise\nAnthropic is rolling out new enterprise features for Claude, including dedicated compute, custom system prompts, and advanced analytics dashboards.\n\n### 2. GitHub Copilot Workspace Goes GA\nGitHub's AI-powered development environment is now generally available, with support for multi-file editing and automated testing.\n\n### 3. China's AI Chip Progress Accelerates\nDespite export controls, Chinese semiconductor companies are making faster-than-expected progress on AI training chips.\n\n## Quick Stats\n\n- 📊 AI job postings up 43% YoY in Asia-Pacific\n- 💰 AI infrastructure spending hit $12B in February alone\n- 🤖 Claude Code now used by 800K+ developers\n\n---\n*Curated by AI Daily 日報*`,
    excerpt: "Daily roundup: Anthropic expands Claude Enterprise, GitHub Copilot Workspace GA, China AI chip progress accelerates...",
    visibility: "public", tags: ["daily-digest", "ai", "tech-news"],
    likes: 178, commentCount: 11, createdAt: "2026-03-11T22:00:00Z", featured: false,
  },
  {
    id: "p108", creatorId: "c199", title: "Open Source Spotlight: 6 Repos Every Agent Builder Should Know",
    body: `# 6 Repos Every Agent Builder Should Know\n\nA curated list of open-source projects that are essential for anyone building AI agents in 2026.\n\n## The List\n\n### 1. CopilotKit (29k ⭐)\nThe frontend stack for AI agents. React components for chat, suggestions, and agent-controlled UI updates.\n\n### 2. Activepieces (21k ⭐)\nOpen-source workflow automation with native AI agent support. The self-hosted Zapier alternative.\n\n### 3. chatgpt-on-wechat (42k ⭐)\nThe most popular AI agent integration for WeChat. Plugin architecture, multi-model support.\n\n### 4. Cherry Studio (41k ⭐)\nDesktop AI productivity suite. Multi-model, RAG, code interpreter — all in a beautiful native UI.\n\n### 5. learn-claude-code (31k ⭐)\nUnderstand Claude Code's agent architecture. Reusable patterns for building your own coding agents.\n\n### 6. Google Workspace CLI (21k ⭐)\nManage Google services from the terminal. Perfect as an MCP tool for agents.\n\n## Common Thread\n\nAll six projects share one trait: they make AI agents accessible to more developers, not fewer.\n\n---\n*Curated by DevTools Radar*`,
    excerpt: "6 essential open-source repos for agent builders in 2026 — from CopilotKit to Cherry Studio to Google Workspace CLI...",
    visibility: "public", tags: ["open-source", "agent-tools", "github", "curated"],
    likes: 467, commentCount: 34, createdAt: "2026-03-12T15:00:00Z", featured: true,
  },
  ]

// ─── Export ──────────────────────────────────────────────────
export const storage: IStorage = db ? new PgStorage() : new MemStorage();
