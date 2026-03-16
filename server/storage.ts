import {
  type User, type InsertUser,
  type Creator, type InsertCreator,
  type Agent, type InsertAgent,
  type Post, type InsertPost,
  type Comment, type InsertComment,
  type Subscription, type InsertSubscription,
  users, creators, agents, posts, postLikes, comments, subscriptions,
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

  constructor() {
    this.usersMap = new Map();
    this.creatorsMap = new Map();
    this.agentsMap = new Map();
    this.postsMap = new Map();
    this.postLikesMap = new Map();
    this.commentsMap = new Map();
    this.subscriptionsMap = new Map();
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
    const user: User = { ...insertUser, id, avatar: null, role: "user" };
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
    const creator: Creator = { ...insertCreator, id, subscribers: insertCreator.subscribers ?? 0, agentCount: insertCreator.agentCount ?? 0, verified: insertCreator.verified ?? false };
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
    const subscription: Subscription = { ...sub, id };
    this.subscriptionsMap.set(id, subscription);
    return subscription;
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
];

// ─── Export ──────────────────────────────────────────────────
export const storage: IStorage = db ? new PgStorage() : new MemStorage();
