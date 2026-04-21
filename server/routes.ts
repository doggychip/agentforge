import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import crypto from "crypto";
import Stripe from "stripe";
// Clerk
import { clerkMiddleware as _clerkMiddleware, getAuth as _getAuth, clerkClient as _clerkClient } from "@clerk/express";
const clerkMiddleware = _clerkMiddleware;
const getAuth = _getAuth;
const clerkClient = _clerkClient;
import { storage } from "./storage";
import { CONTENT_SOURCES } from "./content-sources";
import { insertAgentSchema, type SafeUser } from "@shared/schema";
import type { Agent } from "@shared/schema";
import { HfInference } from "@huggingface/inference";

// Platform AI — powers agent chat when agent's own backend is unavailable
const PLATFORM_AI_MODEL = process.env.PLATFORM_AI_MODEL || "mistralai/Mistral-7B-Instruct-v0.3";
const FALLBACK_MODELS = [
  "mistralai/Mistral-7B-Instruct-v0.3",
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
];

function getHfClient(): HfInference | null {
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    console.warn("[platform-ai] HF_API_TOKEN is not set — AI chat will use static fallback. Set it in your deployment environment.");
    return null;
  }
  return new HfInference(token);
}

async function platformAIChat(
  agent: Agent,
  chatHistory: Array<{ role: string; content: string }>,
): Promise<string> {
  const hf = getHfClient();
  if (!hf) return "";

  const systemPrompt = `You are "${agent.name}", an AI agent on the AgentForge marketplace.

Description: ${agent.description}
${agent.longDescription ? `Details: ${agent.longDescription}` : ""}
Tags: ${(agent.tags as string[] || []).join(", ")}
Category: ${agent.category}

Stay in character. Be helpful, concise, and knowledgeable about your domain. Use markdown formatting when appropriate.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    ...chatHistory.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  // Try the agent's own model, then platform default, then fallbacks
  const modelsToTry = [
    ...(agent.hfModelId ? [agent.hfModelId] : []),
    PLATFORM_AI_MODEL,
    ...FALLBACK_MODELS,
  ];
  // Deduplicate
  const uniqueModels = [...new Set(modelsToTry)];

  for (const model of uniqueModels) {
    try {
      const res = await hf.chatCompletion({
        model,
        messages,
        max_tokens: 1024,
      });
      const content = res.choices?.[0]?.message?.content;
      if (content) return content;
    } catch (err: any) {
      console.error(`[platform-ai] Model ${model} failed:`, err.message);
      continue;
    }
  }

  return "";
}

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

function toSafeUser(user: { id: string; username: string; email: string; displayName: string; avatar: string | null; role: string; password: string; totpSecret?: string | null; [key: string]: any }): SafeUser {
  const { password, totpSecret, ...safe } = user;
  return safe as SafeUser;
}

// Timeout wrapper for external API calls
function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("API timeout")), ms)),
  ]);
}

// Middleware to require auth — always verifies current Clerk token
// Auto-creates a DB user from Clerk if one doesn't exist yet.
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Always check Clerk token first
  if (getAuth) {
    try {
      const auth = getAuth(req);
      if (auth?.userId) {
        if (req.session.userId !== auth.userId) {
          req.session.userId = auth.userId;
        }
        let user = await storage.getUser(auth.userId);
        if (!user && clerkClient) {
          const clerkUser = await withTimeout(clerkClient.users.getUser(auth.userId));
          user = await storage.createUser({
            username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || `user_${auth.userId.slice(-6)}`,
            email: clerkUser.emailAddresses[0]?.emailAddress || "",
            password: crypto.randomBytes(32).toString("hex"),
            displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "User",
          });
        }
        if (user) return next();
      }
    } catch (err: any) {
      console.error("[requireAuth] Clerk/DB error:", err.message);
    }
  }

  // Fallback: API key auth only (Bearer token already validated by global middleware)
  if ((req as any).apiKeyUserId) {
    const user = await storage.getUser((req as any).apiKeyUserId);
    if (user) {
      req.session.userId = (req as any).apiKeyUserId;
      return next();
    }
  }

  return res.status(401).json({ message: "Not authenticated" });
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

function asSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
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
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
    },
  };

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URI || process.env.POSTGRES_CONNECTION_STRING;

  if (dbUrl) {
    try {
      const PgSession = connectPgSimple(session);
      const pool = new pg.Pool({ connectionString: dbUrl });
      // Test the connection immediately
      await pool.query('SELECT 1');
      sessionConfig.store = new PgSession({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      });
      console.log("[session] Using Postgres-backed session store");
      console.log("[session] Connected to database successfully");
    } catch (err: any) {
      console.error("[session] Failed to connect to Postgres for sessions:", err.message);
      console.error("[session] Falling back to MemoryStore. Check database URL env vars.");
    }
  } else {
    console.warn("[session] No database URL set — using MemoryStore (sessions will not persist)");
  }

  app.use(session(sessionConfig));

  // ─── Clerk Auth Middleware ──────────────────────────────────
  // Attaches Clerk auth state to requests (non-blocking)
  process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "sk_test_4VAbVCj1eXgUvy2ov4CvBmaAryCDmmF8qSdFVomwhU";
  process.env.CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || "pk_test_Zmx5aW5nLXNsb3RoLTMuY2xlcmsuYWNjb3VudHMuZGV2JA";
  if (clerkMiddleware) {
    try {
      // Only apply Clerk to API routes — static files don't need auth
      app.use("/api", clerkMiddleware());
      console.log("[clerk] Middleware initialized (API routes only)");
    } catch (err: any) {
      console.error("[clerk] Failed to initialize:", err.message);
    }
  }

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
      database: dbUrl ? "connected" : "in-memory",
      stripe: STRIPE_KEY ? "configured" : "not configured",
      sessionStore: sessionConfig.store ? "postgres" : "memory",
    });
  });

  // ─── Auth Routes (Clerk only) ────────────────────────────────

  // Get current user — Clerk auth
  app.get("/api/auth/me", async (req, res) => {
    if (getAuth) {
      try {
        const auth = getAuth(req);
        if (auth?.userId) {
          let user = await storage.getUser(auth.userId);
          if (!user && clerkClient) {
            const clerkUser = await withTimeout(clerkClient.users.getUser(auth.userId));
            user = await storage.createUser({
              username: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || `user_${auth.userId.slice(-6)}`,
              email: clerkUser.emailAddresses[0]?.emailAddress || "",
              password: crypto.randomBytes(32).toString("hex"),
              displayName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "User",
            });
          }
          if (user) {
            req.session.userId = auth.userId;
            return res.json(toSafeUser(user));
          }
        }
      } catch (err: any) {
        console.error("[/api/auth/me] Error:", err.message);
      }
    }

    return res.status(401).json({ message: "Not authenticated" });
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

  app.get("/api/agents/new-arrivals", async (_req, res) => {
    try {
      const allAgents = await storage.getAgents();
      // Sort by ID descending — UUID-style IDs are newer than short IDs like "a1"
      const sorted = [...allAgents].sort((a, b) => {
        // UUIDs (longer IDs) are newer than short IDs
        if (a.id.length !== b.id.length) return b.id.length - a.id.length;
        return b.id.localeCompare(a.id);
      });
      const limit = parseInt(asSingleParam(_req.query.limit as string) || "20", 10);
      res.json(sorted.slice(0, limit));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get new arrivals" });
    }
  });

  app.get("/api/agents/trending", async (_req, res) => {
    try {
      const allAgents = await storage.getAgents();
      // Trending score: weighted combo of downloads, stars, and recency
      const scored = allAgents.map((a) => {
        const downloadScore = Math.log10(a.downloads + 1) * 10;
        const starScore = Math.log10(a.stars + 1) * 8;
        const featuredBonus = a.featured ? 15 : 0;
        // Newer agents get a boost (using ID as rough proxy for time)
        const recencyBonus = a.id.startsWith("a") && a.id.length <= 4 ? 0 : 5;
        const score = downloadScore + starScore + featuredBonus + recencyBonus;
        return { ...a, _trendScore: score };
      });
      scored.sort((a, b) => b._trendScore - a._trendScore);
      const limit = parseInt(asSingleParam(_req.query.limit as string) || "20", 10);
      res.json(scored.slice(0, limit));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get trending agents" });
    }
  });

  app.get("/api/agents/recommended", async (_req, res) => {
    try {
      const allAgents = await storage.getAgents();
      // Recommended: diverse mix of categories, prioritize high-quality + free
      const categories = ["agent", "tool", "api", "content"];
      const recommended: typeof allAgents = [];
      for (const cat of categories) {
        const catAgents = allAgents
          .filter((a) => a.category === cat)
          .sort((a, b) => (b.stars + b.downloads) - (a.stars + a.downloads))
          .slice(0, 5);
        recommended.push(...catAgents);
      }
      // Shuffle slightly for variety
      for (let i = recommended.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        if (Math.abs(i - j) < 3) [recommended[i], recommended[j]] = [recommended[j], recommended[i]];
      }
      const limit = parseInt(asSingleParam(_req.query.limit as string) || "12", 10);
      res.json(recommended.slice(0, limit));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to get recommended agents" });
    }
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(agent);
  });

  // POST /api/agents — publish a new agent (requireAuth, must be a creator)
  app.post("/api/agents", requireAuth, async (req, res) => {
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

      const agentId = asSingleParam(req.params.id);
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.creatorId !== creator.id) return res.status(403).json({ message: "Not your agent" });

      const allowedFields = ["name", "description", "longDescription", "category", "pricing", "price", "tags", "apiEndpoint", "hfSpaceUrl", "hfModelId", "backendType", "status"] as const;
      const updateData: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      const updated = await storage.updateAgent(agentId, updateData);
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

      const agentId = asSingleParam(req.params.id);
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.creatorId !== creator.id) return res.status(403).json({ message: "Not your agent" });

      await storage.deleteAgent(agentId);
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

      // Gather per-agent review data
      const agentBreakdown = await Promise.all(
        creatorAgents.map(async (a) => {
          const { avg, count } = await storage.getAgentAverageRating(a.id);
          return {
            id: a.id, name: a.name, category: a.category,
            pricing: a.pricing, price: a.price,
            stars: a.stars, downloads: a.downloads,
            reviewCount: count, avgRating: avg,
          };
        })
      );

      const totalReviews = agentBreakdown.reduce((s, a) => s + a.reviewCount, 0);
      const avgRating = totalReviews > 0
        ? agentBreakdown.reduce((s, a) => s + a.avgRating * a.reviewCount, 0) / totalReviews
        : 0;

      // Category distribution
      const categoryDistribution: Record<string, number> = {};
      for (const a of creatorAgents) {
        categoryDistribution[a.category] = (categoryDistribution[a.category] || 0) + 1;
      }

      // Pricing distribution
      const pricingDistribution: Record<string, number> = {};
      for (const a of creatorAgents) {
        pricingDistribution[a.pricing] = (pricingDistribution[a.pricing] || 0) + 1;
      }

      // Top agent by downloads
      const topAgent = creatorAgents.length > 0
        ? creatorAgents.reduce((best, a) => a.downloads > best.downloads ? a : best)
        : null;

      // Simulated 7-day trend data based on real totals
      const simulateTrend = (total: number): number[] => {
        const dailyAvg = Math.max(1, Math.round(total / 30));
        return Array.from({ length: 7 }, () =>
          Math.max(0, Math.round(dailyAvg * (0.8 + Math.random() * 0.4)))
        );
      };

      res.json({
        subscribers: creator.subscribers,
        agentCount: creatorAgents.length,
        totalDownloads,
        totalStars,
        totalReviews,
        avgRating: Math.round(avgRating * 10) / 10,
        agentBreakdown,
        categoryDistribution,
        pricingDistribution,
        topAgent: topAgent ? { name: topAgent.name, downloads: topAgent.downloads } : null,
        downloadsTrend: simulateTrend(totalDownloads),
        subscribersTrend: simulateTrend(creator.subscribers),
        starsTrend: simulateTrend(totalStars),
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

    // Gate subscriber-only posts
    const userCreator = req.session?.userId
      ? await storage.getCreatorByUserId(req.session.userId)
      : null;
    const gatedPosts = creatorPosts.map((p) => {
      if (p.visibility === "subscribers") {
        const isOwner = userCreator?.id === p.creatorId;
        if (!isOwner && !isSubscribed) {
          return { ...p, body: p.excerpt || "This content is for subscribers only.", isGated: true };
        }
      }
      return { ...p, isGated: false };
    });

    res.json({ ...creator, agents: agentsList, posts: gatedPosts, isSubscribed });
  });

  // ─── Creator Subscriptions (follow/unfollow) ─────────────────

  app.post("/api/creators/:id/subscribe", requireAuth, async (req, res) => {
    const creatorId = asSingleParam(req.params.id);
    const subscribed = await storage.subscribeToCreator(req.session.userId!, creatorId);
    const creator = await storage.getCreator(creatorId);
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
    const creatorId = asSingleParam(req.params.id);
    const subscribed = await storage.isSubscribedToCreator(req.session.userId!, creatorId);
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
      agentId: asSingleParam(req.params.id),
      userId: req.session.userId!,
      authorName: user.displayName,
      rating: req.body.rating,
      body: req.body.body,
    });
    // Notify the agent's creator about the review
    const agent = await storage.getAgent(asSingleParam(req.params.id));
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
    const { creator: creatorFilter, limit } = req.query;
    let posts;
    if (creatorFilter && typeof creatorFilter === "string") {
      posts = await storage.getPostsByCreator(creatorFilter);
    } else {
      posts = await storage.getPosts(limit ? parseInt(limit as string, 10) : 50);
    }

    // Content gating: strip body from subscriber-only posts for non-subscribers
    const subscribedCreatorIds = req.session?.userId
      ? await storage.getUserSubscribedCreatorIds(req.session.userId)
      : [];
    const userCreator = req.session?.userId
      ? await storage.getCreatorByUserId(req.session.userId)
      : null;

    const gatedPosts = posts.map((p) => {
      if (p.visibility === "subscribers") {
        const isCreator = userCreator?.id === p.creatorId;
        const isSubscribed = subscribedCreatorIds.includes(p.creatorId);
        if (!isCreator && !isSubscribed) {
          return { ...p, body: p.excerpt || "This content is for subscribers only.", isGated: true };
        }
      }
      return { ...p, isGated: false };
    });

    res.json(gatedPosts);
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

    // Content gating
    let isGated = false;
    let gatedPost = post;
    if (post.visibility === "subscribers") {
      const userCreator = req.session?.userId
        ? await storage.getCreatorByUserId(req.session.userId)
        : null;
      const isPostCreator = userCreator?.id === post.creatorId;
      const isSubscribed = req.session?.userId
        ? await storage.isSubscribedToCreator(req.session.userId, post.creatorId)
        : false;
      if (!isPostCreator && !isSubscribed) {
        isGated = true;
        gatedPost = { ...post, body: post.excerpt || "This content is for subscribers only." };
      }
    }

    res.json({ ...gatedPost, hasLiked, creator, isGated });
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
    const postId = asSingleParam(req.params.id);
    const liked = await storage.likePost(postId, req.session.userId!);
    const post = await storage.getPost(postId);
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

    // Block comments on subscriber-only posts for non-subscribers
    const postId = asSingleParam(req.params.id);
    const targetPost = await storage.getPost(postId);
    if (targetPost && targetPost.visibility === "subscribers") {
      const userCreator = await storage.getCreatorByUserId(req.session.userId!);
      const isPostCreator = userCreator?.id === targetPost.creatorId;
      const isSubscribed = await storage.isSubscribedToCreator(req.session.userId!, targetPost.creatorId);
      if (!isPostCreator && !isSubscribed) {
        return res.status(403).json({ message: "Subscribe to this creator to comment on this post" });
      }
    }

    const comment = await storage.createComment({
      postId,
      userId: req.session.userId!,
      authorName: user.displayName,
      body: req.body.body,
    });
    // Generate notification for the post creator on comment
    const post = await storage.getPost(postId);
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

  // ─── Stats (cached, refreshes every 5 minutes) ─────────────

  let statsCache: { data: any; expiresAt: number } | null = null;

  app.get("/api/stats", async (_req, res) => {
    try {
      const now = Date.now();
      if (statsCache && now < statsCache.expiresAt) {
        return res.json(statsCache.data);
      }

      const agents = await storage.getAgents();
      const creators = await storage.getCreators();

      const categories: Record<string, number> = {};
      for (const a of agents) {
        categories[a.category] = (categories[a.category] || 0) + 1;
      }

      const data = {
        totalAgents: agents.length,
        totalCreators: creators.length,
        totalDownloads: agents.reduce((sum, a) => sum + a.downloads, 0),
        totalSubscribers: creators.reduce((sum, c) => sum + c.subscribers, 0),
        categories,
      };

      statsCache = { data, expiresAt: now + 5 * 60 * 1000 };
      res.json(data);
    } catch (error: any) {
      console.error("Stats error:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
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

    if (!stripe) return res.status(503).json({ message: "Stripe not configured" });

    try {
      if (!webhookSecret || !sig || !(req as any).rawBody) {
        return res.status(400).json({ message: "Missing webhook signature or secret" });
      }
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret);
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
              currentPeriodEnd: new Date(((sub as any).current_period_end as number) * 1000),
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

  // ─── User Agent Subscriptions ─────────────────────────────────

  app.get("/api/me/agent-subscriptions", requireAuth, async (req, res) => {
    try {
      const subs = await storage.getSubscriptions(req.session.userId!);
      const activeSubs = subs.filter(s => s.status === "active");
      // Enrich with agent details
      const enriched = await Promise.all(activeSubs.map(async (sub) => {
        const agent = await storage.getAgent(sub.agentId);
        return { ...sub, agent: agent || null };
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  app.post("/api/me/agent-subscriptions/:id/cancel", requireAuth, async (req, res) => {
    try {
      const subs = await storage.getSubscriptions(req.session.userId!);
      const sub = subs.find(s => s.id === req.params.id && s.status === "active");
      if (!sub) return res.status(404).json({ message: "Subscription not found" });

      // Cancel on Stripe if it's a paid subscription
      if (sub.stripeSubscriptionId && stripe) {
        await stripe.subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
      }

      await storage.updateSubscription(sub.id, { status: "cancelled" });
      res.json({ message: "Subscription cancelled" });
    } catch (error: any) {
      console.error("Cancel subscription error:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // ─── Billing History ──────────────────────────────────────────

  app.get("/api/me/billing", requireAuth, async (req, res) => {
    try {
      if (!stripe) return res.json([]);

      const user = await storage.getUser(req.session.userId!);
      if (!user?.stripeCustomerId) return res.json([]);

      // Fetch recent charges from Stripe
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 50,
      });

      const records = charges.data.map(charge => ({
        id: charge.id,
        date: new Date(charge.created * 1000).toISOString(),
        description: charge.description || "Agent subscription",
        amount: charge.amount,
        currency: charge.currency.toUpperCase(),
        status: charge.status === "succeeded" ? "paid" as const
          : charge.status === "pending" ? "pending" as const
          : "failed" as const,
      }));

      res.json(records);
    } catch (error: any) {
      console.error("Billing fetch error:", error);
      res.json([]);
    }
  });

  // ─── Agent Health Check ─────────────────────────────────────

  // Bulk health check for all agents with apiEndpoint (called by cron)
  app.post("/api/admin/health-check", async (_req, res) => {
    try {
      const agents = await storage.getAgents();
      const withEndpoint = agents.filter(a => a.apiEndpoint);

      const results: Array<{ id: string; name: string; endpoint: string; healthy: boolean; statusCode?: number; error?: string }> = [];

      await Promise.all(withEndpoint.map(async (agent) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(agent.apiEndpoint!, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeout);

          const healthy = response.status >= 200 && response.status < 300;
          if (healthy) {
            await storage.updateAgent(agent.id, { status: "active" });
          }
          results.push({ id: agent.id, name: agent.name, endpoint: agent.apiEndpoint!, healthy, statusCode: response.status });
        } catch (err: any) {
          // Try GET as fallback (some servers reject HEAD)
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(agent.apiEndpoint!, {
              method: "GET",
              signal: controller.signal,
            });
            clearTimeout(timeout);

            const healthy = response.status >= 200 && response.status < 300;
            if (healthy) {
              await storage.updateAgent(agent.id, { status: "active" });
            }
            results.push({ id: agent.id, name: agent.name, endpoint: agent.apiEndpoint!, healthy, statusCode: response.status });
          } catch (fallbackErr: any) {
            results.push({ id: agent.id, name: agent.name, endpoint: agent.apiEndpoint!, healthy: false, error: fallbackErr.message || "Unreachable" });
          }
        }
      }));

      const healthy = results.filter(r => r.healthy).length;
      res.json({
        checked: results.length,
        healthy,
        unhealthy: results.length - healthy,
        results,
      });
    } catch (error: any) {
      console.error("Health check error:", error);
      res.status(500).json({ message: "Health check failed" });
    }
  });

  // Single agent health check
  app.get("/api/agents/:id/health", async (req, res) => {
    try {
      const agent = await storage.getAgent(asSingleParam(req.params.id));
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (!agent.apiEndpoint) {
        return res.json({ id: agent.id, name: agent.name, healthy: null, message: "No API endpoint configured" });
      }

      let healthy = false;
      let statusCode: number | undefined;
      let error: string | undefined;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(agent.apiEndpoint, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        statusCode = response.status;
        healthy = response.status >= 200 && response.status < 300;
      } catch (err: any) {
        // Fallback to GET
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(agent.apiEndpoint, {
            method: "GET",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          statusCode = response.status;
          healthy = response.status >= 200 && response.status < 300;
        } catch (fallbackErr: any) {
          error = fallbackErr.message || "Unreachable";
        }
      }

      res.json({ id: agent.id, name: agent.name, endpoint: agent.apiEndpoint, healthy, statusCode, error });
    } catch (error: any) {
      console.error("Agent health check error:", error);
      res.status(500).json({ message: "Health check failed" });
    }
  });

  // ─── Auto-Import: GitHub Trending ─────────────────────────────

  async function importFromGitHub(): Promise<{ imported: number; skipped: number; errors: number; agents: string[] }> {
    const queries = [
      "topic:mcp-server stars:>50",
      "topic:ai-agent stars:>100",
      "topic:langchain stars:>200",
      "topic:rag stars:>100",
      "topic:ai-agent+topic:llm+stars:>100",
    ];

    const seenRepos = new Set<string>();
    const allRepos: any[] = [];

    for (const q of queries) {
      try {
        console.log(`[GitHub Import] Searching: ${q}`);
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`;
        const resp = await fetch(url, {
          headers: { "User-Agent": "AgentForge/1.0", "Accept": "application/vnd.github.v3+json" },
        });
        if (!resp.ok) {
          console.error(`[GitHub Import] Search failed for "${q}": ${resp.status} ${resp.statusText}`);
          continue;
        }
        const data = await resp.json() as any;
        for (const repo of (data.items || [])) {
          if (!seenRepos.has(repo.full_name)) {
            seenRepos.add(repo.full_name);
            allRepos.push(repo);
          }
        }
        // Rate limit: 1 second delay between GitHub API calls
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`[GitHub Import] Error searching "${q}":`, err);
      }
    }

    console.log(`[GitHub Import] Found ${allRepos.length} unique repos`);

    const existingAgents = await storage.getAgents();
    const existingNames = new Set(existingAgents.map(a => a.name.toLowerCase()));

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const importedNames: string[] = [];

    for (const repo of allRepos) {
      try {
        const repoName: string = repo.name;
        if (existingNames.has(repoName.toLowerCase())) {
          skipped++;
          continue;
        }

        // Create or find creator
        const ownerLogin: string = repo.owner?.login || "unknown";
        let creator = await storage.getCreatorByHandle(ownerLogin);
        if (!creator) {
          creator = await storage.createCreator({
            name: ownerLogin,
            handle: ownerLogin,
            avatar: `https://github.com/${ownerLogin}.png`,
            bio: "Open source developer on GitHub",
            subscribers: 0,
            agentCount: 0,
            tags: ["github", "open-source"],
            verified: false,
          });
          console.log(`[GitHub Import] Created creator: ${ownerLogin}`);
        }

        // Infer category from topics
        const topics: string[] = repo.topics || [];
        let category = "tool";
        if (topics.some((t: string) => t === "tool" || t === "mcp" || t === "mcp-server")) {
          category = "tool";
        } else if (topics.some((t: string) => t === "agent" || t === "ai-agent")) {
          category = "agent";
        } else if (topics.some((t: string) => t === "api")) {
          category = "api";
        }

        const description = repo.description
          ? (repo.description as string).slice(0, 200)
          : `${repoName} - open source project from GitHub`;

        await storage.createAgent({
          creatorId: creator.id,
          name: repoName,
          description,
          longDescription: repo.description || description,
          category,
          pricing: "free",
          price: null,
          tags: topics.slice(0, 5),
          stars: repo.stargazers_count || 0,
          downloads: (repo.stargazers_count || 0) * 10,
          apiEndpoint: repo.homepage || null,
          hfSpaceUrl: null,
          hfModelId: null,
          backendType: "self-hosted",
          status: "active",
          featured: false,
        });

        existingNames.add(repoName.toLowerCase());
        importedNames.push(repoName);
        imported++;
        console.log(`[GitHub Import] Imported: ${repoName} (${repo.stargazers_count} stars)`);
      } catch (err) {
        console.error(`[GitHub Import] Error importing repo ${repo?.name}:`, err);
        errors++;
      }
    }

    return { imported, skipped, errors, agents: importedNames };
  }

  app.post("/api/admin/import/github", async (_req: Request, res: Response) => {
    try {
      console.log("[GitHub Import] Starting import...");
      const result = await importFromGitHub();
      console.log(`[GitHub Import] Done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`);
      res.json(result);
    } catch (error: any) {
      console.error("[GitHub Import] Fatal error:", error);
      res.status(500).json({ message: "GitHub import failed", error: error.message });
    }
  });

  // ─── Auto-Import: HuggingFace Trending ──────────────────────────

  async function importFromHuggingFace(): Promise<{ imported: number; skipped: number; errors: number; agents: string[] }> {
    const allItems: Array<{ type: "model" | "space"; data: any }> = [];

    // Fetch trending models
    try {
      console.log("[HF Import] Fetching trending models...");
      const modelsResp = await fetch("https://huggingface.co/api/models?sort=downloads&direction=-1&limit=30&pipeline_tag=text-generation", {
        headers: { "User-Agent": "AgentForge/1.0" },
      });
      if (modelsResp.ok) {
        const models = await modelsResp.json() as any[];
        for (const m of models) {
          allItems.push({ type: "model", data: m });
        }
        console.log(`[HF Import] Found ${models.length} trending models`);
      } else {
        console.error(`[HF Import] Models fetch failed: ${modelsResp.status}`);
      }
    } catch (err) {
      console.error("[HF Import] Error fetching models:", err);
    }

    // Fetch trending spaces
    try {
      console.log("[HF Import] Fetching trending spaces...");
      const spacesResp = await fetch("https://huggingface.co/api/spaces?sort=likes&direction=-1&limit=20", {
        headers: { "User-Agent": "AgentForge/1.0" },
      });
      if (spacesResp.ok) {
        const spaces = await spacesResp.json() as any[];
        for (const s of spaces) {
          allItems.push({ type: "space", data: s });
        }
        console.log(`[HF Import] Found ${spaces.length} trending spaces`);
      } else {
        console.error(`[HF Import] Spaces fetch failed: ${spacesResp.status}`);
      }
    } catch (err) {
      console.error("[HF Import] Error fetching spaces:", err);
    }

    const existingAgents = await storage.getAgents();
    const existingNames = new Set(existingAgents.map(a => a.name.toLowerCase()));

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const importedNames: string[] = [];

    for (const item of allItems) {
      try {
        const fullId: string = item.data.id || item.data.modelId || "";
        // Extract name without org prefix (e.g. "Llama-3" from "meta-llama/Llama-3")
        const nameParts = fullId.split("/");
        const shortName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
        const authorId = nameParts.length > 1 ? nameParts[0] : (item.data.author || "unknown");

        if (!shortName) {
          skipped++;
          continue;
        }

        if (existingNames.has(shortName.toLowerCase())) {
          skipped++;
          continue;
        }

        // Create or find creator from author
        let creator = await storage.getCreatorByHandle(authorId);
        if (!creator) {
          creator = await storage.createCreator({
            name: authorId,
            handle: authorId,
            avatar: `https://huggingface.co/avatars/${authorId}`,
            bio: "Creator on Hugging Face",
            subscribers: 0,
            agentCount: 0,
            tags: ["huggingface", "ai"],
            verified: false,
          });
          console.log(`[HF Import] Created creator: ${authorId}`);
        }

        const isModel = item.type === "model";
        const pipelineTag: string = item.data.pipeline_tag || "";
        const description = item.data.description
          ? (item.data.description as string).slice(0, 200)
          : isModel
            ? `${shortName} - ${pipelineTag || "text generation"} model on Hugging Face`
            : `${shortName} - interactive space on Hugging Face`;

        const tags: string[] = (item.data.tags || []).slice(0, 5);

        await storage.createAgent({
          creatorId: creator.id,
          name: shortName,
          description,
          longDescription: item.data.description || description,
          category: isModel ? "agent" : "tool",
          pricing: "free",
          price: null,
          tags,
          stars: item.data.likes || 0,
          downloads: item.data.downloads || 0,
          apiEndpoint: null,
          hfSpaceUrl: isModel ? null : `https://huggingface.co/spaces/${fullId}`,
          hfModelId: isModel ? fullId : null,
          backendType: isModel ? "hf-inference" : "self-hosted",
          status: "active",
          featured: false,
        });

        existingNames.add(shortName.toLowerCase());
        importedNames.push(shortName);
        imported++;
        console.log(`[HF Import] Imported ${item.type}: ${shortName} (${item.data.likes || 0} likes)`);
      } catch (err) {
        console.error(`[HF Import] Error importing ${item.data?.id}:`, err);
        errors++;
      }
    }

    return { imported, skipped, errors, agents: importedNames };
  }

  app.post("/api/admin/import/huggingface", async (_req: Request, res: Response) => {
    try {
      console.log("[HF Import] Starting import...");
      const result = await importFromHuggingFace();
      console.log(`[HF Import] Done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`);
      res.json(result);
    } catch (error: any) {
      console.error("[HF Import] Fatal error:", error);
      res.status(500).json({ message: "HuggingFace import failed", error: error.message });
    }
  });

  // ─── Auto-Import: Combined ──────────────────────────────────────

  app.post("/api/admin/import/all", async (_req: Request, res: Response) => {
    try {
      console.log("[Import All] Starting combined import...");
      const [github, huggingface] = await Promise.all([
        importFromGitHub().catch(err => {
          console.error("[Import All] GitHub import failed:", err);
          return { imported: 0, skipped: 0, errors: 1, agents: [] as string[] };
        }),
        importFromHuggingFace().catch(err => {
          console.error("[Import All] HuggingFace import failed:", err);
          return { imported: 0, skipped: 0, errors: 1, agents: [] as string[] };
        }),
      ]);

      const combined = {
        imported: github.imported + huggingface.imported,
        skipped: github.skipped + huggingface.skipped,
        errors: github.errors + huggingface.errors,
        agents: [...github.agents, ...huggingface.agents],
        details: { github, huggingface },
      };

      console.log(`[Import All] Done: ${combined.imported} imported, ${combined.skipped} skipped, ${combined.errors} errors`);
      res.json(combined);
    } catch (error: any) {
      console.error("[Import All] Fatal error:", error);
      res.status(500).json({ message: "Combined import failed", error: error.message });
    }
  });

  // ─── Daily Auto-Import Scheduler ─────────────────────────────
  // Runs every 24 hours to pull latest agents from GitHub Trending & HuggingFace
  const IMPORT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  async function runDailyImport() {
    console.log("[Scheduler] Starting daily auto-import...");
    try {
      const [github, huggingface] = await Promise.all([
        importFromGitHub().catch(err => {
          console.error("[Scheduler] GitHub import failed:", err.message);
          return { imported: 0, skipped: 0, errors: 1, agents: [] as string[] };
        }),
        importFromHuggingFace().catch(err => {
          console.error("[Scheduler] HuggingFace import failed:", err.message);
          return { imported: 0, skipped: 0, errors: 1, agents: [] as string[] };
        }),
      ]);
      console.log(`[Scheduler] Daily import done: GitHub(${github.imported} new, ${github.skipped} skipped), HF(${huggingface.imported} new, ${huggingface.skipped} skipped)`);
    } catch (err: any) {
      console.error("[Scheduler] Daily import failed:", err.message);
    }
  }

  // Run first import 30 seconds after startup, then every 24 hours
  setTimeout(() => {
    runDailyImport();
    setInterval(runDailyImport, IMPORT_INTERVAL_MS);
  }, 30 * 1000);
  console.log("[Scheduler] Daily auto-import scheduled (every 24h, first run in 30s)");

  // ─── HF Inference Proxy ──────────────────────────────────────

  app.post("/api/agents/:id/invoke", requireApiKeyOrSession, async (req, res) => {
    try {
      const agent = await storage.getAgent(asSingleParam(req.params.id));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      // Check subscription auth
      const userId = getAuthUserId(req)!;
      if (agent.pricing !== "free") {
        const subs = await storage.getSubscriptions(userId);
        const activeSub = subs.find(s => s.agentId === agent.id && s.status === "active");
        if (!activeSub) {
          return res.status(403).json({ message: "Active subscription required" });
        }
      }

      // ── Self-hosted agent: proxy to its apiEndpoint ──
      if (agent.backendType === "self-hosted") {
        if (!agent.apiEndpoint) {
          return res.status(400).json({ message: "No API endpoint configured for this agent" });
        }

        // Validate endpoint URL to prevent SSRF against internal services
        const targetUrl = new URL(agent.apiEndpoint);
        if (targetUrl.hostname === "localhost" || targetUrl.hostname === "127.0.0.1" || targetUrl.hostname === "0.0.0.0") {
          return res.status(400).json({ message: "Invalid agent endpoint" });
        }

        const proxyRes = await fetch(agent.apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(req.headers["authorization"] ? {} : {}),
          },
          body: JSON.stringify(req.body),
        });

        const contentType = proxyRes.headers.get("content-type") || "application/json";
        res.status(proxyRes.status).set("Content-Type", contentType);

        if (!proxyRes.ok) {
          const errBody = await proxyRes.text();
          return res.send(errBody);
        }

        if (req.body.stream && proxyRes.body) {
          const { Readable } = await import("stream");
          const nodeStream = Readable.fromWeb(proxyRes.body as any);
          nodeStream.pipe(res);
        } else {
          const data = await proxyRes.json();
          res.json(data);
        }
        return;
      }

      // ── HF Inference agent ──
      if (agent.backendType !== "hf-inference") {
        return res.status(400).json({ message: `Unsupported backend type: ${agent.backendType}` });
      }

      if (!agent.hfModelId) {
        return res.status(400).json({ message: "No HF model configured for this agent" });
      }

      const hfToken = process.env.HF_API_TOKEN;
      if (!hfToken) {
        return res.status(503).json({ message: "HF Inference not configured. Set HF_API_TOKEN env var." });
      }

      // Forward to HF Inference Providers API
      const hfRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: agent.hfModelId,
          ...req.body,
        }),
      });

      const contentType = hfRes.headers.get("content-type") || "application/json";
      res.status(hfRes.status).set("Content-Type", contentType);

      if (!hfRes.ok) {
        const errBody = await hfRes.text();
        return res.send(errBody);
      }

      // Stream support: if client requested streaming, pipe through
      if (req.body.stream) {
        if (hfRes.body) {
          const reader = hfRes.body as any;
          // Node 18+ fetch returns a web ReadableStream — pipe it
          const { Readable } = await import("stream");
          const nodeStream = Readable.fromWeb(reader);
          nodeStream.pipe(res);
        } else {
          const body = await hfRes.text();
          res.send(body);
        }
      } else {
        const data = await hfRes.json();
        res.json(data);
      }
    } catch (error: any) {
      console.error("Agent invoke proxy error:", error);
      res.status(502).json({ message: "Failed to invoke agent", error: error.message });
    }
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
    const revoked = await storage.revokeApiKey(asSingleParam(req.params.id), req.session.userId!);
    if (!revoked) return res.status(404).json({ message: "Key not found" });
    res.json({ success: true });
  });

  // ─── Playground Conversations ────────────────────────────────

  // Create a new conversation (or return existing for anonymous)
  app.post("/api/conversations", async (req, res) => {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ message: "agentId required" });

    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const userId = req.session.userId || null;
    const conv = await storage.createConversation({ agentId, userId });
    res.json(conv);
  });

  // List conversations for current user
  app.get("/api/conversations", requireAuth, async (req, res) => {
    const convs = await storage.getConversationsByUser(req.session.userId!);
    res.json(convs);
  });

  // Get messages for a conversation
  app.get("/api/conversations/:id/messages", async (req, res) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    // Only allow owner to see their conversations (or anonymous ones)
    if (conv.userId && conv.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const msgs = await storage.getMessages(conv.id);
    res.json(msgs);
  });

  // Send a message and get agent response
  app.post("/api/conversations/:id/messages", async (req, res) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv) return res.status(404).json({ message: "Conversation not found" });

    if (conv.userId && conv.userId !== req.session.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { content } = req.body;
    if (!content || typeof content !== "string") {
      return res.status(400).json({ message: "content required" });
    }

    // Anonymous trial: limit to 3 messages per conversation
    if (!conv.userId) {
      const existing = await storage.getMessages(conv.id);
      const userMsgCount = existing.filter(m => m.role === "user").length;
      if (userMsgCount >= 3) {
        return res.status(403).json({ message: "Sign up to continue this conversation", code: "TRIAL_LIMIT" });
      }
    }

    // Save user message
    const userMsg = await storage.createMessage({ conversationId: conv.id, role: "user", content });

    // Auto-set title from first message
    if (!conv.title) {
      const title = content.length > 60 ? content.slice(0, 57) + "..." : content;
      await storage.updateConversation(conv.id, { title, updatedAt: new Date() });
    } else {
      await storage.updateConversation(conv.id, { updatedAt: new Date() });
    }

    // Invoke the agent
    const agent = await storage.getAgent(conv.agentId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    // Build message history for the agent
    const allMessages = await storage.getMessages(conv.id);
    const chatHistory = allMessages.map(m => ({ role: m.role, content: m.content }));

    let assistantContent = "";

    try {
      // 1. Try the agent's own backend first (self-hosted with a real API endpoint)
      if (agent.backendType === "self-hosted" && agent.apiEndpoint) {
        const targetUrl = new URL(agent.apiEndpoint);
        const isRealApi = !["localhost", "127.0.0.1", "0.0.0.0"].includes(targetUrl.hostname)
          && !targetUrl.hostname.includes("github.com");
        if (isRealApi) {
          try {
            const proxyRes = await fetch(agent.apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: chatHistory }),
            });
            if (proxyRes.ok) {
              const data = await proxyRes.json();
              assistantContent = data.choices?.[0]?.message?.content || data.response || data.content || JSON.stringify(data);
            }
          } catch {}
        }
      }

      // 2. Fall back to platform AI (HuggingFace Inference)
      if (!assistantContent) {
        assistantContent = await platformAIChat(agent, chatHistory);
      }

      // 3. Static fallback if no AI service is configured
      if (!assistantContent) {
        assistantContent = `Hi! I'm **${agent.name}** — ${agent.description}\n\nAI responses require the \`HF_API_TOKEN\` environment variable to be set. Please configure it with a [free HuggingFace token](https://huggingface.co/settings/tokens) to enable AI chat.`;
      }
    } catch (err: any) {
      console.error("Playground invoke error:", err);
      assistantContent = `Hi! I'm **${agent.name}** — ${agent.description}\n\nSomething went wrong. Please try again.`;
    }

    const assistantMsg = await storage.createMessage({ conversationId: conv.id, role: "assistant", content: assistantContent });

    res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  });

  // ─── Content Sources ────────────────────────────────────────
  app.get("/api/content-sources", (_req, res) => {
    res.json(CONTENT_SOURCES.filter(s => s.active));
  });

  // ─── Tier 2: Per-Agent API Key Generation ──────────────────

  app.post("/api/agents/:id/keys", requireAuth, async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      const userId = req.session.userId!;
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      // Verify user has active subscription
      const subs = await storage.getSubscriptions(userId);
      const activeSub = subs.find(s => s.agentId === agentId && s.status === "active");
      if (!activeSub) return res.status(403).json({ message: "You must install this agent first" });

      // Generate scoped API key
      const crypto = await import("crypto");
      const rawKey = `af_k_${crypto.randomBytes(24).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12);

      const apiKey = await storage.createApiKey({
        userId,
        name: req.body.name || `${agent.name} API Key`,
        keyHash,
        keyPrefix,
        agentId,
      });

      res.status(201).json({ ...apiKey, key: rawKey });
    } catch (error: any) {
      console.error("Create agent API key error:", error);
      res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.get("/api/agents/:id/keys", requireAuth, async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      const userId = req.session.userId!;
      const allKeys = await storage.getApiKeysByUser(userId);
      const agentKeys = allKeys.filter(k => k.agentId === agentId && !k.revoked);
      res.json(agentKeys);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch keys" });
    }
  });

  // ─── Tier 2: Connectivity Test ─────────────────────────────

  app.post("/api/agents/:id/test-connect", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getAgent(asSingleParam(req.params.id));
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (!agent.apiEndpoint) return res.json({ reachable: false, error: "No API endpoint configured" });

      const start = Date.now();
      let reachable = false;
      let statusCode: number | undefined;
      let error: string | undefined;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(agent.apiEndpoint, {
          method: "HEAD",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        statusCode = response.status;
        reachable = response.status < 500;
      } catch (err: any) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(agent.apiEndpoint, {
            method: "GET",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          statusCode = response.status;
          reachable = response.status < 500;
        } catch (fallbackErr: any) {
          error = fallbackErr.message || "Unreachable";
        }
      }

      const latencyMs = Date.now() - start;
      res.json({ reachable, latencyMs, statusCode, error, endpoint: agent.apiEndpoint });
    } catch (error: any) {
      res.status(500).json({ message: "Connection test failed" });
    }
  });

  // ─── Tier 2: Usage Tracking ────────────────────────────────

  app.get("/api/agents/:id/usage", requireAuth, async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      const userId = req.session.userId!;
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days
      const logs = await storage.getApiUsageLogs(userId);
      const agentLogs = logs.filter(l => l.agentId === agentId && new Date(l.createdAt) >= since);

      // Daily breakdown
      const daily: Record<string, number> = {};
      agentLogs.forEach(l => {
        const day = new Date(l.createdAt).toISOString().slice(0, 10);
        daily[day] = (daily[day] || 0) + 1;
      });

      res.json({
        total: agentLogs.length,
        period: "30d",
        daily: Object.entries(daily).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // ─── Tier 3: Deploy Config Generation ──────────────────────

  app.get("/api/agents/:id/deploy-config", requireAuth, async (req, res) => {
    try {
      const agent = await storage.getAgent(asSingleParam(req.params.id));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const format = asSingleParam(req.query.format as string) || "docker-compose";
      const name = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
      const image = (agent as any).dockerImage || `agentforge/${name}:latest`;

      let config = "";

      if (format === "docker-compose") {
        config = `version: "3.8"
services:
  ${name}:
    image: ${image}
    container_name: ${name}
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - AGENT_NAME=${agent.name}
      - AGENT_ID=${agent.id}
      - AGENTFORGE_API_KEY=\${AGENTFORGE_API_KEY}
${agent.apiEndpoint ? `      - UPSTREAM_URL=${agent.apiEndpoint}` : ""}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
`;
      } else if (format === "dockerfile") {
        config = `FROM ${image}

ENV AGENT_NAME="${agent.name}"
ENV AGENT_ID="${agent.id}"
${agent.apiEndpoint ? `ENV UPSTREAM_URL="${agent.apiEndpoint}"` : ""}

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \\
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
`;
      } else if (format === "fly-toml") {
        config = `app = "${name}"
primary_region = "hkg"

[build]
  image = "${image}"

[env]
  AGENT_NAME = "${agent.name}"
  AGENT_ID = "${agent.id}"
${agent.apiEndpoint ? `  UPSTREAM_URL = "${agent.apiEndpoint}"` : ""}

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
`;
      } else {
        return res.status(400).json({ message: "Unsupported format. Use: docker-compose, dockerfile, fly-toml" });
      }

      res.json({ format, config, agentName: agent.name });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate deploy config" });
    }
  });

  // ─── Tier 3: Agent-to-Agent (A2A) Subscriptions ────────────

  app.post("/api/agents/:id/subscribe-agent", requireAuth, async (req, res) => {
    try {
      const targetAgentId = asSingleParam(req.params.id);
      const { sourceAgentId } = req.body;
      const userId = req.session.userId!;

      if (!sourceAgentId) return res.status(400).json({ message: "sourceAgentId is required" });

      // Verify user owns the source agent (via creator)
      const creator = await storage.getCreatorByUserId(userId);
      if (!creator) return res.status(403).json({ message: "You must be a creator to subscribe agents" });

      const targetAgent = await storage.getAgent(targetAgentId);
      if (!targetAgent) return res.status(404).json({ message: "Target agent not found" });

      // Check if already subscribed
      const existingSubs = await storage.getSubscriptions(sourceAgentId);
      const existing = existingSubs.find(s => s.agentId === targetAgentId && s.status === "active");
      if (existing) return res.status(409).json({ message: "Agent already subscribed" });

      // Create A2A subscription
      const sub = await storage.createSubscription({
        subscriberId: sourceAgentId,
        subscriberType: "agent",
        agentId: targetAgentId,
        plan: targetAgent.pricing === "free" ? "free" : "pro",
        status: "active",
      });

      res.status(201).json(sub);
    } catch (error: any) {
      console.error("A2A subscribe error:", error);
      res.status(500).json({ message: "Failed to create agent subscription" });
    }
  });

  app.post("/api/agents/:id/a2a-key", requireAuth, async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      const userId = req.session.userId!;

      // Verify user owns this agent
      const creator = await storage.getCreatorByUserId(userId);
      if (!creator) return res.status(403).json({ message: "You must be a creator" });

      const crypto = await import("crypto");
      const rawKey = `af_a_${crypto.randomBytes(24).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 12);

      // Store in agentApiKeys (use apiKeys table with agent scope for simplicity)
      const apiKey = await storage.createApiKey({
        userId,
        name: `A2A Key for Agent ${agentId}`,
        keyHash,
        keyPrefix,
        agentId,
      });

      res.status(201).json({ ...apiKey, key: rawKey });
    } catch (error: any) {
      console.error("A2A key generation error:", error);
      res.status(500).json({ message: "Failed to generate agent key" });
    }
  });

  app.get("/api/agents/:id/a2a-subscriptions", requireAuth, async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      // Get subscriptions where this agent is the subscriber
      const allSubs = await storage.getSubscriptions(agentId);
      const activeSubs = allSubs.filter(s => s.status === "active");
      const enriched = await Promise.all(activeSubs.map(async (sub) => {
        const agent = await storage.getAgent(sub.agentId);
        return { ...sub, agent: agent || null };
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch A2A subscriptions" });
    }
  });

  // ── Live GitHub stats with 1-hour TTL cache ──
  const githubStatsCache = new Map<string, { data: any; expiresAt: number }>();

  function extractGitHubOwnerRepo(url: string): { owner: string; repo: string } | null {
    // Match github.com/owner/repo patterns
    const match = url.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
  }

  app.get("/api/agents/:id/live-stats", async (req, res) => {
    try {
      const agentId = asSingleParam(req.params.id);
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const endpoint = agent.apiEndpoint || "";
      if (!endpoint.includes("github.com")) {
        return res.json({ exists: false });
      }

      const parsed = extractGitHubOwnerRepo(endpoint);
      if (!parsed) return res.json({ exists: false });

      const cacheKey = `${parsed.owner}/${parsed.repo}`;
      const cached = githubStatsCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return res.json(cached.data);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const ghRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
          headers: { "Accept": "application/vnd.github.v3+json", "User-Agent": "AgentForge" },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!ghRes.ok) {
          const result = { exists: false };
          githubStatsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 3600_000 });
          return res.json(result);
        }

        const data = await ghRes.json();
        const result = {
          exists: true,
          stars: data.stargazers_count,
          forks: data.forks_count,
          updatedAt: data.updated_at,
          language: data.language,
          description: data.description,
        };
        githubStatsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 3600_000 });
        return res.json(result);
      } catch {
        clearTimeout(timeout);
        return res.json({ exists: false });
      }
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch live stats" });
    }
  });

  // ── Bulk agent verification ──
  app.post("/api/admin/verify-agents", async (_req, res) => {
    try {
      const allAgents = await storage.getAgents();
      let verified = 0;
      let broken = 0;
      let noEndpoint = 0;
      const brokenAgents: string[] = [];

      const checks = allAgents.map(async (agent) => {
        const endpoint = agent.apiEndpoint || "";
        if (!endpoint.includes("github.com")) {
          noEndpoint++;
          return;
        }

        const parsed = extractGitHubOwnerRepo(endpoint);
        if (!parsed) {
          noEndpoint++;
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        try {
          const ghRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
            method: "HEAD",
            headers: { "User-Agent": "AgentForge" },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (ghRes.ok) {
            verified++;
          } else {
            broken++;
            brokenAgents.push(agent.name);
          }
        } catch {
          clearTimeout(timeout);
          broken++;
          brokenAgents.push(agent.name);
        }
      });

      await Promise.all(checks);

      res.json({
        total: allAgents.length,
        verified,
        broken,
        noEndpoint,
        brokenAgents,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to verify agents" });
    }
  });

  return httpServer;
}
