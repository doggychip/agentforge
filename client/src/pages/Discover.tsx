import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Star, Download, Bot, Wrench, FileText, Globe,
  TrendingUp, Clock, Sparkles, Heart, GitBranch,
} from "lucide-react";
import { useState, useMemo } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Bot size={14} />,
  tool: <Wrench size={14} />,
  content: <FileText size={14} />,
  api: <Globe size={14} />,
};

const categoryLabels: Record<string, string> = {
  agent: "Agent",
  tool: "Tool",
  content: "Content",
  api: "API",
};

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatPrice(price: number | null, pricing: string) {
  if (pricing === "free" || !price) return "Free";
  if (pricing === "usage") return `$${(price / 100).toFixed(2)}/call`;
  return `$${(price / 100).toFixed(0)}/mo`;
}

function RankedAgentCard({ agent, creator, rank }: { agent: Agent; creator?: Creator; rank: number }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block no-underline"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="rounded-lg border border-border bg-card p-4 h-full transition-all duration-200 hover:border-primary/30 hover:shadow-md relative">
        <div className="absolute -top-2.5 -left-2.5 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-sm">
          {rank}
        </div>

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <AgentAvatar name={agent.name} className="w-9 h-9" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                {agent.name}
              </h3>
              {creator && (
                <p className="text-xs text-muted-foreground truncate">
                  by {creator.name}
                </p>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] font-medium shrink-0 uppercase tracking-wider">
            {categoryLabels[agent.category]}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
          {agent.description}
        </p>

        <div className="flex flex-wrap gap-1 mb-3">
          {agent.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Star size={12} className="text-yellow-500" />
              {formatNumber(agent.stars)}
            </span>
            <span className="flex items-center gap-1">
              <Download size={12} />
              {formatNumber(agent.downloads)}
            </span>
          </div>
          <span className={`text-xs font-semibold ${agent.pricing === "free" ? "text-emerald-500" : "text-primary"}`}>
            {formatPrice(agent.price, agent.pricing)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function AgentGrid({
  agents,
  creators,
  isLoading,
  categoryFilter,
  extraBadge,
}: {
  agents: Agent[];
  creators: Creator[];
  isLoading: boolean;
  categoryFilter: string;
  extraBadge?: (agent: Agent) => React.ReactNode;
}) {
  const filtered = useMemo(() => {
    if (categoryFilter === "all") return agents;
    return agents.filter((a) => a.category === categoryFilter);
  }, [agents, categoryFilter]);

  const creatorMap = useMemo(() => {
    const map = new Map<string, Creator>();
    creators.forEach((c) => map.set(c.id, c));
    return map;
  }, [creators]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 rounded-lg border border-dashed border-border">
        <Bot size={32} className="mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground">No agents found in this category.</p>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-muted-foreground mb-3">
        Showing {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filtered.map((agent, i) => (
          <div key={agent.id} className="relative">
            {extraBadge && (
              <div className="absolute top-2 right-2 z-10">{extraBadge(agent)}</div>
            )}
            <RankedAgentCard
              agent={agent}
              creator={creatorMap.get(agent.creatorId)}
              rank={i + 1}
            />
          </div>
        ))}
      </div>
    </>
  );
}

const categoryFilters = [
  { value: "all", label: "All" },
  { value: "agent", label: "Agents" },
  { value: "tool", label: "Tools" },
  { value: "api", label: "APIs" },
];

export default function Discover() {
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: allAgents = [], isLoading: allLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: trendingAgents = [], isLoading: trendingLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents/trending?limit=20"],
  });

  const { data: newArrivals = [], isLoading: newLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents/new-arrivals"],
  });

  const { data: creators = [] } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const mostDownloaded = useMemo(() => {
    return [...allAgents].sort((a, b) => b.downloads - a.downloads).slice(0, 20);
  }, [allAgents]);

  const communityPicks = useMemo(() => {
    return [...allAgents].sort((a, b) => b.stars - a.stars).slice(0, 20);
  }, [allAgents]);

  const hfAgents = useMemo(() => {
    return allAgents
      .filter(
        (a) =>
          a.hfModelId ||
          a.hfSpaceUrl ||
          a.tags.some((t) => t.toLowerCase().includes("hugging"))
      )
      .slice(0, 20);
  }, [allAgents]);

  const githubAgents = useMemo(() => {
    return allAgents
      .filter((a) => a.apiEndpoint && a.apiEndpoint.includes("github.com"))
      .slice(0, 20);
  }, [allAgents]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2">Discover</h1>
        <p className="text-sm text-muted-foreground">
          Explore trending, new, and community-loved agents across the platform.
        </p>
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 mb-6">
        {categoryFilters.map((cf) => (
          <button
            key={cf.value}
            onClick={() => setCategoryFilter(cf.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cf.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cf.label}
          </button>
        ))}
      </div>

      <Tabs defaultValue="trending">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="trending" className="text-xs gap-1.5">
            <TrendingUp size={13} />
            Trending
          </TabsTrigger>
          <TabsTrigger value="new" className="text-xs gap-1.5">
            <Clock size={13} />
            New Arrivals
          </TabsTrigger>
          <TabsTrigger value="downloads" className="text-xs gap-1.5">
            <Download size={13} />
            Most Downloaded
          </TabsTrigger>
          <TabsTrigger value="community" className="text-xs gap-1.5">
            <Heart size={13} />
            Community Picks
          </TabsTrigger>
          <TabsTrigger value="huggingface" className="text-xs gap-1.5">
            <Sparkles size={13} />
            HuggingFace Models
          </TabsTrigger>
          <TabsTrigger value="github" className="text-xs gap-1.5">
            <GitBranch size={13} />
            GitHub Trending
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trending">
          <AgentGrid
            agents={trendingAgents}
            creators={creators}
            isLoading={trendingLoading}
            categoryFilter={categoryFilter}
          />
        </TabsContent>

        <TabsContent value="new">
          <AgentGrid
            agents={newArrivals}
            creators={creators}
            isLoading={newLoading}
            categoryFilter={categoryFilter}
          />
        </TabsContent>

        <TabsContent value="downloads">
          <AgentGrid
            agents={mostDownloaded}
            creators={creators}
            isLoading={allLoading}
            categoryFilter={categoryFilter}
          />
        </TabsContent>

        <TabsContent value="community">
          <AgentGrid
            agents={communityPicks}
            creators={creators}
            isLoading={allLoading}
            categoryFilter={categoryFilter}
          />
        </TabsContent>

        <TabsContent value="huggingface">
          <AgentGrid
            agents={hfAgents}
            creators={creators}
            isLoading={allLoading}
            categoryFilter={categoryFilter}
            extraBadge={() => (
              <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px]">
                HF
              </Badge>
            )}
          />
        </TabsContent>

        <TabsContent value="github">
          <AgentGrid
            agents={githubAgents}
            creators={creators}
            isLoading={allLoading}
            categoryFilter={categoryFilter}
            extraBadge={() => (
              <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20 text-[10px]">
                <GitBranch size={10} className="mr-1" />
                GitHub
              </Badge>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
