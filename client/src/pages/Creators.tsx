import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Creator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield, Bot, Users, Search, ArrowUpDown, X as XIcon, TrendingUp, Database,
  Code, MessageSquare, Cpu, Zap, Globe,
} from "lucide-react";
import { useState, useMemo, useRef } from "react";

const creatorTaskTypes = [
  { value: "trading", label: "Trading & Finance", icon: <TrendingUp size={13} />, tags: ["trading", "crypto", "defi", "stocks", "fintech", "finance", "quantitative", "quant"] },
  { value: "devops", label: "DevOps & Infra", icon: <Cpu size={13} />, tags: ["devops", "kubernetes", "cloud", "infrastructure", "monitoring"] },
  { value: "code", label: "Code & Dev Tools", icon: <Code size={13} />, tags: ["code-review", "coding-agent", "developer-productivity", "documentation", "github"] },
  { value: "nlp", label: "NLP & Language", icon: <MessageSquare size={13} />, tags: ["nlp", "chinese", "japanese", "korean", "multilingual", "chatbot"] },
  { value: "data", label: "Data & Analytics", icon: <Database size={13} />, tags: ["data", "etl", "analytics", "data-analysis", "data-visualization"] },
  { value: "automation", label: "Automation", icon: <Zap size={13} />, tags: ["automation", "workflow", "scheduling", "social", "e-commerce"] },
  { value: "regional", label: "Regional", icon: <Globe size={13} />, tags: ["hong-kong", "taiwan", "korea", "japan", "singapore", "india", "vietnam", "indonesia", "malaysia"] },
];

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "most-agents", label: "Most Agents" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name A-Z" },
];

export default function Creators() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("popular");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTaskType, setActiveTaskType] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);

  const { data: creators, isLoading } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const allTags = useMemo(() => {
    if (!creators) return [];
    const tagSet = new Set<string>();
    creators.forEach((c) => c.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [creators]);

  const filtered = useMemo(() => {
    let result = creators ?? [];
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q) ||
          c.bio.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    if (activeTaskType) {
      const tt = creatorTaskTypes.find((t) => t.value === activeTaskType);
      if (tt) {
        result = result.filter((c) =>
          c.tags.some((t) => tt.tags.includes(t.toLowerCase()))
        );
      }
    }

    if (activeTag) {
      result = result.filter((c) => c.tags.includes(activeTag));
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "most-agents": return b.agentCount - a.agentCount;
        case "newest": return b.id.localeCompare(a.id);
        case "name": return a.name.localeCompare(b.name);
        default: return b.subscribers - a.subscribers;
      }
    });

    return result;
  }, [creators, searchQuery, sortBy, activeTag, activeTaskType]);

  const activeFilterCount = (searchQuery ? 1 : 0) + (activeTag ? 1 : 0) + (activeTaskType ? 1 : 0);

  function clearFilters() {
    setSearchQuery("");
    setActiveTag(null);
    setActiveTaskType(null);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-bold text-foreground">Creators</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Developers building AI agents, tools, and technical content
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-[180px] pl-8 text-xs bg-card border-border"
              data-testid="input-search-creators"
            />
          </div>
          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[150px] text-xs" data-testid="select-sort-creators">
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

      {/* Task Type Classification */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3" data-testid="filter-task-types-creators">
        {creatorTaskTypes.map((tt) => (
          <button
            key={tt.value}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
              activeTaskType === tt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
            }`}
            onClick={() => setActiveTaskType(activeTaskType === tt.value ? null : tt.value)}
            data-testid={`button-creator-task-${tt.value}`}
          >
            {tt.icon}
            {tt.label}
          </button>
        ))}
      </div>

      {/* Tag filters */}
      <div
        ref={tagsRef}
        className="flex items-center gap-2 flex-wrap mb-2 overflow-hidden transition-all duration-300"
        style={{ maxHeight: tagsExpanded ? tagsRef.current?.scrollHeight : 42 }}
        data-testid="filter-tags-creators"
      >
        <Button
          variant={activeTag === null ? "default" : "outline"}
          size="sm"
          className="h-7 text-xs"
          onClick={() => setActiveTag(null)}
          data-testid="button-tag-all"
        >
          All
        </Button>
        {allTags.map((tag) => (
          <Button
            key={tag}
            variant={activeTag === tag ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            data-testid={`button-tag-${tag}`}
          >
            {tag}
          </Button>
        ))}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
            onClick={clearFilters}
            data-testid="button-clear-filters-creators"
          >
            <XIcon size={11} />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs text-muted-foreground hover:text-foreground mb-4"
        onClick={() => setTagsExpanded(!tagsExpanded)}
        data-testid="button-toggle-tags"
      >
        {tagsExpanded ? "Show fewer tags \u25B4" : "Show all tags \u25BE"}
      </Button>

      {/* Results count */}
      <p className="text-xs text-muted-foreground mb-4">
        {filtered.length} {filtered.length === 1 ? "creator" : "creators"}
      </p>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((creator) => (
            <Link
              key={creator.id}
              href={`/creators/${creator.id}`}
              className="group block no-underline"
              data-testid={`card-creator-${creator.id}`}
            >
              <div className="rounded-lg border border-border bg-card p-5 h-full transition-all duration-200 hover:border-primary/30 hover:shadow-md">
                <div className="flex items-start gap-3 mb-3">
                  <img
                    src={creator.avatar}
                    alt={creator.name}
                    className="w-11 h-11 rounded-full bg-muted shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {creator.name}
                      </h3>
                      {creator.verified && (
                        <Shield size={13} className="text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">@{creator.handle}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                  {creator.bio}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {creator.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-4 pt-3 border-t border-border text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users size={12} />
                    {formatNumber(creator.subscribers)} subscribers
                  </span>
                  <span className="flex items-center gap-1">
                    <Bot size={12} />
                    {creator.agentCount} agents
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <Users size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No creators match your filters</p>
          <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={clearFilters}>
            Clear all filters
          </Button>
        </div>
      )}
    </div>
  );
}
