import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Agent } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Copy, CheckCircle, Terminal, Box, Globe, Settings, Download, Key,
  Wifi, WifiOff, Loader2, Server, Bot, Zap, MessageCircle, Send,
} from "lucide-react";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  function copyCode() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative group">
      {label && (
        <p className="text-[11px] text-muted-foreground font-medium mb-1">{label}</p>
      )}
      <div className="bg-muted/70 border border-border rounded-md p-3 pr-10 overflow-x-auto">
        <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-all">
          {code}
        </pre>
      </div>
      <button
        className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        onClick={copyCode}
        title="Copy"
      >
        {copied ? <CheckCircle size={14} className="text-emerald-500" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function getMcpConfig(agent: Agent): string | null {
  const name = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  const isMcp = agent.tags.some((t) => t.toLowerCase().includes("mcp")) ||
    agent.description.toLowerCase().includes("mcp");
  if (!isMcp) return null;

  return JSON.stringify(
    { mcpServers: { [name]: { command: "npx", args: ["-y", name], env: {} } } },
    null,
    2,
  );
}

function getInstallCommands(agent: Agent): { npm?: string; pip?: string; docker?: string; git?: string } {
  const endpoint = agent.apiEndpoint || "";
  const cmds: { npm?: string; pip?: string; docker?: string; git?: string } = {};
  const tags = agent.tags.map((t) => t.toLowerCase()).join(" ");
  const desc = agent.description.toLowerCase();

  if (endpoint.includes("github.com")) cmds.git = `git clone ${endpoint}`;
  if (endpoint.includes("npmjs.org") || tags.includes("cli") || tags.includes("mcp")) {
    cmds.npm = `npx ${agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
  }
  if (tags.includes("python") || tags.includes("pip") || desc.includes("python")) {
    cmds.pip = `pip install ${agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
  }
  if (tags.includes("docker") || desc.includes("docker")) {
    cmds.docker = `docker run -d ${agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
  }
  return cmds;
}

type InstallTab = "setup" | "mcp" | "api" | "connect" | "deploy" | "a2a" | "ask";

export function InstallModal({
  agent,
  open,
  onClose,
}: {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<InstallTab>("setup");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [deployFormat, setDeployFormat] = useState("docker-compose");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const mcpConfig = getMcpConfig(agent);
  const installCmds = getInstallCommands(agent);
  const hasMcp = !!mcpConfig;
  const hasApi = !!agent.apiEndpoint;

  // Connectivity test
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/test-connect`);
      return res.json();
    },
  });

  // API key generation
  const keyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agent.id}/keys`, {
        name: `${agent.name} Key`,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedKey(data.key);
    },
    onError: () => {
      toast({ title: "Failed to generate key", variant: "destructive" });
    },
  });

  // Deploy config
  const { data: deployConfig, isLoading: deployLoading } = useQuery<{ config: string }>({
    queryKey: ["/api/agents", agent.id, "deploy-config", deployFormat],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${agent.id}/deploy-config?format=${deployFormat}`);
      return res.json();
    },
    enabled: activeTab === "deploy" && !!user,
  });

  // AI Chat
  const chatMutation = useMutation({
    mutationFn: async (content: string) => {
      let convId = chatConvId;
      if (!convId) {
        const convRes = await apiRequest("POST", "/api/conversations", {
          agentId: agent.id,
          userId: user?.id || null,
        });
        const conv = await convRes.json();
        convId = conv.id;
        setChatConvId(convId);
      }
      const res = await apiRequest("POST", `/api/conversations/${convId}/messages`, { content });
      return res.json();
    },
    onSuccess: (data) => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.assistantMessage.content },
      ]);
    },
    onError: () => {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that. Try again." },
      ]);
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatMutation.isPending) return;
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatInput("");
    chatMutation.mutate(msg);
  }

  const tabs: { id: InstallTab; label: string; icon: React.ReactNode }[] = [
    { id: "setup", label: "Setup", icon: <Download size={13} /> },
    ...(hasMcp ? [{ id: "mcp" as const, label: "MCP", icon: <Settings size={13} /> }] : []),
    ...(hasApi ? [{ id: "api" as const, label: "API Key", icon: <Key size={13} /> }] : []),
    ...(hasApi ? [{ id: "connect" as const, label: "Connect", icon: <Wifi size={13} /> }] : []),
    { id: "deploy", label: "Deploy", icon: <Server size={13} /> },
    { id: "a2a", label: "A2A", icon: <Bot size={13} /> },
    { id: "ask", label: "Ask AI", icon: <MessageCircle size={13} /> },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle size={18} className="text-emerald-500" />
            {agent.name} installed
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Setup Tab ── */}
        {activeTab === "setup" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{agent.name}</span> has been added to your agents.
                Manage it from your <a href="/profile" className="text-primary underline">profile</a>.
              </div>
            </div>

            {Object.keys(installCmds).length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Terminal size={13} /> Install locally
                </p>
                {installCmds.npm && <CodeBlock code={installCmds.npm} label="npm / npx" />}
                {installCmds.pip && <CodeBlock code={installCmds.pip} label="pip" />}
                {installCmds.docker && <CodeBlock code={installCmds.docker} label="Docker" />}
                {installCmds.git && <CodeBlock code={installCmds.git} label="Git" />}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Box size={13} /> Getting started
                </p>
                <p className="text-xs text-muted-foreground">
                  {agent.apiEndpoint ? (
                    <>Visit the <a href={agent.apiEndpoint} target="_blank" rel="noopener noreferrer" className="text-primary underline">project page</a> for setup instructions.</>
                  ) : (
                    "This agent is self-hosted. Check the project documentation for setup instructions."
                  )}
                </p>
              </div>
            )}

            {agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                {agent.tags.slice(0, 6).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MCP Config Tab ── */}
        {activeTab === "mcp" && mcpConfig && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Add this to your <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">claude_desktop_config.json</code> or Cursor MCP settings.
            </p>
            <CodeBlock code={mcpConfig} label="claude_desktop_config.json" />
            <div className="text-[11px] text-muted-foreground space-y-1">
              <p><span className="font-mono bg-muted px-1 rounded">macOS:</span> ~/Library/Application Support/Claude/claude_desktop_config.json</p>
              <p><span className="font-mono bg-muted px-1 rounded">Windows:</span> %APPDATA%\Claude\claude_desktop_config.json</p>
              <p><span className="font-mono bg-muted px-1 rounded">Cursor:</span> Settings &gt; MCP Servers &gt; Add Server</p>
            </div>
          </div>
        )}

        {/* ── API Key Tab ── */}
        {activeTab === "api" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Generate an API key scoped to this agent for programmatic access.
            </p>

            {generatedKey ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Key size={14} className="text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    Copy your key now — <span className="font-medium text-foreground">it won't be shown again</span>.
                  </div>
                </div>
                <CodeBlock code={generatedKey} label="Your API Key" />
                <CodeBlock
                  code={`curl -X POST "${agent.apiEndpoint || `https://api.agentforge.dev/v1/agents/${agent.id}/invoke`}" \\
  -H "Authorization: Bearer ${generatedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "your data here"}'`}
                  label="Example request"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {hasApi && <CodeBlock code={agent.apiEndpoint!} label="Endpoint" />}
                <Button
                  size="sm"
                  className="text-xs gap-1.5 w-full"
                  onClick={() => keyMutation.mutate()}
                  disabled={keyMutation.isPending}
                >
                  {keyMutation.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Key size={13} />
                  )}
                  Generate API Key
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Connect Tab ── */}
        {activeTab === "connect" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Test connectivity to this agent's live endpoint.
            </p>

            {agent.apiEndpoint && (
              <CodeBlock code={agent.apiEndpoint} label="Endpoint" />
            )}

            <Button
              size="sm"
              className="text-xs gap-1.5 w-full"
              onClick={() => connectMutation.mutate()}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Zap size={13} />
              )}
              Test Connection
            </Button>

            {connectMutation.data && (
              <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                connectMutation.data.reachable
                  ? "bg-emerald-500/5 border-emerald-500/20"
                  : "bg-red-500/5 border-red-500/20"
              }`}>
                {connectMutation.data.reachable ? (
                  <Wifi size={16} className="text-emerald-500 shrink-0" />
                ) : (
                  <WifiOff size={16} className="text-red-500 shrink-0" />
                )}
                <div className="text-xs">
                  <p className={`font-medium ${connectMutation.data.reachable ? "text-emerald-600" : "text-red-600"}`}>
                    {connectMutation.data.reachable ? "Connected" : "Unreachable"}
                  </p>
                  <p className="text-muted-foreground">
                    {connectMutation.data.latencyMs && `${connectMutation.data.latencyMs}ms`}
                    {connectMutation.data.statusCode && ` · HTTP ${connectMutation.data.statusCode}`}
                    {connectMutation.data.error && ` · ${connectMutation.data.error}`}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Deploy Tab ── */}
        {activeTab === "deploy" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Generate deployment configs to self-host this agent on your infrastructure.
            </p>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Format:</span>
              <Select value={deployFormat} onValueChange={setDeployFormat}>
                <SelectTrigger className="h-7 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docker-compose" className="text-xs">Docker Compose</SelectItem>
                  <SelectItem value="dockerfile" className="text-xs">Dockerfile</SelectItem>
                  <SelectItem value="fly-toml" className="text-xs">Fly.io (fly.toml)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {deployLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : deployConfig?.config ? (
              <div className="space-y-3">
                <CodeBlock
                  code={deployConfig.config}
                  label={deployFormat === "docker-compose" ? "docker-compose.yml" : deployFormat === "dockerfile" ? "Dockerfile" : "fly.toml"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 w-full"
                  onClick={() => {
                    const ext = deployFormat === "docker-compose" ? "yml" : deployFormat === "dockerfile" ? "Dockerfile" : "toml";
                    const filename = deployFormat === "dockerfile" ? "Dockerfile" : `${deployFormat === "docker-compose" ? "docker-compose" : "fly"}.${ext}`;
                    const blob = new Blob([deployConfig.config], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={13} />
                  Download {deployFormat === "dockerfile" ? "Dockerfile" : `config file`}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Sign in to generate deploy configs.</p>
            )}
          </div>
        )}

        {/* ── A2A Tab ── */}
        {activeTab === "a2a" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Connect your AI agent to <span className="font-medium text-foreground">{agent.name}</span> for
              agent-to-agent communication.
            </p>

            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                <Bot size={13} /> How A2A works
              </p>
              <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Your agent subscribes to this agent via the API</li>
                <li>Generate an agent API key (prefix: <code className="bg-muted px-1 rounded font-mono">af_a_</code>)</li>
                <li>Your agent authenticates with the key to make API calls</li>
                <li>Usage is tracked per-agent for billing</li>
              </ol>
            </div>

            <CodeBlock
              code={`# Subscribe your agent
curl -X POST "https://patreon.zeabur.app/api/agents/${agent.id}/subscribe-agent" \\
  -H "Authorization: Bearer YOUR_SESSION" \\
  -H "Content-Type: application/json" \\
  -d '{"sourceAgentId": "YOUR_AGENT_ID"}'

# Generate A2A API key
curl -X POST "https://patreon.zeabur.app/api/agents/${agent.id}/a2a-key" \\
  -H "Authorization: Bearer YOUR_SESSION"

# Your agent calls this agent
curl -X POST "${agent.apiEndpoint || `https://api.agentforge.dev/v1/agents/${agent.id}/invoke`}" \\
  -H "Authorization: Bearer af_a_YOUR_AGENT_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "data from your agent"}'`}
              label="A2A Integration"
            />

            <div className="text-[11px] text-muted-foreground">
              <p>
                A2A keys use the <code className="bg-muted px-1 rounded font-mono">af_a_</code> prefix
                to distinguish them from user keys (<code className="bg-muted px-1 rounded font-mono">af_k_</code>).
                Usage is billed to the agent owner's account.
              </p>
            </div>
          </div>
        )}

        {/* ── Ask AI Tab ── */}
        {activeTab === "ask" && (
          <div className="flex flex-col" style={{ height: 320 }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <MessageCircle size={24} className="mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-xs text-muted-foreground mb-3">
                    Ask anything about <span className="font-medium text-foreground">{agent.name}</span>
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {["How do I set this up?", "What are the requirements?", "Show me an example"].map((q) => (
                      <button
                        key={q}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                        onClick={() => {
                          setChatInput(q);
                          setChatMessages([{ role: "user", content: q }]);
                          chatMutation.mutate(q);
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                placeholder={`Ask about ${agent.name}...`}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                className="text-xs h-8"
                disabled={chatMutation.isPending}
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={sendChat}
                disabled={!chatInput.trim() || chatMutation.isPending}
              >
                <Send size={13} />
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            Close
          </Button>
          {agent.apiEndpoint && (
            <Button
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => window.open(agent.apiEndpoint!, "_blank")}
            >
              <Globe size={12} />
              Open Project
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
