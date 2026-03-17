import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import crypto from "crypto";
import Stripe from "stripe";
import { storage } from "./storage";
import { registerSchema, loginSchema, insertAgentSchema, type SafeUser } from "@shared/schema";
import bcrypt from "bcryptjs";

// Stripe setup — set STRIPE_SECRET_KEY in environment
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: "2026-02-25.clover" }) : null;
const PLATFORM_FEE_PERCENT = 10; // 10% platform fee

function requireStripe(_req: any, res: any, next: any) {
  if (!stripe) return res.status(503).json({ message: "Stripe not configured. Set STRIPE_SECRET_KEY env var." });
  next();
}

// Extend express-session
declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

function toSafeUser(user: { id: string; username: string; email: string; displayName: string; avatar: string | null; role: string; password: string }): SafeUser {
  const { password, ...safe } = user;
  return safe;
}

// Middleware to require auth
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

// In-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const rateLimitDayStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(apiKeyId: string, hourlyLimit: number, dailyLimit: number): { allowed: boolean; retryAfterSec?: number; remaining: number; limit: number } {
  const now = Date.now();

  const hourKey = `h:${apiKeyId}`;
  let hourEntry = rateLimitStore.get(hourKey);
  if (!hourEntry || now >= hourEntry.resetAt) {
    hourEntry = { count: 0, resetAt: now + 3600_000 };
    rateLimitStore.set(hourKey, hourEntry);
  }

  const dayKey = `d:${apiKeyId}`;
  let dayEntry = rateLimitDayStore.get(dayKey);
  if (!dayEntry || now >= dayEntry.resetAt) {
    dayEntry = { count: 0, resetAt: now + 86400_000 };
    rateLimitDayStore.set(dayKey, dayEntry);
  }

  if (hourEntry.count >= hourlyLimit) {
    return { allowed: false, retryAfterSec: Math.ceil((hourEntry.resetAt - now) / 1000), remaining: 0, limit: hourlyLimit };
  }
  if (dayEntry.count >= dailyLimit) {
    return { allowed: false, retryAfterSec: Math.ceil((dayEntry.resetAt - now) / 1000), remaining: 0, limit: dailyLimit };
  }

  hourEntry.count++;
  dayEntry.count++;
  return { allowed: true, remaining: hourlyLimit - hourEntry.count, limit: hourlyLimit };
}

// API key or session auth middleware
// Note: Global middleware above already validated the key, set rate limits,
// and attached apiKeyUserId. This just checks if either auth method succeeded.
function requireApiKeyOrSession(req: Request, res: Response, next: NextFunction) {
  if (req.session.userId || (req as any).apiKeyUserId) {
    return next();
  }
  return res.status(401).json({ message: "Not authenticated" });
}

