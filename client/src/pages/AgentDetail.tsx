import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Star, Download, Bot, Wrench, FileText, Globe, ArrowLeft,
  Shield, Copy, ExternalLink, CheckCircle, Code, Cpu
} from "lucide-react";

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Bot size={18} />,
  tool: <Wrench size={18} />,
  content: <FileText size={18} />,
  api: <Globe size={18} />,
};

function formatPrice(price: number | null, pricing: string) {
  if (pricing === "free" || !price) return "Free";
  if (pricing === "usage") return `$${(price / 100).toFixed(2)}/call`;
  return `$${(price / 100).toFixed(0)}/mo`;
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: agentData, isLoading } = useQuery<Agent & { creator?: Creator }>({
    queryKey: ["/api/agents", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${id}`);
      const agent = await res.json();
      // Fetch creator info
      try {
        const cRes = await apiRequest("GET", `/api/creators/${agent.creatorId}`);
        const creator = await cRes.json();
        return { ...agent, creator };
      } catch {
        return agent;
      }
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/subscriptions", {
        subscriberId: "demo-user",
        subscriberType: "human",
        agentId: id,
        plan: agentData?.pricing === "free" ? "free" : "pro",
        status: "active",
      });
    },
    onSuccess: () => {
      toast({ title: "Subscribed", description: `You're now subscribed to ${agentData?.name}` });
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <Bot size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-lg font-semibold text-foreground mb-2">Agent not found</h1>
        <Link href="/agents" className="text-sm text-primary no-underline hover:underline">
          Back to agents
        </Link>
      </div>
    );
  }

  const agent = agentData;
  const creator = (agent as any).creator as Creator | undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 no-underline" data-testid="link-back">
        <ArrowLeft size={14} /> Back to agents
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          {categoryIcons[agent.category]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-xl font-bold text-foreground">{agent.name}</h1>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-medium">
              {agent.category}
            </Badge>
            {agent.status === "beta" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium text-yellow-500 border-yellow-500/30">
                Beta
              </Badge>
            )}
          </div>

          {creator && (
            <Link
              href={`/creators/${creator.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground no-underline mb-3"
            >
              <img src={creator.avatar} alt={creator.name} className="w-5 h-5 rounded-full" />
              {creator.name}
              {creator.verified && <Shield size={12} className="text-primary" />}
            </Link>
          )}

          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            {agent.description}
          </p>

          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star size={14} className="text-yellow-500" />
              <span className="font-medium text-foreground">{formatNumber(agent.stars)}</span> stars
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Download size={14} />
              <span className="font-medium text-foreground">{formatNumber(agent.downloads)}</span> downloads
            </div>
          </div>
        </div>

        {/* Price / Subscribe Card */}
        <div className="sm:w-56 shrink-0">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {formatPrice(agent.price, agent.pricing)}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                {agent.pricing === "free" ? "Open source" : agent.pricing === "usage" ? "Per API call" : "Per month"}
              </p>
            </div>
            <Button
              className="w-full h-9 text-sm font-medium"
              onClick={() => subscribeMutation.mutate()}
              disabled={subscribeMutation.isPending}
              data-testid="button-subscribe"
            >
              {subscribeMutation.isPending ? "Subscribing..." : agent.pricing === "free" ? "Install" : "Subscribe"}
            </Button>
            {agent.apiEndpoint && (
              <Button variant="outline" className="w-full h-8 text-xs gap-1.5" data-testid="button-api-docs">
                <Code size={12} /> API Docs
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/50" data-testid="tabs-agent">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="api" className="text-xs">API</TabsTrigger>
          <TabsTrigger value="changelog" className="text-xs">Changelog</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {agent.longDescription && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.longDescription}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs font-medium">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {agent.apiEndpoint && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">API Endpoint</h3>
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted font-mono text-xs text-muted-foreground">
                <code className="flex-1 truncate">{agent.apiEndpoint}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(agent.apiEndpoint || "");
                    toast({ title: "Copied to clipboard" });
                  }}
                  data-testid="button-copy-endpoint"
                >
                  <Copy size={12} />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="api">
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Start</h3>
            <div className="rounded-md bg-muted p-4 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
              <pre>{`# Install the AgentForge CLI
npm install -g @agentforge/cli

# Subscribe to this agent
agentforge subscribe ${agent.id}

# Use in your code
import { ${agent.name.replace(/\s+/g, "")} } from "@agentforge/${agent.id}";

const result = await ${agent.name.replace(/\s+/g, "")}.run({
  input: "your data here"
});`}</pre>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="changelog">
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <Cpu size={24} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">Changelog coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
