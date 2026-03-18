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
  users, creators, agents, posts, postLikes, comments, subscriptions,
  creatorSubscriptions, reviews, notifications, apiKeys, apiUsageLogs,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, ilike, or, desc, and, sql } from "drizzle-orm";

// ─── Interface ───────────────────────────────────────────────
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  async createUser(insertUser: InsertUser) {
    const id = randomUUID();
    const user: User = { ...insertUser, id, avatar: null, role: "user", stripeCustomerId: null };
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
    const agent: Agent = { ...insertAgent, id, stars: 0, downloads: 0, status: "active", featured: false, longDescription: insertAgent.longDescription ?? null, price: insertAgent.price ?? null, currency: insertAgent.currency ?? "USD", apiEndpoint: insertAgent.apiEndpoint ?? null };
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
    excerpt: "三年前我離開了 Google，開始全職開發 AI Agent。很多人問我為什麼...",
    visibility: "public", tags: ["story", "devops", "startup"],
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
    excerpt: "大部分中文 AI 模型都是針對普通話訓練的。但對於七百萬香港人來說，粵語才是日常語言...",
    visibility: "public", tags: ["cantonese", "hong-kong", "nlp"],
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
    visibility: "public", tags: ["proptech", "hong-kong", "real-estate"],
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
    visibility: "public", tags: ["edtech", "education", "taiwan"],
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
    visibility: "public", tags: ["recommendation", "e-commerce", "japan"],
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
    visibility: "public", tags: ["trading", "competition", "quant"],
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
    visibility: "public", tags: ["multi-agent", "chatdev", "tsinghua", "open-source"],
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
  ]

// ─── Export ──────────────────────────────────────────────────
export const storage: IStorage = db ? new PgStorage() : new MemStorage();
