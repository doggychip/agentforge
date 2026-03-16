import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { registerSchema, loginSchema, type SafeUser } from "@shared/schema";
import bcrypt from "bcryptjs";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Trust proxy (behind Zeabur / Perplexity reverse proxy)
  app.set("trust proxy", 1);

  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "agentforge-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: true,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "none", // Required for cross-site iframe contexts
      },
    })
  );

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

      // Set session
      req.session.userId = user.id;
      res.status(201).json(toSafeUser(user));
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
      res.json(toSafeUser(user));
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
    const { category, search, featured } = _req.query;
    if (featured === "true") {
      const agents = await storage.getFeaturedAgents();
      return res.json(agents);
    }
    if (search && typeof search === "string") {
      const agents = await storage.searchAgents(search);
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
    const agents = await storage.getAgentsByCreator(creator.id);
    const creatorPosts = await storage.getPostsByCreator(creator.id);
    res.json({ ...creator, agents, posts: creatorPosts });
  });

  // ─── Subscriptions ──────────────────────────────────────────

  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    const sub = await storage.createSubscription(req.body);
    res.status(201).json(sub);
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
    res.status(201).json(comment);
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

  return httpServer;
}