function getAuthUserId(req: Request): string | undefined {
  return req.session.userId || (req as any).apiKeyUserId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Trust proxy (behind Zeabur / Perplexity reverse proxy)
  app.set("trust proxy", 1);

  // Session middleware — use Postgres session store if DATABASE_URL is set, otherwise MemoryStore
  const sessionConfig: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "agentforge-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    },
  };

  if (process.env.DATABASE_URL) {
    try {
      const PgSession = connectPgSimple(session);
      const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      // Test the connection immediately
      await pool.query('SELECT 1');
      sessionConfig.store = new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      });
      console.log("[session] Using Postgres-backed session store");
      console.log("[session] DATABASE_URL is set and connected successfully");
    } catch (err: any) {
      console.error("[session] Failed to connect to Postgres for sessions:", err.message);
      console.error("[session] Falling back to MemoryStore. Check DATABASE_URL.");
    }
  } else {
    console.warn("[session] DATABASE_URL not set — using MemoryStore (sessions will not persist)");
  }

  app.use(session(sessionConfig));

  // ─── Global API Key Tracking Middleware ───────────────────────
  // For ANY /api/* request with a Bearer API key, identify the key,
  // apply rate limiting, set headers, and log usage — even on public endpoints.
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer af_k_")) return next();

    const token = authHeader.slice(7);
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const apiKey = await storage.getApiKeyByHash(hash);
    if (!apiKey || apiKey.revoked) return next(); // let route-level middleware handle 401 if needed

    // Rate limit check
    const rl = checkRateLimit(apiKey.id, apiKey.rateLimit, apiKey.rateLimitDay);
    if (!rl.allowed) {
      res.set("Retry-After", String(rl.retryAfterSec));
      return res.status(429).json({ message: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec });
    }
    res.set("X-RateLimit-Limit", String(rl.limit));
    res.set("X-RateLimit-Remaining", String(rl.remaining));

    // Tag request with key info for route-level middleware
    (req as any).apiKeyId = apiKey.id;
    (req as any).apiKeyUserId = apiKey.userId;

    // Usage logging on response finish
    const start = Date.now();
    res.on("finish", () => {
      storage.logApiUsage({
        apiKeyId: apiKey.id,
        userId: apiKey.userId,
        endpoint: `${req.method} ${req.baseUrl}${req.route?.path || req.path}`,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - start,
      }).catch(() => {});
    });

    storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});
    next();
  });

  // ─── Health Check ───────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      database: process.env.DATABASE_URL ? "connected" : "in-memory",
      stripe: STRIPE_KEY ? "configured" : "not configured",
      sessionStore: sessionConfig.store ? "postgres" : "memory",
    });
  });

  // ─── Auth Routes ─────────────────────────────────────────────

  // Register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);

      // Check if email or username already taken
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(409).json({ message: "Email already registered" });
      }
      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(409).json({ message: "Username already taken" });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(data.password, 12);
      const user = await storage.createUser({
        username: data.username,
        email: data.email,
        password: hashedPassword,
        displayName: data.displayName,
      });

      // Set session — explicit save for Postgres-backed store
      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error (register):", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.status(201).json(toSafeUser(user));
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error (login):", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.json(toSafeUser(user));
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "User not found" });
    }
    res.json(toSafeUser(user));
  });

  // ─── Agents ──────────────────────────────────────────────────

  app.get("/api/agents", async (_req, res) => {
    const { category, search, featured, creator } = _req.query;
    if (featured === "true") {
      const agents = await storage.getFeaturedAgents();
      return res.json(agents);
    }
    if (search && typeof search === "string") {
      const agents = await storage.searchAgents(search);
      return res.json(agents);
    }
    if (creator && typeof creator === "string") {
      const agents = await storage.getAgentsByCreator(creator);
      return res.json(agents);
    }
    if (category && typeof category === "string") {
      const agents = await storage.getAgentsByCategory(category);
      return res.json(agents);
    }
    const agents = await storage.getAgents();
    res.json(agents);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  // ─── Creator Agent CRUD ─────────────────────────────────────

  // Create agent for current creator
  app.post("/api/creators/me/agents", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) return res.status(403).json({ message: "You need a creator profile first" });

      const agentData = insertAgentSchema.parse({
        ...req.body,
        creatorId: creator.id,
      });
      const agent = await storage.createAgent(agentData);
      await storage.updateCreator(creator.id, { agentCount: creator.agentCount + 1 });
      res.status(201).json(agent);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors[0]?.message || "Invalid input" });
      }
      console.error("Create agent error:", error);
      res.status(500).json({ message: "Failed to create agent" });
    }
  });

  // Update agent for current creator
  app.put("/api/creators/me/agents/:id", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) return res.status(403).json({ message: "You need a creator profile first" });

      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.creatorId !== creator.id) return res.status(403).json({ message: "Not your agent" });

      const allowedFields = ["name", "description", "longDescription", "category", "pricing", "price", "tags", "apiEndpoint", "status"] as const;
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const updated = await storage.updateAgent(req.params.id, updateData);
      if (!updated) return res.status(404).json({ message: "Agent not found" });
      res.json(updated);
    } catch (error) {
      console.error("Update agent error:", error);
      res.status(500).json({ message: "Failed to update agent" });
    }
  });

  // Delete agent for current creator
  app.delete("/api/creators/me/agents/:id", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) return res.status(403).json({ message: "You need a creator profile first" });

      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.creatorId !== creator.id) return res.status(403).json({ message: "Not your agent" });

      await storage.deleteAgent(req.params.id);
      await storage.updateCreator(creator.id, { agentCount: Math.max(0, creator.agentCount - 1) });
      res.json({ success: true });
    } catch (error) {
      console.error("Delete agent error:", error);
      res.status(500).json({ message: "Failed to delete agent" });
    }
  });

  // Dashboard stats for current creator
  app.get("/api/creators/me/dashboard-stats", requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) return res.status(403).json({ message: "You need a creator profile first" });

      const creatorAgents = await storage.getAgentsByCreator(creator.id);
      const totalDownloads = creatorAgents.reduce((sum, a) => sum + a.downloads, 0);
      const totalStars = creatorAgents.reduce((sum, a) => sum + a.stars, 0);

      res.json({
        subscribers: creator.subscribers,
        agentCount: creatorAgents.length,
        totalDownloads,
        totalStars,
      });
    } catch (error) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  // ─── Creators ────────────────────────────────────────────────

  // Current user's creator profile
  app.get("/api/creators/me", requireAuth, async (req, res) => {
    const creator = await storage.getCreatorByUserId(req.session.userId!);
    if (!creator) return res.status(404).json({ message: "No creator profile" });
    res.json(creator);
  });

  // Create creator profile for current user
  app.post("/api/creators/me", requireAuth, async (req, res) => {
    try {
      const existing = await storage.getCreatorByUserId(req.session.userId!);
      if (existing) return res.status(409).json({ message: "Already have a creator profile" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      // Check handle uniqueness
      const existingHandle = await storage.getCreatorByHandle(req.body.handle);
      if (existingHandle) return res.status(409).json({ message: "Handle already taken" });

      const creator = await storage.createCreator({
        userId: req.session.userId!,
        name: user.displayName,
        handle: req.body.handle,
        avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${req.body.handle}`,
        bio: req.body.bio,
        tags: req.body.tags || [],
        subscribers: 0,
        agentCount: 0,
        verified: false,
      });
      res.status(201).json(creator);
    } catch (error) {
      console.error("Create creator error:", error);
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.get("/api/creators", async (_req, res) => {
    const { featured } = _req.query;
    if (featured === "true") {
      const creators = await storage.getFeaturedCreators();
      return res.json(creators);
    }
    const creators = await storage.getCreators();
    res.json(creators);
  });

  app.get("/api/creators/:id", async (req, res) => {
    const creator = await storage.getCreator(req.params.id);
    if (!creator) return res.status(404).json({ message: "Creator not found" });
    const [agentsList, creatorPosts] = await Promise.all([
      storage.getAgentsByCreator(creator.id),
      storage.getPostsByCreator(creator.id),
    ]);
    let isSubscribed = false;
    if (req.session.userId) {
      isSubscribed = await storage.isSubscribedToCreator(req.session.userId, creator.id);
    }
    res.json({ ...creator, agents: agentsList, posts: creatorPosts, isSubscribed });
  });

  // ─── Creator Subscriptions (follow/unfollow) ─────────────────

  app.post("/api/creators/:id/subscribe", requireAuth, async (req, res) => {
    const subscribed = await storage.subscribeToCreator(req.session.userId!, req.params.id);
    const creator = await storage.getCreator(req.params.id);
    // Generate notification for creator on new subscriber
    if (subscribed && creator?.userId && creator.userId !== req.session.userId) {
      const user = await storage.getUser(req.session.userId!);
      storage.createNotification({
        userId: creator.userId,
        type: "subscribe",
        actorName: user?.displayName || "Someone",
        message: `subscribed to your profile`,
        link: `/creators/${creator.id}`,
      }).catch(() => {});
    }
    res.json({ subscribed, subscribers: creator?.subscribers ?? 0 });
  });

  app.get("/api/creators/:id/is-subscribed", requireAuth, async (req, res) => {
    const subscribed = await storage.isSubscribedToCreator(req.session.userId!, req.params.id);
    res.json({ subscribed });
  });

  // ─── Agent Subscriptions ─────────────────────────────────────

  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    const sub = await storage.createSubscription(req.body);
    res.status(201).json(sub);
  });

  // ─── Reviews ─────────────────────────────────────────────────

  app.get("/api/agents/:id/reviews", async (req, res) => {
    const [reviews, rating] = await Promise.all([
      storage.getReviewsByAgent(req.params.id),
      storage.getAgentAverageRating(req.params.id),
    ]);
    res.json({ reviews, ...rating });
  });

  app.post("/api/agents/:id/reviews", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const review = await storage.createReview({
      agentId: req.params.id,
      userId: req.session.userId!,
      authorName: user.displayName,
      rating: req.body.rating,
      body: req.body.body,
    });
    // Notify the agent's creator about the review
    const agent = await storage.getAgent(req.params.id);
    if (agent) {
      const creator = await storage.getCreator(agent.creatorId);
      if (creator?.userId && creator.userId !== req.session.userId) {
        storage.createNotification({
          userId: creator.userId,
          type: "comment",
          actorName: user.displayName,
          message: `reviewed your agent "${agent.name}" (${req.body.rating}★)`,
          link: `/agents/${agent.id}`,
        }).catch(() => {});
      }
    }
    res.status(201).json(review);
  });

  // ─── Global Search ──────────────────────────────────────────

  app.get("/api/search", async (req, res) => {
    const { q } = req.query;
    if (!q || typeof q !== "string") return res.json({ agents: [], creators: [], posts: [] });
    const results = await storage.searchAll(q);
    res.json(results);
  });

  // ─── User Profile / Activity ─────────────────────────────────

  app.get("/api/me/subscriptions", requireAuth, async (req, res) => {
    const creatorIds = await storage.getUserSubscribedCreatorIds(req.session.userId!);
    const allCreators = await storage.getCreators();
    const subscribed = allCreators.filter(c => creatorIds.includes(c.id));
    res.json(subscribed);
  });

  app.get("/api/me/liked-posts", requireAuth, async (req, res) => {
    const posts = await storage.getUserLikedPosts(req.session.userId!);
    res.json(posts);
  });

  app.get("/api/me/comments", requireAuth, async (req, res) => {
    const comments = await storage.getUserComments(req.session.userId!);
    res.json(comments);
  });

  // ─── Posts / Feed ────────────────────────────────────────────

  app.get("/api/posts", async (req, res) => {
    const { creator, limit } = req.query;
    if (creator && typeof creator === "string") {
      const posts = await storage.getPostsByCreator(creator);
      return res.json(posts);
    }
    const posts = await storage.getPosts(limit ? parseInt(limit as string, 10) : 50);
    res.json(posts);
  });

  app.get("/api/posts/:id", async (req, res) => {
    const post = await storage.getPost(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Include whether current user has liked
    let hasLiked = false;
    if (req.session.userId) {
      hasLiked = await storage.hasLiked(post.id, req.session.userId);
    }
    // Include creator info
    const creator = await storage.getCreator(post.creatorId);
    res.json({ ...post, hasLiked, creator });
  });

  app.post("/api/posts", requireAuth, async (req, res) => {
    try {
      // Get the creator profile for the current user
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) {
        return res.status(403).json({ message: "You need a creator profile to publish posts" });
      }
      const post = await storage.createPost({
        ...req.body,
        creatorId: creator.id,
      });
      res.status(201).json(post);
    } catch (error) {
      res.status(400).json({ message: "Invalid post data" });
    }
  });

  app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    const liked = await storage.likePost(req.params.id, req.session.userId!);
    const post = await storage.getPost(req.params.id);
    // Generate notification for the post creator on like
    if (liked && post) {
      const user = await storage.getUser(req.session.userId!);
      const creator = await storage.getCreator(post.creatorId);
      if (creator?.userId && creator.userId !== req.session.userId) {
        storage.createNotification({
          userId: creator.userId,
          type: "like",
          actorName: user?.displayName || "Someone",
          message: `liked your post "${post.title}"`,
          link: `/posts/${post.id}`,
        }).catch(() => {}); // fire and forget
      }
    }
    res.json({ liked, likes: post?.likes ?? 0 });
  });

  app.get("/api/posts/:id/comments", async (req, res) => {
    const comments = await storage.getComments(req.params.id);
    res.json(comments);
  });

  app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const comment = await storage.createComment({
      postId: req.params.id,
      userId: req.session.userId!,
      authorName: user.displayName,
      body: req.body.body,
    });
    // Generate notification for the post creator on comment
    const post = await storage.getPost(req.params.id);
    if (post) {
      const creator = await storage.getCreator(post.creatorId);
      if (creator?.userId && creator.userId !== req.session.userId) {
        storage.createNotification({
          userId: creator.userId,
          type: "comment",
          actorName: user.displayName,
          message: `commented on your post "${post.title}"`,
          link: `/posts/${post.id}`,
        }).catch(() => {});
      }
    }
    res.status(201).json(comment);
  });

  // ─── Notifications ─────────────────────────────────────────

  app.get("/api/notifications", requireAuth, async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const notifications = await storage.getNotifications(req.session.userId!, limit);
    res.json(notifications);
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    const count = await storage.getUnreadCount(req.session.userId!);
    res.json({ count });
  });

  app.post("/api/notifications/mark-read", requireAuth, async (req, res) => {
    const { ids } = req.body; // optional array of notification ids
    await storage.markNotificationsRead(req.session.userId!, ids);
    res.json({ success: true });
  });

  // ─── Stats ──────────────────────────────────────────────────

  app.get("/api/stats", async (_req, res) => {
    const agents = await storage.getAgents();
    const creators = await storage.getCreators();
    res.json({
      totalAgents: agents.length,
      totalCreators: creators.length,
      totalDownloads: agents.reduce((sum, a) => sum + a.downloads, 0),
      totalSubscribers: creators.reduce((sum, c) => sum + c.subscribers, 0),
    });
  });

  // ─── Stripe Connect: Creator Onboarding ─────────────────────

  // Create Stripe Express account for a creator and return onboarding link
  app.post("/api/stripe/connect/onboard", requireStripe, requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator) {
        return res.status(403).json({ message: "You need a creator profile first" });
      }

      let accountId = creator.stripeAccountId;

      // Create Express account if not already created
      if (!accountId) {
        const account = await stripe!.accounts.create({
          type: "express",
          email: (await storage.getUser(req.session.userId!))?.email,
          metadata: { creatorId: creator.id, userId: req.session.userId! },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        accountId = account.id;
        await storage.updateCreator(creator.id, { stripeAccountId: accountId });
      }

      // Generate onboarding link
      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "http://localhost:5000";
      const accountLink = await stripe!.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/#/profile?stripe=refresh`,
        return_url: `${origin}/#/profile?stripe=success`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url, accountId });
    } catch (error: any) {
      console.error("Stripe Connect onboard error:", error);
      res.status(500).json({ message: error.message || "Stripe onboarding failed" });
    }
  });

  // Check Stripe Connect account status
  app.get("/api/stripe/connect/status", requireStripe, requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator || !creator.stripeAccountId) {
        return res.json({ connected: false, onboarded: false });
      }

      const account = await stripe!.accounts.retrieve(creator.stripeAccountId);
      const onboarded = account.charges_enabled && account.payouts_enabled;

      // Update onboarded status in DB
      if (onboarded && !creator.stripeOnboarded) {
        await storage.updateCreator(creator.id, { stripeOnboarded: true });
      }

      res.json({
        connected: true,
        onboarded,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        accountId: creator.stripeAccountId,
      });
    } catch (error: any) {
      console.error("Stripe Connect status error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Creator earnings dashboard
  app.get("/api/stripe/connect/earnings", requireStripe, requireAuth, async (req, res) => {
    try {
      const creator = await storage.getCreatorByUserId(req.session.userId!);
      if (!creator || !creator.stripeAccountId) {
        return res.json({ balance: { available: 0, pending: 0 }, recentPayouts: [], currency: "usd" });
      }

      const balance = await stripe!.balance.retrieve({
        stripeAccount: creator.stripeAccountId,
      });

      const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
      const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);
      const currency = balance.available[0]?.currency || "usd";

      // Get recent payouts
      let recentPayouts: any[] = [];
      try {
        const payouts = await stripe!.payouts.list(
          { limit: 5 },
          { stripeAccount: creator.stripeAccountId }
        );
        recentPayouts = payouts.data.map(p => ({
          id: p.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          arrival: p.arrival_date,
        }));
      } catch {
        // No payouts yet, that's fine
      }

      res.json({ balance: { available, pending }, recentPayouts, currency });
    } catch (error: any) {
      console.error("Stripe earnings error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Stripe Checkout: Subscribe to paid agent ───────────────

  app.post("/api/stripe/checkout", requireStripe, requireAuth, async (req, res) => {
    try {
      const { agentId } = req.body;
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.pricing === "free" || !agent.price) {
        return res.status(400).json({ message: "This agent is free — no payment required" });
      }

      const creator = await storage.getCreator(agent.creatorId);
      if (!creator?.stripeAccountId || !creator.stripeOnboarded) {
        return res.status(400).json({ message: "Creator hasn't connected payments yet" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Not authenticated" });

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe!.customers.create({
          email: user.email,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUser(user.id, { stripeCustomerId: customerId });
      }

      // Create a subscription record first (pending)
      const sub = await storage.createSubscription({
        subscriberId: user.id,
        subscriberType: "human",
        agentId: agent.id,
        plan: "pro",
        status: "pending",
      });

      const origin = req.headers.origin || req.headers.referer?.replace(/\/$/, "") || "http://localhost:5000";

      // Calculate application fee (10%)
      const applicationFeeAmount = Math.round(agent.price * PLATFORM_FEE_PERCENT / 100);

      // Create Checkout on the PLATFORM account with application_fee_percent
      // and transfer_data to send the creator's share to their connected account.
      // This avoids the "customer not found on connected account" error.
      const session = await stripe!.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{
          price_data: {
            currency: agent.currency || "usd",
            product_data: {
              name: agent.name,
              description: `Subscribe to ${agent.name} by ${creator.name}`,
            },
            unit_amount: agent.price,
            recurring: { interval: "month" },
          },
          quantity: 1,
        }],
        subscription_data: {
          application_fee_percent: PLATFORM_FEE_PERCENT,
          transfer_data: {
            destination: creator.stripeAccountId!,
          },
          metadata: { subscriptionId: sub.id, agentId: agent.id, creatorId: creator.id },
        },
        metadata: { subscriptionId: sub.id, agentId: agent.id },
        success_url: `${origin}/#/agents/${agent.id}?checkout=success`,
        cancel_url: `${origin}/#/agents/${agent.id}?checkout=cancel`,
      });

      // Store checkout session ID
      await storage.updateSubscription(sub.id, { stripeCheckoutSessionId: session.id });

      res.json({ url: session.url, sessionId: session.id });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({ message: error.message || "Checkout failed" });
    }
  });

  // ─── Stripe Webhooks ────────────────────────────────────────

  // Stripe webhook — uses rawBody saved by the global express.json() verify callback
  app.post("/api/stripe/webhook", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      if (webhookSecret && sig && (req as any).rawBody) {
        event = stripe!.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret);
      } else {
        // In test mode without webhook secret, just use the parsed body
        event = req.body as Stripe.Event;
      }
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).json({ message: `Webhook Error: ${err.message}` });
    }

    console.log(`[stripe] Webhook received: ${event.type}`);

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const subscriptionId = session.metadata?.subscriptionId;
          if (subscriptionId) {
            await storage.updateSubscription(subscriptionId, {
              status: "active",
              stripeCheckoutSessionId: session.id,
              stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null,
            });
            console.log(`[stripe] Subscription ${subscriptionId} activated`);
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const dbSub = await storage.getSubscriptionByStripeSubId(sub.id);
          if (dbSub) {
            await storage.updateSubscription(dbSub.id, {
              status: sub.status === "active" ? "active" : "cancelled",
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const dbSub = await storage.getSubscriptionByStripeSubId(sub.id);
          if (dbSub) {
            await storage.updateSubscription(dbSub.id, { status: "cancelled" });
          }
          break;
        }

        default:
          console.log(`[stripe] Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error("Webhook handler error:", error);
    }

    res.json({ received: true });
  });

  // ─── Stripe: Check if user has active subscription for agent ─

  app.get("/api/agents/:id/subscription-status", requireApiKeyOrSession, async (req, res) => {
    const userId = getAuthUserId(req)!;
    const subs = await storage.getSubscriptions(userId);
    const activeSub = subs.find(s => s.agentId === req.params.id && s.status === "active");
    res.json({ subscribed: !!activeSub, subscription: activeSub || null });
  });

  // ─── API Key Management ──────────────────────────────────────

  app.get("/api/keys", requireAuth, async (req, res) => {
    const keys = await storage.getApiKeysByUser(req.session.userId!);
    const safeKeys = keys.map(({ keyHash, ...rest }) => rest);
    res.json(safeKeys);
  });

  // IMPORTANT: Register /api/keys/usage/stats BEFORE any /api/keys/:id/* routes
  app.get("/api/keys/usage/stats", requireAuth, async (req, res) => {
    const stats = await storage.getUsageStatsByUser(req.session.userId!);
    res.json(stats);
  });

  app.post("/api/keys", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Key name is required" });
      }

      const randomHex = crypto.randomBytes(16).toString("hex");
      const fullKey = `af_k_${randomHex}`;
      const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
      const keyPrefix = fullKey.slice(0, 12);

      const apiKey = await storage.createApiKey({
        userId: req.session.userId!,
        name: name.trim(),
        keyHash,
        keyPrefix,
      });

      const { keyHash: _, ...safeKey } = apiKey;
      res.status(201).json({ ...safeKey, key: fullKey });
    } catch (error) {
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.get("/api/keys/:id/usage", requireAuth, async (req, res) => {
    const keys = await storage.getApiKeysByUser(req.session.userId!);
    const key = keys.find(k => k.id === req.params.id);
    if (!key) return res.status(404).json({ message: "Key not found" });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await storage.getUsageByKey(key.id, since);
    const count = logs.length;
    res.json({ count, logs: logs.slice(0, 100) });
  });

  app.patch("/api/keys/:id/rate-limit", requireAuth, async (req, res) => {
    const keys = await storage.getApiKeysByUser(req.session.userId!);
    const key = keys.find(k => k.id === req.params.id);
    if (!key) return res.status(404).json({ message: "Key not found" });

    const { rateLimit, rateLimitDay } = req.body;
    const updates: any = {};
    if (typeof rateLimit === "number" && rateLimit >= 10 && rateLimit <= 100000) updates.rateLimit = rateLimit;
    if (typeof rateLimitDay === "number" && rateLimitDay >= 100 && rateLimitDay <= 1000000) updates.rateLimitDay = rateLimitDay;

    if (Object.keys(updates).length === 0) return res.status(400).json({ message: "No valid rate limit values" });

    await storage.updateApiKey(key.id, updates);
    res.json({ success: true });
  });

  app.delete("/api/keys/:id", requireAuth, async (req, res) => {
    const revoked = await storage.revokeApiKey(req.params.id, req.session.userId!);
    if (!revoked) return res.status(404).json({ message: "Key not found" });
    res.json({ success: true });
  });

  return httpServer;
}
