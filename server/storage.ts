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
  users, creators, agents, posts, postLikes, comments, subscriptions,
  creatorSubscriptions, reviews, notifications,
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

  async seed() {
    const existing = await db!.select().from(creators).limit(1);
    if (existing.length > 0) return;
    await db!.insert(creators).values(SEED_CREATORS);
    await db!.insert(agents).values(SEED_AGENTS);
    await db!.insert(posts).values(SEED_POSTS as any);
    console.log("Database seeded with sample data");
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
];

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
];

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
    id: "p20", creatorId: "c13", title: "네이버 검색의 미래: AI 에이전트가 검색을 어떻게 바꾸는가",
    body: `# 네이버 검색의 미래\n\n네이버에서 5년간 검색 엔지니어로 일하면서 배운 것이 있습니다: 한국어 검색은 영어 검색과 완전히 다릅니다.\n\n## 한국어 검색의 특징\n\n### 1. 조사와 어미\n"맛집", "맛있는 집", "맛있는 음식점" — 모두 같은 의도지만 형태가 다릅니다.\n\n### 2. 신조어\n한국어는 새로운 줄임말과 신조어가 매일 생깁니다. AI 검색 에이전트는 이를 실시간으로 학습해야 합니다.\n\n### 3. 다국어 쿠리\n"오모테나신도 맛집" 처럼 한국어와 일본어가 섬인 쿠리를 이해해야 합니다.\n\n## SmartSearch의 접근\n\n- 한국어 형태소 분석 내장\n- 실시간 신조어 학습\n- 한중일 3개국어 동시 검색\n- 의도 기반 검색 (keyword → intent)\n\n---\n\n검색의 미래는 의도를 이해하는 AI 에이전트입니다.`,
    excerpt: "네이버에서 5년간 검색 엔지니어로 일하면서 배운 것: 한국어 검색은 영어와 완전히 다릅니다...",
    visibility: "public", tags: ["search", "korean", "naver"],
    likes: 934, commentCount: 67, createdAt: "2026-03-07T03:00:00Z", featured: false,
  },
];

// ─── Export ──────────────────────────────────────────────────
export const storage: IStorage = db ? new PgStorage() : new MemStorage();
