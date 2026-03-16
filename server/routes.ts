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

  // Session middleware
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "agentforge-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // set true behind HTTPS proxy
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: "lax",
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
    res.json({ ...creator, agents });
  });

  // ─── Subscriptions ──────────────────────────────────────────

  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    const sub = await storage.createSubscription(req.body);
    res.status(201).json(sub);
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
