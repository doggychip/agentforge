import {
  type User, type InsertUser,
  type Creator, type InsertCreator,
  type Agent, type InsertAgent,
  type Subscription, type InsertSubscription,
  users, creators, agents, subscriptions,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, ilike, or, sql } from "drizzle-orm";

// ─── Interface ───────────────────────────────────────────────
export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getCreators(): Promise<Creator[]>;
  getCreator(id: string): Promise<Creator | undefined>;
  getCreatorByHandle(handle: string): Promise<Creator | undefined>;
  getFeaturedCreators(): Promise<Creator[]>;

  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  getAgentsByCreator(creatorId: string): Promise<Agent[]>;
  getFeaturedAgents(): Promise<Agent[]>;
  getAgentsByCategory(category: string): Promise<Agent[]>;
  searchAgents(query: string): Promise<Agent[]>;

  getSubscriptions(subscriberId: string): Promise<Subscription[]>;
  createSubscription(sub: InsertSubscription): Promise<Subscription>;

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
  async createUser(insertUser: InsertUser) {
    const [user] = await db!.insert(users).values(insertUser).returning();
    return user;
  }

  async getCreators() {
    return db!.select().from(creators);
  }
  async getCreator(id: string) {
    const [creator] = await db!.select().from(creators).where(eq(creators.id, id));
    return creator;
  }
  async getCreatorByHandle(handle: string) {
    const [creator] = await db!.select().from(creators).where(eq(creators.handle, handle));
    return creator;
  }
  async getFeaturedCreators() {
    return db!.select().from(creators).where(eq(creators.verified, true)).limit(4);
  }

  async getAgents() {
    return db!.select().from(agents);
  }
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
      or(
        ilike(agents.name, pattern),
        ilike(agents.description, pattern),
      )
    );
  }

  async getSubscriptions(subscriberId: string) {
    return db!.select().from(subscriptions).where(eq(subscriptions.subscriberId, subscriberId));
  }
  async createSubscription(sub: InsertSubscription) {
    const [subscription] = await db!.insert(subscriptions).values(sub).returning();
    return subscription;
  }

  async seed() {
    // Check if already seeded
    const existing = await db!.select().from(creators).limit(1);
    if (existing.length > 0) return;

    await db!.insert(creators).values(SEED_CREATORS);
    await db!.insert(agents).values(SEED_AGENTS);
    console.log("Database seeded with sample data");
  }
}

// ─── In-Memory Storage (no DATABASE_URL) ─────────────────────
class MemStorage implements IStorage {
  private usersMap: Map<string, User>;
  private creatorsMap: Map<string, Creator>;
  private agentsMap: Map<string, Agent>;
  private subscriptionsMap: Map<string, Subscription>;

  constructor() {
    this.usersMap = new Map();
    this.creatorsMap = new Map();
    this.agentsMap = new Map();
    this.subscriptionsMap = new Map();
  }

  async seed() {
    SEED_CREATORS.forEach((c) => this.creatorsMap.set(c.id!, c as Creator));
    SEED_AGENTS.forEach((a) => this.agentsMap.set(a.id!, a as Agent));
  }

  async getUser(id: string) { return this.usersMap.get(id); }
  async getUserByUsername(username: string) {
    return Array.from(this.usersMap.values()).find(u => u.username === username);
  }
  async createUser(insertUser: InsertUser) {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.usersMap.set(id, user);
    return user;
  }

