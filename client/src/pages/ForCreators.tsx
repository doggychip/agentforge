import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bot, Wrench, Globe, ArrowRight, Star, Download,
  Search, TrendingUp, Users, Sparkles,
} from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { apiRequest } from "@/lib/queryClient";

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/* ------------------------------------------------------------------ */
/*  Hero + Search                                                      */
/* ------------------------------------------------------------------ */

function HeroSearch({ onSearch }: { onSearch: (q: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ agents: Agent[]; creators: Creator[] } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setShowDropdown(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults({ agents: data.agents || [], creators: data.creators || [] });
        setShowDropdown(true);
      } catch {
        setResults(null);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      setShowDropdown(false);
      onSearch(query.trim());
    }
  }

  const hasResults = results && (results.agents.length > 0 || results.creators.length > 0);

  return (
    <section className="relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10 pointer-events-none overflow-hidden" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none overflow-hidden" />

      <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4 leading-tight">
          The AI agent platform<br />
          <span className="text-primary">for builders.</span>
        </h1>

        <p className="text-base text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          Discover, share, and deploy AI agents, tools, and APIs.
          Built by creators worldwide.
        </p>

        <div ref={wrapperRef} className="max-w-lg mx-auto relative mb-6">
          <form onSubmit={handleSubmit}>
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10" />
            <Input
              type="text"
              placeholder="Search agents, tools, creators..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (hasResults) setShowDropdown(true); }}
              className="pl-10 pr-4 h-12 text-sm rounded-full border-border/60 bg-background shadow-sm focus-visible:ring-primary/30"
            />
          </form>

          {showDropdown && hasResults && (
            <div className="absolute left-0 right-0 top-14 z-50 bg-background border border-border rounded-xl shadow-xl overflow-hidden max-h-[400px] overflow-y-auto text-left">
              {results.agents.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                    Agents & Tools
                  </div>
                  {results.agents.slice(0, 6).map((agent) => (
                    <Link
                      key={agent.id}
                      href={`/agents/${agent.id}`}
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors no-underline"
                    >
                      <AgentAvatar name={agent.name} className="w-7 h-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate block">{agent.name}</span>
                        <span className="text-xs text-muted-foreground truncate block">{agent.description}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0 uppercase">
                        {agent.category}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
              {results.creators.length > 0 && (
                <div>
                  <div className="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                    Creators
                  </div>
                  {results.creators.slice(0, 4).map((creator) => (
                    <Link
                      key={creator.id}
                      href={`/creators/${creator.id}`}
                      onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors no-underline"
                    >
                      <img src={creator.avatar} alt={creator.name} className="w-7 h-7 rounded-full bg-muted shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate block">{creator.name}</span>
                        <span className="text-xs text-muted-foreground truncate block">@{creator.handle}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatNumber(creator.subscribers)} subs</span>
                    </Link>
                  ))}
                </div>
              )}
              <Link
                href={`/agents?q=${encodeURIComponent(query)}`}
                onClick={() => setShowDropdown(false)}
                className="block px-3 py-2.5 text-xs text-primary font-medium hover:bg-muted/50 transition-colors no-underline text-center border-t border-border"
              >
                View all results for "{query}" →
              </Link>
            </div>
          )}

          {showDropdown && results && !hasResults && query.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-14 z-50 bg-background border border-border rounded-xl shadow-xl p-6 text-center">
              <p className="text-sm text-muted-foreground">No results for "{query}"</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link href="/discover" className="no-underline">
            <Button variant="default" size="lg" className="gap-2 font-medium rounded-full">
              <Sparkles size={16} /> Explore Agents
            </Button>
          </Link>
          <Link href="/become-creator" className="no-underline">
            <Button variant="outline" size="lg" className="gap-2 font-medium rounded-full">
              Become a Creator <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats bar                                                          */
/* ------------------------------------------------------------------ */

function StatsBar() {
  const { data: stats } = useQuery<{
    totalAgents: number;
    totalCreators: number;
    totalDownloads: number;
    totalSubscribers: number;
    categories: Record<string, number>;
  }>({ queryKey: ["/api/stats"] });

  if (!stats) return null;

  const items = [
    { label: "Agents", value: formatNumber(stats.totalAgents), icon: <Bot size={15} /> },
    { label: "Creators", value: formatNumber(stats.totalCreators), icon: <Users size={15} /> },
    { label: "Downloads", value: formatNumber(stats.totalDownloads), icon: <Download size={15} /> },
  ];

  return (
    <div className="border-y border-border/40 bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-center gap-8 flex-wrap">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{item.icon}</span>
            <span className="font-bold text-foreground">{item.value}</span>
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Trending section (3-column: Agents / Tools / APIs)                 */
/* ------------------------------------------------------------------ */

const categoryConfig = [
  { key: "agent", label: "Agents", icon: <Bot size={18} /> },
  { key: "tool", label: "Tools", icon: <Wrench size={18} /> },
  { key: "api", label: "APIs", icon: <Globe size={18} /> },
] as const;

function TrendingItem({ agent, creator }: { agent: Agent; creator?: Creator }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors no-underline border border-transparent hover:border-border/60"
    >
      <AgentAvatar name={agent.name} className="w-9 h-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {agent.name}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {agent.description}
        </p>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Download size={11} /> {formatNumber(agent.downloads)}
          </span>
          <span className="flex items-center gap-1">
            <Star size={11} className="text-yellow-500" /> {formatNumber(agent.stars)}
          </span>
          {creator && (
            <span className="truncate">by {creator.name}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function TrendingSection() {
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: creators = [] } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const creatorMap = useMemo(() => {
    const map = new Map<string, Creator>();
    creators.forEach((c) => map.set(c.id, c));
    return map;
  }, [creators]);

  const columns = useMemo(() => {
    return categoryConfig.map(({ key }) => {
      return agents
        .filter((a) => a.category === key)
        .sort((a, b) => b.stars - a.stars)
        .slice(0, 6);
    });
  }, [agents]);

  if (isLoading) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center mb-8">
        <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2">
          <TrendingUp size={20} className="text-primary" />
          Trending this week
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {categoryConfig.map((cat, i) => (
          <div key={cat.key}>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-primary">{cat.icon}</span>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">{cat.label}</h3>
            </div>
            <div className="space-y-1">
              {columns[i].map((agent) => (
                <TrendingItem
                  key={agent.id}
                  agent={agent}
                  creator={creatorMap.get(agent.creatorId)}
                />
              ))}
              {columns[i].length === 0 && (
                <p className="text-xs text-muted-foreground p-3">No {cat.label.toLowerCase()} yet</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 mt-10 flex-wrap">
        {categoryConfig.map((cat) => (
          <Link key={cat.key} href="/agents" className="no-underline">
            <Button variant="outline" className="gap-2 text-sm font-medium rounded-full">
              {cat.icon} Browse {cat.label}
            </Button>
          </Link>
        ))}
        <Link href="/creators" className="no-underline">
          <Button variant="outline" className="gap-2 text-sm font-medium rounded-full">
            <Users size={16} /> Browse Creators
          </Button>
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Featured Creators strip                                            */
/* ------------------------------------------------------------------ */

function FeaturedCreators() {
  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const displayed = (creators || [])
    .sort((a, b) => b.subscribers - a.subscribers)
    .slice(0, 8);

  if (displayed.length === 0) return null;

  return (
    <section className="border-t border-border/40 bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider text-center mb-6">
          Top Creators
        </h2>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {displayed.map((creator) => (
            <Link
              key={creator.id}
              href={`/creators/${creator.id}`}
              className="group no-underline flex flex-col items-center gap-2 w-20"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-border/60 group-hover:border-primary/50 transition-colors">
                <img
                  src={creator.avatar}
                  alt={creator.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground text-center truncate w-full group-hover:text-primary transition-colors">
                {creator.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ForCreators() {
  const [, setLocation] = useLocation();

  function handleSearch(query: string) {
    setLocation(`/agents?q=${encodeURIComponent(query)}`);
  }

  return (
    <div>
      <HeroSearch onSearch={handleSearch} />
      <StatsBar />
      <TrendingSection />
      <FeaturedCreators />
    </div>
  );
}
