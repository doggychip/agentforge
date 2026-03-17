import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Star, Download, Bot, Wrench, FileText, Globe, ArrowUpDown, SlidersHorizontal, X as XIcon
} from "lucide-react";
import { useState, useMemo } from "react";

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

function formatPrice(price: number | null, pricing: string) {
  if (pricing === "free" || !price) return "Free";
  if (pricing === "usage") return `$${(price / 100).toFixed(2)}/call`;
  return `$${(price / 100).toFixed(0)}/mo`;
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

const categories = ["all", "agent", "tool", "content", "api"];
const pricingOptions = ["all", "free", "subscription", "usage"];
const sortOptions = [
  { value: "popular", label: "Most Popular" },
  { value: "stars", label: "Top Rated" },
  { value: "downloads", label: "Most Downloads" },
  { value: "name", label: "Name A-Z" },
];

export default function Agents() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activePricing, setActivePricing] = useState("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("popular");

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const creatorsMap = new Map(creators?.map((c) => [c.id, c]) || []);

  // Extract all unique tags from agents
  const allTags = useMemo(() => {
    if (!agents) return [];
    const tagSet = new Set<string>();
    agents.forEach((a) => a.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [agents]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = agents ?? [];

    // Category filter
    if (activeCategory !== "all") {
      result = result.filter((a) => a.category === activeCategory);
    }

    // Pricing filter
    if (activePricing !== "all") {
      result = result.filter((a) => a.pricing === activePricing);
    }

    // Tag filter
    if (activeTag) {
      result = result.filter((a) => a.tags.includes(activeTag));
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "stars": return b.stars - a.stars;
        case "downloads": return b.downloads - a.downloads;
        case "name": return a.name.localeCompare(b.name);
        default: return (b.stars + b.downloads) - (a.stars + a.downloads);
      }
    });

    return result;
  }, [agents, activeCategory, activePricing, activeTag, sortBy]);

  const activeFilterCount = (activeCategory !== "all" ? 1 : 0) + (activePricing !== "all" ? 1 : 0) + (activeTag ? 1 : 0);

  function clearFilters() {
    setActiveCategory("all");
    setActivePricing("all");
    setActiveTag(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-bold text-foreground">Agents & Tools</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse all AI agents, developer tools, content, and APIs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-sort">
              <ArrowUpDown size={13} className="mr-1.5 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Category buttons */}
        <div className="flex items-center gap-1.5 flex-wrap" data-testid="filter-categories">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={activeCategory === cat ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setActiveCategory(cat)}
              data-testid={`button-category-${cat}`}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Pricing + Tag row */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <SlidersHorizontal size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Pricing:</span>
          </div>
          {pricingOptions.map((p) => (
            <Button
              key={p}
              variant={activePricing === p ? "default" : "outline"}
              size="sm"
              className="h-6 text-[11px] capitalize px-2.5"
              onClick={() => setActivePricing(p)}
              data-testid={`button-pricing-${p}`}
            >
              {p === "all" ? "Any" : p}
            </Button>
          ))}

          {/* Tag select */}
          <div className="ml-2">
            <Select value={activeTag || "__none__"} onValueChange={(v) => setActiveTag(v === "__none__" ? null : v)}>
              <SelectTrigger className="h-6 w-[140px] text-[11px]" data-testid="select-tag">
                <SelectValue placeholder="Filter by tag..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-[11px]">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag} className="text-[11px]">
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
              onClick={clearFilters}
              data-testid="button-clear-filters"
            >
              <XIcon size={11} />
              Clear ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-4">
        {filtered.length} {filtered.length === 1 ? "result" : "results"}
      </p>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((agent) => {
            const creator = creatorsMap.get(agent.creatorId);
            return (
              <Link
                key={agent.id}
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
          })}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Bot size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No results match your filters</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={clearFilters}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
