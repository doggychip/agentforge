import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import crypto from "crypto";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { generateSecret as otpGenerateSecret, generateURI as otpGenerateURI, verifySync as otpVerifySync } from "otplib";
import QRCode from "qrcode";
import { storage } from "./storage";
import { CONTENT_SOURCES } from "./content-sources";
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

function toSafeUser(user: { id: string; username: string; email: string; displayName: string; avatar: string | null; role: string; password: string; totpSecret?: string | null; [key: string]: any }): SafeUser {
  const { password, totpSecret, ...safe } = user;
  return safe as SafeUser;
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

      // Generate email verification token
      const verifyToken = crypto.randomBytes(32).toString("hex");
      emailVerificationTokens.set(verifyToken, { userId: user.id, email: user.email, expiresAt: Date.now() + 24 * 3600_000 });
      const origin = `${req.protocol}://${req.get("host")}`;
      const verifyUrl = `${origin}/#/verify-email?token=${verifyToken}`;
      console.log(`[auth] Email verification link for ${user.email}: ${verifyUrl}`);

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

  // Login rate limiting by IP
  const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
  const LOGIN_MAX_ATTEMPTS = 5;
  const LOGIN_BLOCK_MINUTES = 15;

  app.post("/api/auth/login", async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const attempt = loginAttempts.get(ip);

      if (attempt && now < attempt.blockedUntil) {
        const retryAfter = Math.ceil((attempt.blockedUntil - now) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          message: `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
        });
      }

      const data = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(data.email);
      if (!user) {
        // Track failed attempt
        const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
        entry.count++;
        if (entry.count >= LOGIN_MAX_ATTEMPTS) {
          entry.blockedUntil = now + LOGIN_BLOCK_MINUTES * 60_000;
          entry.count = 0;
        }
        loginAttempts.set(ip, entry);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(data.password, user.password);
      if (!validPassword) {
        const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
        entry.count++;
        if (entry.count >= LOGIN_MAX_ATTEMPTS) {
          entry.blockedUntil = now + LOGIN_BLOCK_MINUTES * 60_000;
          entry.count = 0;
        }
        loginAttempts.set(ip, entry);
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Clear attempts on success
      loginAttempts.delete(ip);

      // If 2FA is enabled, require TOTP verification before granting session
      if (user.totpEnabled && user.totpSecret) {
        const tempToken = crypto.randomBytes(32).toString("hex");
        pending2faLogins.set(tempToken, { userId: user.id, expiresAt: Date.now() + 300_000 }); // 5 min
        return res.json({ requires2fa: true, tempToken });
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

  // ─── Forgot Username ──────────────────────────────────────
  app.post("/api/auth/forgot-username", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal whether email exists
        return res.json({ message: "If an account with that email exists, the username has been sent." });
      }
      res.json({ message: "If an account with that email exists, the username has been sent.", username: user.username });
    } catch (error: any) {
      console.error("Forgot username error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Token stores ─────────────────────────────────────────
  const passwordResetTokens = new Map<string, { userId: string; expiresAt: number }>();
  const emailVerificationTokens = new Map<string, { userId: string; email: string; expiresAt: number }>();
  const pending2faLogins = new Map<string, { userId: string; expiresAt: number }>();

  // ─── Forgot Password ──────────────────────────────────────

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });

      const user = await storage.getUserByEmail(email);
      // Always return success to avoid leaking whether email exists
      const successMsg = "If an account with that email exists, a password reset link has been sent.";

      if (!user) return res.json({ message: successMsg });

      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 3600_000 }); // 1 hour

      // Build reset URL
      const origin = `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${origin}/#/reset-password?token=${token}`;

      // Try to send email if SMTP is configured
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_PORT === "465",
          auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || smtpUser,
          to: email,
          subject: "AgentForge — Reset Your Password",
          html: `<p>Hi ${user.displayName},</p><p>Click the link below to reset your password (expires in 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
        });
        console.log(`[auth] Password reset email sent to ${email}`);
      } else {
        // No email configured — log link for admin use
        console.log(`[auth] Password reset link for ${email}: ${resetUrl}`);
      }

      res.json({ message: successMsg });
    } catch (error: any) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ message: "Token and password are required" });
      if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

      const entry = passwordResetTokens.get(token);
      if (!entry || Date.now() > entry.expiresAt) {
        passwordResetTokens.delete(token);
        return res.status(400).json({ message: "Invalid or expired reset token" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await storage.updateUser(entry.userId, { password: hashedPassword });
      passwordResetTokens.delete(token);

      res.json({ message: "Password has been reset. You can now log in." });
    } catch (error: any) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Google OAuth ─────────────────────────────────────────
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    passport.use(new GoogleStrategy({
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: "/api/auth/google/callback",
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email from Google"));

        // Check if user exists by Google ID or email
        let user = await storage.getUserByGoogleId(profile.id);
        if (!user) {
          user = await storage.getUserByEmail(email);
          if (user) {
            // Link Google account to existing user
            await storage.updateUser(user.id, { googleId: profile.id, emailVerified: true });
            user = await storage.getUser(user.id);
          } else {
            // Create new user
            const randomPassword = crypto.randomBytes(32).toString("hex");
            user = await storage.createUser({
              username: email.split("@")[0] + "_" + Math.random().toString(36).slice(2, 6),
              email,
              password: await bcrypt.hash(randomPassword, 12),
              displayName: profile.displayName || email.split("@")[0],
            });
            await storage.updateUser(user!.id, { googleId: profile.id, emailVerified: true, avatar: profile.photos?.[0]?.value });
            user = await storage.getUser(user!.id);
          }
        }
        done(null, user!);
      } catch (err) {
        done(err as Error);
      }
    }));

    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));

    app.get("/api/auth/google/callback", (req, res, next) => {
      passport.authenticate("google", { session: false }, (err: any, user: any) => {
        if (err || !user) {
          return res.redirect("/#/auth?error=google_failed");
        }
        req.session.userId = user.id;
        req.session.save(() => {
          res.redirect("/#/");
        });
      })(req, res, next);
    });
  }

  // Check which auth providers are available
  app.get("/api/auth/providers", (_req, res) => {
    res.json({
      google: !!googleClientId,
      email: true,
    });
  });

  // ─── Email Verification ──────────────────────────────────
  app.post("/api/auth/send-verification", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.emailVerified) return res.json({ message: "Email already verified" });

      // Generate token
      const token = crypto.randomBytes(32).toString("hex");
      emailVerificationTokens.set(token, { userId: user.id, email: user.email, expiresAt: Date.now() + 24 * 3600_000 });

      const origin = `${req.protocol}://${req.get("host")}`;
      const verifyUrl = `${origin}/#/verify-email?token=${token}`;

      // Try to send email if SMTP is configured
      const smtpHost = process.env.SMTP_HOST;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT || "587"),
          secure: process.env.SMTP_PORT === "465",
          auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || smtpUser,
          to: user.email,
          subject: "AgentForge — Verify Your Email",
          html: `<p>Hi ${user.displayName},</p><p>Click the link below to verify your email (expires in 24 hours):</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
        });
        console.log(`[auth] Verification email sent to ${user.email}`);
      } else {
        console.log(`[auth] Email verification link for ${user.email}: ${verifyUrl}`);
      }

      res.json({ message: "Verification email sent" });
    } catch (error: any) {
      console.error("Send verification error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ message: "Token is required" });

      const entry = emailVerificationTokens.get(token);
      if (!entry || Date.now() > entry.expiresAt) {
        emailVerificationTokens.delete(token);
        return res.status(400).json({ message: "Invalid or expired verification token" });
      }

      await storage.updateUser(entry.userId, { emailVerified: true });
      emailVerificationTokens.delete(token);

      res.json({ message: "Email verified successfully" });
    } catch (error: any) {
      console.error("Verify email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── 2FA (TOTP) ──────────────────────────────────────────
  app.post("/api/auth/2fa/setup", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.totpEnabled) return res.status(400).json({ message: "2FA is already enabled" });

      const secret = otpGenerateSecret();
      // Store the secret temporarily (not yet enabled)
      await storage.updateUser(user.id, { totpSecret: secret });

      const otpauth = otpGenerateURI({ issuer: "AgentForge", label: user.email, secret });
      const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

      res.json({ secret, qrCode: qrCodeDataUrl });
    } catch (error: any) {
      console.error("2FA setup error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/2fa/enable", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "TOTP code is required" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.totpEnabled) return res.status(400).json({ message: "2FA is already enabled" });
      if (!user.totpSecret) return res.status(400).json({ message: "Run 2FA setup first" });

      const isValid = otpVerifySync({ token: code, secret: user.totpSecret }).valid;
      if (!isValid) return res.status(400).json({ message: "Invalid TOTP code" });

      await storage.updateUser(user.id, { totpEnabled: true });
      res.json({ message: "2FA enabled successfully" });
    } catch (error: any) {
      console.error("2FA enable error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/2fa/disable", requireAuth, async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "TOTP code is required" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!user.totpEnabled || !user.totpSecret) return res.status(400).json({ message: "2FA is not enabled" });

      const isValid = otpVerifySync({ token: code, secret: user.totpSecret }).valid;
      if (!isValid) return res.status(400).json({ message: "Invalid TOTP code" });

      await storage.updateUser(user.id, { totpEnabled: false, totpSecret: null });
      res.json({ message: "2FA disabled successfully" });
    } catch (error: any) {
      console.error("2FA disable error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/2fa/verify-login", async (req, res) => {
    try {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return res.status(400).json({ message: "Temp token and TOTP code are required" });

      const entry = pending2faLogins.get(tempToken);
      if (!entry || Date.now() > entry.expiresAt) {
        pending2faLogins.delete(tempToken);
        return res.status(400).json({ message: "Invalid or expired 2FA session" });
      }

      const user = await storage.getUser(entry.userId);
      if (!user || !user.totpSecret) {
        pending2faLogins.delete(tempToken);
        return res.status(400).json({ message: "User not found" });
      }

      const isValid = otpVerifySync({ token: code, secret: user.totpSecret }).valid;
      if (!isValid) return res.status(400).json({ message: "Invalid TOTP code" });

      pending2faLogins.delete(tempToken);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error (2fa-login):", err);
          return res.status(500).json({ message: "Session error" });
        }
        res.json(toSafeUser(user));
      });
    } catch (error: any) {
      console.error("2FA verify-login error:", error);
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

      const allowedFields = ["name", "description", "longDescription", "category", "pricing", "price", "tags", "apiEndpoint", "hfSpaceUrl", "hfModelId", "backendType", "status"] as const;
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
      function simulateTrend(total: number): number[] {
        const dailyAvg = Math.max(1, Math.round(total / 30));
        return Array.from({ length: 7 }, () =>
          Math.max(0, Math.round(dailyAvg * (0.8 + Math.random() * 0.4)))
        );
      }

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

    // Block comments on subscriber-only posts for non-subscribers
    const targetPost = await storage.getPost(req.params.id);
    if (targetPost && targetPost.visibility === "subscribers") {
      const userCreator = await storage.getCreatorByUserId(req.session.userId!);
      const isPostCreator = userCreator?.id === targetPost.creatorId;
      const isSubscribed = await storage.isSubscribedToCreator(req.session.userId!, targetPost.creatorId);
      if (!isPostCreator && !isSubscribed) {
        return res.status(403).json({ message: "Subscribe to this creator to comment on this post" });
      }
    }

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

  // ─── HF Inference Proxy ──────────────────────────────────────

  app.post("/api/agents/:id/invoke", requireApiKeyOrSession, async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
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
    const revoked = await storage.revokeApiKey(req.params.id, req.session.userId!);
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
      if (agent.backendType === "hf-inference" && agent.hfModelId) {
        const hfToken = process.env.HF_API_TOKEN;
        if (!hfToken) {
          assistantContent = "I'm currently unavailable — the inference service is not configured. Please try again later.";
        } else {
          const hfRes = await fetch("https://router.huggingface.co/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${hfToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: agent.hfModelId, messages: chatHistory }),
          });
          if (hfRes.ok) {
            const data = await hfRes.json();
            assistantContent = data.choices?.[0]?.message?.content || "No response from model.";
          } else {
            assistantContent = "Sorry, I encountered an error processing your request.";
          }
        }
      } else if (agent.backendType === "self-hosted" && agent.apiEndpoint) {
        // Validate no SSRF
        const targetUrl = new URL(agent.apiEndpoint);
        if (["localhost", "127.0.0.1", "0.0.0.0"].includes(targetUrl.hostname)) {
          assistantContent = "This agent's endpoint is not accessible.";
        } else {
          const proxyRes = await fetch(agent.apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: chatHistory }),
          });
          if (proxyRes.ok) {
            const data = await proxyRes.json();
            assistantContent = data.choices?.[0]?.message?.content || data.response || data.content || JSON.stringify(data);
          } else {
            assistantContent = "Sorry, I encountered an error processing your request.";
          }
        }
      } else {
        // Demo fallback for agents without a configured backend
        assistantContent = `Hi! I'm **${agent.name}** — ${agent.description}\n\nThis is a demo conversation. To get full functionality, the agent creator needs to configure an inference backend.\n\nFeel free to explore what I can do!`;
      }
    } catch (err: any) {
      console.error("Playground invoke error:", err);
      assistantContent = "Sorry, something went wrong. Please try again.";
    }

    const assistantMsg = await storage.createMessage({ conversationId: conv.id, role: "assistant", content: assistantContent });

    res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
  });

  // ─── Content Sources ────────────────────────────────────────
  app.get("/api/content-sources", (_req, res) => {
    res.json(CONTENT_SOURCES.filter(s => s.active));
  });

  return httpServer;
}
