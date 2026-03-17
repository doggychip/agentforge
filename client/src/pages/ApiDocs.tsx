import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, BookOpen, ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE_URL = "https://patreon.zeabur.app/api";

// ─── Reusable Components ────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    PUT: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    PATCH: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold font-mono ${colors[method] || "bg-muted text-muted-foreground"}`}>
      {method}
    </span>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }

  return (
    <div className="relative group mt-3">
      {label && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">{label}</div>}
      <div className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <button
          onClick={copy}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
          data-testid="button-copy-code"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <pre className="whitespace-pre-wrap break-all">{children}</pre>
      </div>
    </div>
  );
}

function ParamTable({ params }: { params: { name: string; type: string; required: boolean; description: string }[] }) {
  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Parameter</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Required</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p) => (
            <tr key={p.name} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs text-foreground">{p.name}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{p.type}</td>
              <td className="px-3 py-2 text-xs">{p.required ? <span className="text-amber-600 dark:text-amber-400">Yes</span> : <span className="text-muted-foreground">No</span>}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointBlock({
  method,
  path,
  description,
  auth,
  params,
  responseExample,
  curlExample,
}: {
  method: string;
  path: string;
  description: string;
  auth?: boolean;
  params?: { name: string; type: string; required: boolean; description: string }[];
  responseExample?: string;
  curlExample?: string;
}) {
  return (
    <div className="py-4 first:pt-0">
      <div className="flex items-center gap-2 flex-wrap">
        <MethodBadge method={method} />
        <code className="text-sm font-mono font-semibold text-foreground">{path}</code>
        {auth && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">Auth Required</span>}
      </div>
      <p className="text-sm text-muted-foreground mt-1.5">{description}</p>
      {params && params.length > 0 && <ParamTable params={params} />}
      {curlExample && <CodeBlock label="Example Request">{curlExample}</CodeBlock>}
      {responseExample && <CodeBlock label="Response">{responseExample}</CodeBlock>}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-bold text-foreground mb-3">{children}</h2>;
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground mt-6 mb-2">{children}</h3>;
}

function Prose({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>;
}

// ─── Section Definitions ────────────────────────────────────

const sections = [
  { id: "introduction", label: "Introduction" },
  { id: "authentication", label: "Authentication" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "agents", label: "Agents" },
  { id: "creators", label: "Creators" },
  { id: "posts", label: "Posts & Feed" },
  { id: "search", label: "Search" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "reviews", label: "Reviews" },
  { id: "api-keys", label: "API Keys" },
  { id: "stats", label: "Platform Stats" },
];

// ─── Main Component ─────────────────────────────────────────

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState("introduction");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    const sectionEls = sections.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    sectionEls.forEach((el) => observerRef.current!.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Mobile section nav toggle */}
      <div className="md:hidden mb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs w-full justify-between"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          data-testid="button-mobile-docs-nav"
        >
          <span className="flex items-center gap-2">
            <Menu size={14} />
            {sections.find((s) => s.id === activeSection)?.label || "Navigation"}
          </span>
          <ChevronRight size={14} className={`transition-transform ${mobileNavOpen ? "rotate-90" : ""}`} />
        </Button>
        {mobileNavOpen && (
          <nav className="mt-2 rounded-lg border border-border bg-background p-2 space-y-0.5" data-testid="mobile-docs-nav">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`mobile-nav-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <aside className="hidden md:block w-48 shrink-0">
          <nav className="sticky top-16 space-y-0.5" data-testid="docs-sidebar">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">API Reference</span>
            </div>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                data-testid={`nav-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-10">

          {/* ─── Introduction ──────────────────────────────── */}
          <section id="introduction" className="scroll-mt-20">
            <SectionHeading>Introduction</SectionHeading>
            <Prose>
              <p>
                The AgentForge API provides programmatic access to the platform's marketplace of AI agents, creators, and content.
                All endpoints are available at:
              </p>
            </Prose>
            <CodeBlock>{BASE_URL}</CodeBlock>
            <Prose>
              <p className="mt-3">All responses are JSON. Dates use ISO 8601 format. Errors return a JSON object with a <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">message</code> field:</p>
            </Prose>
            <CodeBlock label="Error Response">{`{
  "message": "Not authenticated"
}`}</CodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Authentication ────────────────────────────── */}
          <section id="authentication" className="scroll-mt-20">
            <SectionHeading>Authentication</SectionHeading>
            <Prose>
              <p>AgentForge supports two authentication methods:</p>
            </Prose>

            <SubHeading>1. Session Authentication (Web UI)</SubHeading>
            <Prose>
              <p>Cookie-based sessions for browser access. Register or login to obtain a session:</p>
            </Prose>
            <EndpointBlock
              method="POST"
              path="/api/auth/register"
              description="Create a new account. Sets a session cookie on success."
              params={[
                { name: "username", type: "string", required: true, description: "3-30 chars, alphanumeric + hyphens/underscores" },
                { name: "email", type: "string", required: true, description: "Valid email address" },
                { name: "password", type: "string", required: true, description: "Minimum 8 characters" },
                { name: "displayName", type: "string", required: true, description: "Display name (1-100 chars)" },
              ]}
            />
            <EndpointBlock
              method="POST"
              path="/api/auth/login"
              description="Login with email and password. Sets a session cookie on success."
              params={[
                { name: "email", type: "string", required: true, description: "Registered email" },
                { name: "password", type: "string", required: true, description: "Account password" },
              ]}
            />

            <SubHeading>2. API Key Authentication (Programmatic Access)</SubHeading>
            <Prose>
              <p>
                For agent-to-agent and programmatic access, generate API keys from the{" "}
                <span className="font-medium text-foreground">API Keys</span> settings page.
                Pass the key as a Bearer token:
              </p>
            </Prose>
            <CodeBlock label="Example">{`curl -H "Authorization: Bearer af_k_your_key_here" \\
  ${BASE_URL}/agents`}</CodeBlock>
            <Prose>
              <p className="mt-2">API keys work on all public endpoints and authenticated endpoints like subscription-status checks.</p>
            </Prose>
          </section>

          <div className="border-b border-border" />

          {/* ─── Rate Limits ───────────────────────────────── */}
          <section id="rate-limits" className="scroll-mt-20">
            <SectionHeading>Rate Limits</SectionHeading>
            <Prose>
              <p>API key requests are rate-limited per key. Default limits:</p>
              <ul className="list-disc list-inside space-y-1 mt-2">
                <li><strong>1,000</strong> requests per hour</li>
                <li><strong>10,000</strong> requests per day</li>
              </ul>
              <p className="mt-2">Limits are configurable per key via the API Keys management page or the PATCH endpoint.</p>
              <p className="mt-2">Rate limit information is included in response headers:</p>
            </Prose>
            <CodeBlock>{`X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 997`}</CodeBlock>
            <Prose>
              <p className="mt-3">When limits are exceeded, the API returns a <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">429</code> status with a <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">Retry-After</code> header:</p>
            </Prose>
            <CodeBlock label="429 Response">{`{
  "message": "Rate limit exceeded",
  "retryAfterSec": 1823
}`}</CodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Agents ────────────────────────────────────── */}
          <section id="agents" className="scroll-mt-20">
            <SectionHeading>Agents</SectionHeading>
            <Prose>
              <p>Browse and query the marketplace of AI agents, tools, and content.</p>
            </Prose>

            <SubHeading>Agent Object</SubHeading>
            <CodeBlock>{`{
  "id": "a1",
  "creatorId": "c2",
  "name": "CodeReview Pro",
  "description": "AI-powered code review...",
  "longDescription": null,
  "category": "agent",
  "pricing": "subscription",
  "price": 2900,
  "currency": "USD",
  "tags": ["code-review", "github"],
  "stars": 842,
  "downloads": 12400,
  "apiEndpoint": null,
  "status": "active",
  "featured": true
}`}</CodeBlock>

            <EndpointBlock
              method="GET"
              path="/api/agents"
              description="List all agents. Supports filtering by category, search query, featured status, or creator."
              params={[
                { name: "category", type: "string", required: false, description: 'Filter by category: "agent", "tool", "content", "api"' },
                { name: "search", type: "string", required: false, description: "Search agents by name or description" },
                { name: "featured", type: "string", required: false, description: 'Set to "true" to get featured agents only' },
                { name: "creator", type: "string", required: false, description: "Filter by creator ID" },
              ]}
              curlExample={`curl ${BASE_URL}/agents?category=agent`}
              responseExample={`[
  {
    "id": "a1",
    "creatorId": "c2",
    "name": "CodeReview Pro",
    "description": "AI-powered code review...",
    "category": "agent",
    "pricing": "subscription",
    "price": 2900,
    "tags": ["code-review", "github"],
    "stars": 842,
    "downloads": 12400,
    "status": "active",
    "featured": true
  }
]`}
            />

            <EndpointBlock
              method="GET"
              path="/api/agents/:id"
              description="Get detailed information about a specific agent."
              curlExample={`curl ${BASE_URL}/agents/a1`}
              responseExample={`{
  "id": "a1",
  "creatorId": "c2",
  "name": "CodeReview Pro",
  "description": "AI-powered code review...",
  "category": "agent",
  "pricing": "subscription",
  "price": 2900,
  "currency": "USD",
  "tags": ["code-review", "github"],
  "stars": 842,
  "downloads": 12400,
  "apiEndpoint": "https://api.agentforge.dev/v1/codereview",
  "status": "active",
  "featured": true
}`}
            />

            <EndpointBlock
              method="GET"
              path="/api/agents/:id/subscription-status"
              description="Check if the authenticated user has an active subscription to this agent."
              auth
              curlExample={`curl -H "Authorization: Bearer af_k_..." \\
  ${BASE_URL}/agents/a1/subscription-status`}
              responseExample={`{
  "subscribed": true,
  "subscription": {
    "id": "sub_123",
    "plan": "pro",
    "status": "active"
  }
}`}
            />

            <EndpointBlock
              method="GET"
              path="/api/agents/:id/reviews"
              description="Get reviews for an agent, including average rating and count."
              curlExample={`curl ${BASE_URL}/agents/a1/reviews`}
              responseExample={`{
  "reviews": [
    {
      "id": "r1",
      "agentId": "a1",
      "userId": "u1",
      "authorName": "Jane Doe",
      "rating": 5,
      "body": "Excellent code review agent!",
      "createdAt": "2026-03-15T08:00:00.000Z"
    }
  ],
  "avg": 4.5,
  "count": 12
}`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Creators ──────────────────────────────────── */}
          <section id="creators" className="scroll-mt-20">
            <SectionHeading>Creators</SectionHeading>
            <Prose>
              <p>Browse creator profiles and their published agents and posts.</p>
            </Prose>

            <SubHeading>Creator Object</SubHeading>
            <CodeBlock>{`{
  "id": "c1",
  "name": "陳明智 Ming Chen",
  "handle": "mingchen",
  "avatar": "https://api.dicebear.com/9.x/notionists/svg?seed=ming",
  "bio": "Building AI agents for DevOps automation",
  "subscribers": 3800,
  "agentCount": 6,
  "tags": ["devops", "automation"],
  "verified": true
}`}</CodeBlock>

            <EndpointBlock
              method="GET"
              path="/api/creators"
              description="List all creators. Optionally filter to featured (verified) creators only."
              params={[
                { name: "featured", type: "string", required: false, description: 'Set to "true" to get verified/featured creators' },
              ]}
              curlExample={`curl ${BASE_URL}/creators?featured=true`}
              responseExample={`[
  {
    "id": "c1",
    "name": "陳明智 Ming Chen",
    "handle": "mingchen",
    "bio": "Building AI agents for DevOps automation",
    "subscribers": 3800,
    "agentCount": 6,
    "tags": ["devops", "automation"],
    "verified": true
  }
]`}
            />

            <EndpointBlock
              method="GET"
              path="/api/creators/:id"
              description="Get creator details including their agents and posts. If authenticated, includes subscription status."
              curlExample={`curl ${BASE_URL}/creators/c1`}
              responseExample={`{
  "id": "c1",
  "name": "陳明智 Ming Chen",
  "handle": "mingchen",
  "bio": "Building AI agents for DevOps automation",
  "subscribers": 3800,
  "agentCount": 6,
  "verified": true,
  "agents": [ ... ],
  "posts": [ ... ],
  "isSubscribed": false
}`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Posts & Feed ──────────────────────────────── */}
          <section id="posts" className="scroll-mt-20">
            <SectionHeading>Posts & Feed</SectionHeading>
            <Prose>
              <p>Access creator posts, articles, and community content.</p>
            </Prose>

            <EndpointBlock
              method="GET"
              path="/api/posts"
              description="List posts. Optionally filter by creator or set a limit."
              params={[
                { name: "creator", type: "string", required: false, description: "Filter by creator ID" },
                { name: "limit", type: "number", required: false, description: "Max posts to return (default 50)" },
              ]}
              curlExample={`curl ${BASE_URL}/posts?limit=10`}
              responseExample={`[
  {
    "id": "p1",
    "creatorId": "c8",
    "title": "如何用 AI Agent 處理中文 NLP 的五大挑戰",
    "body": "# ...",
    "excerpt": "中文自然語言處理一直是 AI 領域的難題...",
    "visibility": "public",
    "tags": ["nlp", "chinese"],
    "likes": 342,
    "commentCount": 28,
    "createdAt": "2026-03-15T08:00:00.000Z"
  }
]`}
            />

            <EndpointBlock
              method="GET"
              path="/api/posts/:id"
              description="Get a single post with its details, like status, and creator info."
              curlExample={`curl ${BASE_URL}/posts/p1`}
              responseExample={`{
  "id": "p1",
  "creatorId": "c8",
  "title": "如何用 AI Agent 處理中文 NLP 的五大挑戰",
  "body": "# Full markdown content...",
  "visibility": "public",
  "likes": 342,
  "hasLiked": false,
  "creator": { "id": "c8", "name": "張偉 Wei Zhang", "handle": "weizhang" }
}`}
            />

            <EndpointBlock
              method="GET"
              path="/api/posts/:id/comments"
              description="Get comments for a post."
              curlExample={`curl ${BASE_URL}/posts/p1/comments`}
              responseExample={`[
  {
    "id": "cm1",
    "postId": "p1",
    "userId": "u1",
    "authorName": "Alice",
    "body": "Great article!",
    "createdAt": "2026-03-16T10:00:00.000Z"
  }
]`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Search ────────────────────────────────────── */}
          <section id="search" className="scroll-mt-20">
            <SectionHeading>Search</SectionHeading>
            <Prose>
              <p>Search across agents, creators, and posts with a single query.</p>
            </Prose>

            <EndpointBlock
              method="GET"
              path="/api/search?q=..."
              description="Global search across all entity types. Returns matching agents, creators, and posts."
              params={[
                { name: "q", type: "string", required: true, description: "Search query" },
              ]}
              curlExample={`curl "${BASE_URL}/search?q=devops"`}
              responseExample={`{
  "agents": [
    { "id": "a2", "name": "InfraBot", "description": "..." }
  ],
  "creators": [
    { "id": "c1", "name": "陳明智 Ming Chen", "handle": "mingchen" }
  ],
  "posts": [
    { "id": "p3", "title": "從 Google SRE 到 AI Agent 創業" }
  ]
}`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Subscriptions ─────────────────────────────── */}
          <section id="subscriptions" className="scroll-mt-20">
            <SectionHeading>Subscriptions</SectionHeading>
            <Prose>
              <p>Manage agent subscriptions and paid plans via Stripe.</p>
            </Prose>

            <EndpointBlock
              method="GET"
              path="/api/agents/:id/subscription-status"
              description="Check if the current user has an active subscription to an agent."
              auth
              curlExample={`curl -H "Authorization: Bearer af_k_..." \\
  ${BASE_URL}/agents/a1/subscription-status`}
              responseExample={`{
  "subscribed": false,
  "subscription": null
}`}
            />

            <EndpointBlock
              method="POST"
              path="/api/stripe/checkout"
              description="Create a Stripe checkout session for a paid agent subscription. Returns a URL to redirect the user to."
              auth
              params={[
                { name: "agentId", type: "string", required: true, description: "The agent to subscribe to" },
              ]}
              curlExample={`curl -X POST -H "Content-Type: application/json" \\
  -H "Authorization: Bearer af_k_..." \\
  -d '{"agentId": "a1"}' \\
  ${BASE_URL}/stripe/checkout`}
              responseExample={`{
  "url": "https://checkout.stripe.com/c/pay/...",
  "sessionId": "cs_live_..."
}`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Reviews ───────────────────────────────────── */}
          <section id="reviews" className="scroll-mt-20">
            <SectionHeading>Reviews</SectionHeading>
            <Prose>
              <p>Submit and read reviews for agents.</p>
            </Prose>

            <EndpointBlock
              method="POST"
              path="/api/agents/:id/reviews"
              description="Submit a review for an agent. Requires authentication."
              auth
              params={[
                { name: "rating", type: "number", required: true, description: "Rating from 1-5" },
                { name: "body", type: "string", required: true, description: "Review text" },
              ]}
              curlExample={`curl -X POST -H "Content-Type: application/json" \\
  -H "Authorization: Bearer af_k_..." \\
  -d '{"rating": 5, "body": "Great agent!"}' \\
  ${BASE_URL}/agents/a1/reviews`}
              responseExample={`{
  "id": "r_new",
  "agentId": "a1",
  "userId": "u1",
  "authorName": "Jane Doe",
  "rating": 5,
  "body": "Great agent!",
  "createdAt": "2026-03-17T12:00:00.000Z"
}`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── API Keys ──────────────────────────────────── */}
          <section id="api-keys" className="scroll-mt-20">
            <SectionHeading>API Keys</SectionHeading>
            <Prose>
              <p>Manage API keys for programmatic access. All endpoints require session authentication.</p>
            </Prose>

            <EndpointBlock
              method="GET"
              path="/api/keys"
              description="List all API keys for the authenticated user. Key hashes are never returned."
              auth
              curlExample={`curl -b cookies.txt ${BASE_URL}/keys`}
              responseExample={`[
  {
    "id": "key_123",
    "userId": "u1",
    "name": "Production Bot",
    "keyPrefix": "af_k_abc123",
    "lastUsedAt": "2026-03-17T10:00:00.000Z",
    "createdAt": "2026-03-01T00:00:00.000Z",
    "revoked": false,
    "rateLimit": 1000,
    "rateLimitDay": 10000
  }
]`}
            />

            <EndpointBlock
              method="POST"
              path="/api/keys"
              description="Generate a new API key. The full key is returned only once in the response."
              auth
              params={[
                { name: "name", type: "string", required: true, description: "A descriptive name for the key" },
              ]}
              curlExample={`curl -X POST -H "Content-Type: application/json" \\
  -b cookies.txt \\
  -d '{"name": "My Agent Bot"}' \\
  ${BASE_URL}/keys`}
              responseExample={`{
  "id": "key_456",
  "name": "My Agent Bot",
  "keyPrefix": "af_k_def456",
  "key": "af_k_def456789abcdef0123456789abcdef",
  "createdAt": "2026-03-17T12:00:00.000Z",
  "revoked": false,
  "rateLimit": 1000,
  "rateLimitDay": 10000
}`}
            />

            <EndpointBlock
              method="DELETE"
              path="/api/keys/:id"
              description="Revoke an API key. The key will immediately stop working."
              auth
              curlExample={`curl -X DELETE -b cookies.txt \\
  ${BASE_URL}/keys/key_123`}
              responseExample={`{ "success": true }`}
            />

            <EndpointBlock
              method="GET"
              path="/api/keys/usage/stats"
              description="Get aggregate usage statistics for all of the user's API keys."
              auth
              curlExample={`curl -b cookies.txt ${BASE_URL}/keys/usage/stats`}
              responseExample={`{
  "today": 42,
  "thisWeek": 312,
  "thisMonth": 1847,
  "byKey": [
    { "keyId": "key_123", "keyName": "Production Bot", "keyPrefix": "af_k_abc123", "count": 1200 }
  ],
  "dailyCounts": [
    { "date": "2026-03-15", "count": 156 },
    { "date": "2026-03-16", "count": 89 },
    { "date": "2026-03-17", "count": 42 }
  ]
}`}
            />

            <EndpointBlock
              method="PATCH"
              path="/api/keys/:id/rate-limit"
              description="Update the hourly and daily rate limits for a specific API key."
              auth
              params={[
                { name: "rateLimit", type: "number", required: false, description: "Requests per hour (10-100,000)" },
                { name: "rateLimitDay", type: "number", required: false, description: "Requests per day (100-1,000,000)" },
              ]}
              curlExample={`curl -X PATCH -H "Content-Type: application/json" \\
  -b cookies.txt \\
  -d '{"rateLimit": 2000, "rateLimitDay": 20000}' \\
  ${BASE_URL}/keys/key_123/rate-limit`}
              responseExample={`{ "success": true }`}
            />
          </section>

          <div className="border-b border-border" />

          {/* ─── Platform Stats ────────────────────────────── */}
          <section id="stats" className="scroll-mt-20">
            <SectionHeading>Platform Stats</SectionHeading>
            <Prose>
              <p>Get platform-wide statistics. No authentication required.</p>
            </Prose>

            <EndpointBlock
              method="GET"
              path="/api/stats"
              description="Returns aggregate platform statistics including total agents, creators, downloads, and subscribers."
              curlExample={`curl ${BASE_URL}/stats`}
              responseExample={`{
  "totalAgents": 30,
  "totalCreators": 25,
  "totalDownloads": 475700,
  "totalSubscribers": 110300
}`}
            />
          </section>

        </div>
      </div>
    </div>
  );
}