  async getCreators() { return Array.from(this.creatorsMap.values()); }
  async getCreator(id: string) { return this.creatorsMap.get(id); }
  async getCreatorByHandle(handle: string) {
    return Array.from(this.creatorsMap.values()).find(c => c.handle === handle);
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
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  async getSubscriptions(subscriberId: string) {
    return Array.from(this.subscriptionsMap.values()).filter(s => s.subscriberId === subscriberId);
  }
  async createSubscription(sub: InsertSubscription) {
    const id = randomUUID();
    const subscription: Subscription = { ...sub, id };
    this.subscriptionsMap.set(id, subscription);
    return subscription;
  }
}

// ─── Seed Data ───────────────────────────────────────────────
const SEED_CREATORS = [
  {
    id: "c1", name: "Maya Chen", handle: "mayachen",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=maya",
    bio: "Building AI agents that automate DevOps workflows. Ex-Google SRE.",
    subscribers: 2847, agentCount: 6,
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
    id: "c3", name: "Sana Patel", handle: "sanapatel",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sana",
    bio: "Data pipeline architect. My agents move data so you don't have to.",
    subscribers: 1563, agentCount: 4,
    tags: ["data", "etl", "pipelines"], verified: false,
  },
  {
    id: "c4", name: "Kai Nakamura", handle: "kainakamura",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=kai",
    bio: "Security researcher turned agent builder. Pen-testing agents for the modern stack.",
    subscribers: 3890, agentCount: 5,
    tags: ["security", "pentesting", "compliance"], verified: true,
  },
  {
    id: "c5", name: "Luna Rodriguez", handle: "lunarodriguez",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=luna",
    bio: "Teaching machines to write better docs than humans. Technical writing AI.",
    subscribers: 987, agentCount: 3,
    tags: ["documentation", "writing", "api-docs"], verified: false,
  },
  {
    id: "c6", name: "Jordan Blake", handle: "jordanblake",
    avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=jordan",
    bio: "Crypto infrastructure and DeFi agent protocols. Web3 meets AI agents.",
    subscribers: 5120, agentCount: 7,
    tags: ["web3", "defi", "crypto"], verified: true,
  },
];

const SEED_AGENTS = [
  {
    id: "a1", creatorId: "c2", name: "CodeReview Pro",
    description: "AI-powered code review that catches bugs, security issues, and style violations before they hit production.",
    longDescription: "CodeReview Pro integrates with your GitHub/GitLab workflow to provide instant, thorough code reviews. It understands context across your codebase, identifies potential bugs, security vulnerabilities, performance issues, and style inconsistencies. Supports 20+ languages.",
    category: "agent", pricing: "subscription", price: 2900, currency: "USD",
    tags: ["code-review", "github", "security"], stars: 842, downloads: 12400,
    apiEndpoint: "https://api.agentforge.dev/v1/codereview", status: "active", featured: true,
  },
  {
    id: "a2", creatorId: "c1", name: "InfraBot",
    description: "Autonomous infrastructure monitoring and incident response. Detects anomalies, diagnoses issues, and auto-remediates.",
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
    id: "a4", creatorId: "c3", name: "DataSync",
    description: "Agent-to-agent data pipeline orchestrator. Define flows in YAML, let agents handle the rest.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["data", "etl", "orchestration"], stars: 456, downloads: 6200,
    apiEndpoint: "https://api.agentforge.dev/v1/datasync", status: "active", featured: false,
  },
  {
    id: "a5", creatorId: "c5", name: "DocWriter",
    description: "Generates and maintains API documentation from your codebase. Keeps docs in sync with every commit.",
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
    id: "a7", creatorId: "c2", name: "Test Generator",
    description: "Analyzes your code and generates comprehensive unit, integration, and e2e test suites automatically.",
    longDescription: null, category: "tool", pricing: "subscription", price: 1900, currency: "USD",
    tags: ["testing", "automation", "ci-cd"], stars: 567, downloads: 7800,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a8", creatorId: "c1", name: "Deploy Copilot",
    description: "Guides your CI/CD pipeline decisions. Suggests optimal deployment strategies based on your infrastructure.",
    longDescription: null, category: "content", pricing: "free", price: null, currency: "USD",
    tags: ["deployment", "ci-cd", "devops"], stars: 234, downloads: 3200,
    apiEndpoint: null, status: "beta", featured: false,
  },
  {
    id: "a9", creatorId: "c4", name: "Compliance Check",
    description: "Automated SOC2/ISO27001 compliance checker. Scans your infrastructure and generates audit-ready reports.",
    longDescription: null, category: "agent", pricing: "subscription", price: 9900, currency: "USD",
    tags: ["compliance", "soc2", "audit"], stars: 789, downloads: 5400,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a10", creatorId: "c6", name: "Token Analyzer",
    description: "Deep analysis of ERC-20 tokens: holder distribution, whale movements, smart contract audits, risk scoring.",
    longDescription: null, category: "api", pricing: "usage", price: 50, currency: "USD",
    tags: ["crypto", "analysis", "tokens"], stars: 1045, downloads: 18900,
    apiEndpoint: "https://api.agentforge.dev/v1/tokenanalyzer", status: "active", featured: false,
  },
  {
    id: "a11", creatorId: "c3", name: "Schema Drift Detector",
    description: "Watches your databases for schema changes and alerts on breaking drift before it hits production.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["database", "schema", "monitoring"], stars: 198, downloads: 2100,
    apiEndpoint: null, status: "active", featured: false,
  },
  {
    id: "a12", creatorId: "c5", name: "Changelog Bot",
    description: "Generates beautiful changelogs from git commits, PRs, and issues. Understands semantic versioning.",
    longDescription: null, category: "tool", pricing: "free", price: null, currency: "USD",
    tags: ["changelog", "git", "documentation"], stars: 412, downloads: 5600,
    apiEndpoint: null, status: "active", featured: false,
  },
];

// ─── Export ──────────────────────────────────────────────────
export const storage: IStorage = db ? new PgStorage() : new MemStorage();
