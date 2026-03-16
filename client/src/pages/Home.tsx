import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator, Post } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Star, Download, ArrowRight, Bot, Wrench, FileText, Globe,
  Shield, Code, Database, Cpu, Terminal, Zap, ChevronRight, Heart, MessageCircle, Clock
} from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

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

const pricingLabels: Record<string, string> = {
  free: "Free",
  subscription: "Subscription",
  usage: "Pay-per-use",
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

function AgentCard({ agent, creator }: { agent: Agent; creator?: Creator }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block no-underline"
      data-testid={`card-agent-${agent.id}`}
    >
      <div className="rounded-lg border border-border bg-card p-4 h-full transition-all duration-200 hover:border-primary/30 hover:shadow-md">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
              {categoryIcons[agent.category]}
            </div>
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

function CreatorRow({ creator }: { creator: Creator }) {
  return (
    <Link
      href={`/creators/${creator.id}`}
      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors no-underline"
      data-testid={`row-creator-${creator.id}`}
    >
      <img
        src={creator.avatar}
        alt={creator.name}
        className="w-10 h-10 rounded-full bg-muted"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">{creator.name}</span>
          {creator.verified && (
            <Shield size={12} className="text-primary shrink-0" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{creator.bio}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-foreground">{formatNumber(creator.subscribers)}</p>
        <p className="text-[10px] text-muted-foreground">subs</p>
      </div>
    </Link>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card">
      <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: featuredAgents, isLoading: loadingFeatured } = useQuery<Agent[]>({
    queryKey: ["/api/agents", "featured=true"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agents?featured=true");
      return res.json();
    },
  });

  const { data: allAgents, isLoading: loadingAll } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: creators, isLoading: loadingCreators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const { data: stats } = useQuery<{
    totalAgents: number;
    totalCreators: number;
    totalDownloads: number;
    totalSubscribers: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const creatorsMap = new Map(creators?.map((c) => [c.id, c]) || []);

  // Debounced global search
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isLoading: loadingSearch } = useQuery<{
    agents: Agent[];
    creators: Creator[];
    posts: Post[];
  }>({
    queryKey: ["/api/search", debouncedQuery],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(debouncedQuery)}`);
      return res.json();
    },
    enabled: debouncedQuery.length > 0,
  });

  function timeAgo(date: string | Date) {
    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  const totalResults = searchResults
    ? searchResults.agents.length + searchResults.creators.length + searchResults.posts.length
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero */}
      <section className="mb-10" data-testid="section-hero">
        <div className="flex flex-col gap-4 max-w-2xl">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold gap-1">
              <Terminal size={10} />
              For devs & agents
            </Badge>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground leading-tight">
            Subscribe to AI agents, tools, and dev content
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
            A marketplace where developers publish AI agents, automation tools, and technical content.
            Both human developers and AI agents can discover, subscribe, and consume via API.
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md mt-5">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search agents, tools, content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm bg-card border-border"
            data-testid="input-search"
          />
        </div>
      </section>

      {/* Search Results */}
      {searchQuery && debouncedQuery && (
        <section className="mb-10">
          {loadingSearch ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-foreground mb-4">
                {totalResults} result{totalResults !== 1 ? "s" : ""} for "{debouncedQuery}"
              </h2>

              {/* Matched Agents */}
              {searchResults && searchResults.agents.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Agents & Tools</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {searchResults.agents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} creator={creatorsMap.get(agent.creatorId)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Creators */}
              {searchResults && searchResults.creators.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Creators</h3>
                  <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {searchResults.creators.map((c) => <CreatorRow key={c.id} creator={c} />)}
                  </div>
                </div>
              )}

              {/* Matched Posts */}
              {searchResults && searchResults.posts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Posts</h3>
                  <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {searchResults.posts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/posts/${post.id}`}
                        className="block p-3.5 hover:bg-muted/50 transition-colors no-underline"
                      >
                        <h4 className="text-sm font-medium text-foreground mb-1 line-clamp-1">{post.title}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart size={11} /> {post.likes}</span>
                          <span className="flex items-center gap-1"><MessageCircle size={11} /> {post.commentCount}</span>
                          <span className="flex items-center gap-1 ml-auto"><Clock size={11} /> {timeAgo(post.createdAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {totalResults === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Bot size={32} className="mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No results found for "{debouncedQuery}"</p>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Stats */}
      {stats && !searchQuery && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10" data-testid="section-stats">
          <StatCard icon={<Bot size={16} />} value={stats.totalAgents.toString()} label="Agents" />
          <StatCard icon={<Users size={16} />} value={stats.totalCreators.toString()} label="Creators" />
          <StatCard icon={<Download size={16} />} value={formatNumber(stats.totalDownloads)} label="Downloads" />
          <StatCard icon={<Zap size={16} />} value={formatNumber(stats.totalSubscribers)} label="Subscribers" />
        </section>
      )}

      {!searchQuery && (
        <>
          {/* Featured Agents */}
          <section className="mb-10" data-testid="section-featured">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Featured</h2>
              <Link href="/agents" className="flex items-center gap-1 text-xs text-primary font-medium no-underline hover:underline">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            {loadingFeatured ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {featuredAgents?.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} creator={creatorsMap.get(agent.creatorId)} />
                ))}
              </div>
            )}
          </section>

          {/* Two-Column: All Agents + Creators Sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* All Agents */}
            <section className="lg:col-span-2" data-testid="section-all-agents">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">All agents & tools</h2>
              </div>
              {loadingAll ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-48 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allAgents?.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} creator={creatorsMap.get(agent.creatorId)} />
                  ))}
                </div>
              )}
            </section>

            {/* Creators Sidebar */}
            <aside data-testid="section-creators-sidebar">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Top creators</h2>
                <Link href="/creators" className="flex items-center gap-1 text-xs text-primary font-medium no-underline hover:underline">
                  All <ChevronRight size={12} />
                </Link>
              </div>
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                {loadingCreators
                  ? [1, 2, 3, 4].map((i) => (
                      <div key={i} className="p-3 flex items-center gap-3">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    ))
                  : creators
                      ?.sort((a, b) => b.subscribers - a.subscribers)
                      .map((creator) => <CreatorRow key={creator.id} creator={creator} />)}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function Users({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
