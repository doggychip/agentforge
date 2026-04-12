import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, BookOpen, Menu, ChevronRight, Key, Zap, Globe, Lock, ArrowRight, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE_URL = "https://patreon.zeabur.app";

// ─── Reusable Components ────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="relative group mt-3">
      {label && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">{label}</div>}
      <div className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <CopyButton text={children} />
        <pre className="whitespace-pre-wrap break-all">{children}</pre>
      </div>
    </div>
  );
}

function ColoredCodeBlock({ children, label }: { children: React.ReactNode; label?: string; raw?: string }) {
  return (
    <div className="relative group mt-3">
      {label && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 font-medium">{label}</div>}
      <div className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-sm font-mono overflow-x-auto leading-relaxed">
        <pre className="whitespace-pre-wrap break-all">{children}</pre>
      </div>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    POST: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold font-mono ${colors[method] || "bg-muted text-muted-foreground"}`}>
      {method}
    </span>
  );
}

// ─── Section Definitions ────────────────────────────────────

const sections = [
  { id: "hero", label: "Overview" },
  { id: "quick-start", label: "Quick Start" },
  { id: "code-examples", label: "Code Examples" },
  { id: "endpoints", label: "Endpoints" },
  { id: "authentication", label: "Authentication" },
  { id: "streaming", label: "Streaming" },
  { id: "rate-limits", label: "Rate Limits & Pricing" },
];

// ─── Code example content ───────────────────────────────────

const curlExample = `curl -X POST ${BASE_URL}/api/agents/AGENT_ID/invoke \\
  -H "Authorization: Bearer af_k_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'`;

const pythonExample = `import requests

response = requests.post(
    "${BASE_URL}/api/agents/AGENT_ID/invoke",
    headers={"Authorization": "Bearer af_k_your_key_here"},
    json={"messages": [{"role": "user", "content": "Hello!"}]}
)
print(response.json())`;

const jsExample = `const response = await fetch(
  "${BASE_URL}/api/agents/AGENT_ID/invoke",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer af_k_your_key_here",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello!" }],
    }),
  }
);
const data = await response.json();`;

const streamingCurl = `curl -X POST ${BASE_URL}/api/agents/AGENT_ID/invoke \\
  -H "Authorization: Bearer af_k_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"messages": [{"role": "user", "content": "Hello!"}], "stream": true}'`;

const streamingJs = `const response = await fetch(
  "${BASE_URL}/api/agents/AGENT_ID/invoke",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer af_k_your_key_here",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Hello!" }],
      stream: true,
    }),
  }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}`;

// ─── Endpoints data ─────────────────────────────────────────

const endpoints = [
  { method: "POST", path: "/api/agents/:id/invoke", description: "Invoke an agent with a message", auth: true },
  { method: "GET", path: "/api/agents", description: "List all available agents", auth: false },
  { method: "GET", path: "/api/agents/:id", description: "Get details for a specific agent", auth: false },
  { method: "GET", path: "/api/agents/:id/subscription-status", description: "Check subscription status for an agent", auth: true },
];

// ─── Main Component ─────────────────────────────────────────

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState("hero");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [codeTab, setCodeTab] = useState<"curl" | "python" | "javascript">("curl");
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

  const codeTabs = [
    { key: "curl" as const, label: "cURL" },
    { key: "python" as const, label: "Python" },
    { key: "javascript" as const, label: "JavaScript" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Mobile section nav toggle */}
      <div className="md:hidden mb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs w-full justify-between"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
        >
          <span className="flex items-center gap-2">
            <Menu size={14} />
            {sections.find((s) => s.id === activeSection)?.label || "Navigation"}
          </span>
          <ChevronRight size={14} className={`transition-transform ${mobileNavOpen ? "rotate-90" : ""}`} />
        </Button>
        {mobileNavOpen && (
          <nav className="mt-2 rounded-lg border border-border bg-background p-2 space-y-0.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs transition-colors ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
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
          <nav className="sticky top-16 space-y-0.5">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">API Docs</span>
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
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-12">

          {/* ─── Hero ──────────────────────────────────────── */}
          <section id="hero" className="scroll-mt-20">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">AgentForge API</h1>
            <p className="text-lg text-muted-foreground mt-2">
              One API key. Hundreds of AI agents. Zero configuration.
            </p>
            <div className="flex flex-wrap gap-4 mt-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/10">
                <Zap size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">239 agents available</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/10">
                <Globe size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">RESTful API</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/5 border border-primary/10">
                <Zap size={16} className="text-primary" />
                <span className="text-sm font-medium text-foreground">Streaming support</span>
              </div>
            </div>
            <div className="mt-6 text-sm text-muted-foreground leading-relaxed">
              <p>
                AgentForge is a unified API gateway for AI agents. Get a single API key, pick any agent from our marketplace,
                and invoke it with a simple HTTP request. No per-agent setup, no provider juggling, no configuration sprawl.
              </p>
            </div>
            <CodeBlock label="Base URL">{`${BASE_URL}/api`}</CodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Quick Start ───────────────────────────────── */}
          <section id="quick-start" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-6">Quick Start</h2>
            <div className="space-y-6">
              {/* Step 1 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">1</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Get your API key</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Generate an API key from your{" "}
                    <a href="#/settings/api-keys" className="text-primary hover:underline font-medium">
                      API Keys settings
                    </a>.
                    Keys use the <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">af_k_</code> prefix.
                  </p>
                </div>
              </div>
              {/* Step 2 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">2</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Pick an agent</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Browse the{" "}
                    <a href="#/agents" className="text-primary hover:underline font-medium">
                      agent marketplace
                    </a>{" "}
                    and grab the agent ID you want to invoke.
                  </p>
                </div>
              </div>
              {/* Step 3 */}
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">3</div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-foreground">Make your first call</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Send a POST request to invoke the agent. Replace <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">AGENT_ID</code> and your key:
                  </p>
                  <CodeBlock>{curlExample}</CodeBlock>
                </div>
              </div>
            </div>
          </section>

          <div className="border-b border-border" />

          {/* ─── Code Examples ─────────────────────────────── */}
          <section id="code-examples" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-4">Code Examples</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Invoke any agent with your language of choice. All examples call the same endpoint.
            </p>

            {/* Tabs */}
            <div className="flex border-b border-border mb-0">
              {codeTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setCodeTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    codeTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {codeTab === "curl" && <CodeBlock>{curlExample}</CodeBlock>}
            {codeTab === "python" && <CodeBlock>{pythonExample}</CodeBlock>}
            {codeTab === "javascript" && <CodeBlock>{jsExample}</CodeBlock>}

            <ColoredCodeBlock label="Response">
              <span className="text-zinc-500">{"{"}</span>{"\n"}
              {"  "}<span className="text-sky-400">"response"</span><span className="text-zinc-500">:</span> <span className="text-emerald-400">"Hello! How can I help you today?"</span><span className="text-zinc-500">,</span>{"\n"}
              {"  "}<span className="text-sky-400">"usage"</span><span className="text-zinc-500">:</span> <span className="text-zinc-500">{"{"}</span>{"\n"}
              {"    "}<span className="text-sky-400">"tokens"</span><span className="text-zinc-500">:</span> <span className="text-amber-400">42</span>{"\n"}
              {"  "}<span className="text-zinc-500">{"}"}</span>{"\n"}
              <span className="text-zinc-500">{"}"}</span>
            </ColoredCodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Endpoints Reference ───────────────────────── */}
          <section id="endpoints" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-4">Endpoints Reference</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Method</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Endpoint</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Auth</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((ep) => (
                    <tr key={ep.path + ep.method} className="border-t border-border">
                      <td className="px-4 py-3"><MethodBadge method={ep.method} /></td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{ep.path}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{ep.description}</td>
                      <td className="px-4 py-3 text-xs">
                        {ep.auth ? (
                          <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                            <Lock size={12} /> Required
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-8 mb-2">POST /api/agents/:id/invoke</h3>
            <p className="text-sm text-muted-foreground mb-3">The core endpoint. Send messages to any agent and get a response.</p>
            <div className="rounded-lg border border-border overflow-hidden">
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
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">messages</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">array</td>
                    <td className="px-3 py-2 text-xs"><span className="text-amber-600 dark:text-amber-400">Yes</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">Array of message objects with role and content</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">stream</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">boolean</td>
                    <td className="px-3 py-2 text-xs"><span className="text-muted-foreground">No</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">Set to true for Server-Sent Events streaming</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-sm font-semibold text-foreground mt-8 mb-2">GET /api/agents</h3>
            <p className="text-sm text-muted-foreground mb-3">List all agents available on the platform. Supports optional filters.</p>
            <div className="rounded-lg border border-border overflow-hidden">
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
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">category</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">string</td>
                    <td className="px-3 py-2 text-xs"><span className="text-muted-foreground">No</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">Filter by category: agent, tool, content, api</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">search</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">string</td>
                    <td className="px-3 py-2 text-xs"><span className="text-muted-foreground">No</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">Search by name or description</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">featured</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">string</td>
                    <td className="px-3 py-2 text-xs"><span className="text-muted-foreground">No</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">Set to "true" for featured agents only</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="border-b border-border" />

          {/* ─── Authentication ────────────────────────────── */}
          <section id="authentication" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-4">Authentication</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                All agent invocations require an API key passed as a Bearer token in the <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">Authorization</code> header.
              </p>
            </div>

            <CodeBlock label="Header format">{`Authorization: Bearer af_k_your_key_here`}</CodeBlock>

            <div className="mt-6 rounded-lg border border-border p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <Key size={18} className="text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Getting your API key</h3>
                  <ol className="text-sm text-muted-foreground mt-2 space-y-1.5 list-decimal list-inside">
                    <li>Go to{" "}
                      <a href="#/settings/api-keys" className="text-primary hover:underline font-medium">
                        Settings &rarr; API Keys
                      </a>
                    </li>
                    <li>Click "Create API Key" and give it a name</li>
                    <li>Copy the key immediately — it is only shown once</li>
                  </ol>
                  <p className="text-xs text-muted-foreground mt-2">
                    All keys use the <code className="bg-muted px-1 py-0.5 rounded font-mono">af_k_</code> prefix. Keep your keys secret and never commit them to source control.
                  </p>
                </div>
              </div>
            </div>

            <CodeBlock label="Error: missing or invalid key">{`{
  "message": "Not authenticated"
}`}</CodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Streaming ─────────────────────────────────── */}
          <section id="streaming" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-4">Streaming</h2>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-3">
              <p>
                For real-time responses, add <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">"stream": true</code> to
                your request body. The response will be delivered as Server-Sent Events (SSE).
              </p>
            </div>

            <CodeBlock label="Streaming request (cURL)">{streamingCurl}</CodeBlock>
            <CodeBlock label="Streaming request (JavaScript)">{streamingJs}</CodeBlock>

            <ColoredCodeBlock label="SSE event format">
              <span className="text-sky-400">data:</span> <span className="text-zinc-300">{"{"}"token": "Hello"{"}"}</span>{"\n"}
              <span className="text-sky-400">data:</span> <span className="text-zinc-300">{"{"}"token": " world"{"}"}</span>{"\n"}
              <span className="text-sky-400">data:</span> <span className="text-zinc-300">[DONE]</span>
            </ColoredCodeBlock>
          </section>

          <div className="border-b border-border" />

          {/* ─── Rate Limits & Pricing ─────────────────────── */}
          <section id="rate-limits" className="scroll-mt-20">
            <h2 className="text-xl font-bold text-foreground mb-4">Rate Limits & Pricing</h2>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Rate Limits</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-center gap-2">
                    <ArrowRight size={12} className="text-primary flex-shrink-0" />
                    <span><strong>1,000</strong> requests per hour per API key</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <ArrowRight size={12} className="text-primary flex-shrink-0" />
                    <span><strong>10,000</strong> requests per day per API key</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  Rate limit info is returned in <code className="bg-muted px-1 py-0.5 rounded font-mono">X-RateLimit-Limit</code> and <code className="bg-muted px-1 py-0.5 rounded font-mono">X-RateLimit-Remaining</code> headers.
                </p>
              </div>

              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard size={16} className="text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Agent Pricing</h3>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li className="flex items-center gap-2">
                    <ArrowRight size={12} className="text-emerald-500 flex-shrink-0" />
                    <span><strong>Free agents</strong> — no subscription needed</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <ArrowRight size={12} className="text-amber-500 flex-shrink-0" />
                    <span><strong>Paid agents</strong> — requires active subscription</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground mt-3">
                  See the{" "}
                  <a href="#/pricing" className="text-primary hover:underline font-medium">pricing page</a>{" "}
                  for details on subscription tiers.
                </p>
              </div>
            </div>

            <CodeBlock label="429 — Rate limit exceeded">{`{
  "message": "Rate limit exceeded",
  "retryAfterSec": 1823
}`}</CodeBlock>
          </section>

        </div>
      </div>
    </div>
  );
}
