import { useState } from "react";
import type { Agent } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, CheckCircle, Terminal, Box, Globe, Settings, Download,
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
  const endpoint = agent.apiEndpoint;
  if (!endpoint) return null;

  const name = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

  // If it's a known MCP endpoint or has mcp in tags
  const isMcp = agent.tags.some((t) => t.toLowerCase().includes("mcp")) ||
    agent.description.toLowerCase().includes("mcp");

  if (!isMcp && !endpoint) return null;

  return JSON.stringify(
    {
      mcpServers: {
        [name]: {
          command: "npx",
          args: ["-y", name],
          env: {},
        },
      },
    },
    null,
    2,
  );
}

function getInstallCommands(agent: Agent): { npm?: string; pip?: string; docker?: string; git?: string } {
  const endpoint = agent.apiEndpoint || "";
  const cmds: { npm?: string; pip?: string; docker?: string; git?: string } = {};

  // Detect package manager from endpoint/tags
  const tags = agent.tags.map((t) => t.toLowerCase()).join(" ");
  const desc = agent.description.toLowerCase();
  const name = agent.name.toLowerCase();

  if (endpoint.includes("github.com")) {
    cmds.git = `git clone ${endpoint}`;
  }

  if (endpoint.includes("npmjs.org") || endpoint.includes("npm") || tags.includes("cli") || tags.includes("mcp")) {
    const pkg = agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    cmds.npm = `npx ${pkg}`;
  }

  if (tags.includes("python") || tags.includes("pip") || desc.includes("python")) {
    const pkg = agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    cmds.pip = `pip install ${pkg}`;
  }

  if (tags.includes("docker") || desc.includes("docker")) {
    const pkg = agent.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    cmds.docker = `docker run -d ${pkg}`;
  }

  return cmds;
}

type InstallTab = "setup" | "mcp" | "api";

export function InstallModal({
  agent,
  open,
  onClose,
}: {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<InstallTab>("setup");

  const mcpConfig = getMcpConfig(agent);
  const installCmds = getInstallCommands(agent);
  const hasMcp = !!mcpConfig;
  const hasApi = !!agent.apiEndpoint;
  const hasInstallCmds = Object.keys(installCmds).length > 0;

  const tabs: { id: InstallTab; label: string; icon: React.ReactNode }[] = [
    { id: "setup", label: "Setup", icon: <Download size={13} /> },
    ...(hasMcp ? [{ id: "mcp" as const, label: "MCP Config", icon: <Settings size={13} /> }] : []),
    ...(hasApi ? [{ id: "api" as const, label: "API", icon: <Globe size={13} /> }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckCircle size={18} className="text-emerald-500" />
            {agent.name} installed
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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

        {/* Setup Tab */}
        {activeTab === "setup" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{agent.name}</span> has been added to your agents.
                You can manage it from your{" "}
                <a href="/profile" className="text-primary underline">profile</a>.
              </div>
            </div>

            {hasInstallCmds ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Terminal size={13} />
                  Install locally
                </p>
                {installCmds.npm && <CodeBlock code={installCmds.npm} label="npm / npx" />}
                {installCmds.pip && <CodeBlock code={installCmds.pip} label="pip" />}
                {installCmds.docker && <CodeBlock code={installCmds.docker} label="Docker" />}
                {installCmds.git && <CodeBlock code={installCmds.git} label="Git" />}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Box size={13} />
                  Getting started
                </p>
                <div className="text-xs text-muted-foreground space-y-2">
                  {agent.apiEndpoint ? (
                    <p>
                      Visit the{" "}
                      <a
                        href={agent.apiEndpoint}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        project page
                      </a>{" "}
                      for setup instructions.
                    </p>
                  ) : (
                    <p>This agent is self-hosted. Check the project documentation for setup instructions.</p>
                  )}
                </div>
              </div>
            )}

            {agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                {agent.tags.slice(0, 6).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MCP Config Tab */}
        {activeTab === "mcp" && mcpConfig && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Add this to your <code className="px-1 py-0.5 rounded bg-muted font-mono text-[11px]">claude_desktop_config.json</code> or
              Cursor MCP settings to connect this agent.
            </div>

            <CodeBlock
              code={mcpConfig}
              label="claude_desktop_config.json"
            />

            <div className="space-y-2">
              <p className="text-[11px] font-medium text-foreground">Config file locations:</p>
              <div className="text-[11px] text-muted-foreground space-y-1">
                <p><span className="font-mono bg-muted px-1 rounded">macOS:</span> ~/Library/Application Support/Claude/claude_desktop_config.json</p>
                <p><span className="font-mono bg-muted px-1 rounded">Windows:</span> %APPDATA%\Claude\claude_desktop_config.json</p>
                <p><span className="font-mono bg-muted px-1 rounded">Cursor:</span> Settings &gt; MCP Servers &gt; Add Server</p>
              </div>
            </div>
          </div>
        )}

        {/* API Tab */}
        {activeTab === "api" && hasApi && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Connect to this agent's API endpoint directly.
            </div>

            <CodeBlock
              code={agent.apiEndpoint!}
              label="Endpoint"
            />

            <CodeBlock
              code={`curl -X GET "${agent.apiEndpoint}" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
              label="Example request"
            />

            <div className="text-[11px] text-muted-foreground">
              Replace <code className="px-1 py-0.5 rounded bg-muted font-mono">YOUR_API_KEY</code> with
              your API key from the agent provider.
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
