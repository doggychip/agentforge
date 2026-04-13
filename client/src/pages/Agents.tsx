import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
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
  Star, Download, Bot, Wrench, FileText, Globe, ArrowUpDown, SlidersHorizontal,
  X as XIcon, Search, TrendingUp, Shield, Database, Code, Music, Cpu, MessageSquare,
  BookOpen, Brain, Zap,
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
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

const categoryColors: Record<string, string> = {
  agent: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  tool: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  content: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  api: "bg-teal-500/10 text-teal-600 border-teal-500/20",
};

const taskTypes = [
  { value: "trading", label: "Trading & Finance", icon: <TrendingUp size={13} />, tags: ["trading", "crypto", "defi", "stocks", "fintech", "finance", "quantitative", "etf", "forex"] },
  { value: "devops", label: "DevOps & Infra", icon: <Cpu size={13} />, tags: ["kubernetes", "devops", "ci-cd", "monitoring", "cloud", "infrastructure", "docker"] },
  { value: "security", label: "Security", icon: <Shield size={13} />, tags: ["security", "pentesting", "smart-contracts", "solidity", "audit", "web3-security"] },
  { value: "code", label: "Code & Dev", icon: <Code size={13} />, tags: ["code-review", "code-gen", "coding-agent", "documentation", "developer-productivity", "github"] },
  { value: "data", label: "Data & Analytics", icon: <Database size={13} />, tags: ["data", "etl", "sql", "analytics", "text-to-sql", "rag", "data-analysis", "data-visualization"] },
  { value: "nlp", label: "NLP & Language", icon: <MessageSquare size={13} />, tags: ["nlp", "chinese", "japanese", "korean", "multilingual", "chatbot", "llm"] },
  { value: "automation", label: "Automation", icon: <Zap size={13} />, tags: ["automation", "workflow", "no-code", "scheduling", "social"] },
  { value: "research", label: "Research", icon: <BookOpen size={13} />, tags: ["research", "deep-research", "education", "academic", "benchmark"] },
  { value: "creative", label: "Creative & Media", icon: <Music size={13} />, tags: ["music", "design", "video", "text-to-image", "content creation"] },
  { value: "ai-infra", label: "AI Infrastructure", icon: <Brain size={13} />, tags: ["memory", "mcp", "agent", "multi-agent", "framework", "orchestration"] },
];

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

const languageFilters = [
  { value: "all", label: "All" },
  { value: "english", label: "English" },
  { value: "chinese", label: "中文" },
  { value: "japanese", label: "日本語" },
  { value: "korean", label: "한국어" },
];

const sortOptions = [
  { value: "popular", label: "Popular" },
  { value: "downloads", label: "Downloads" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "newest", label: "Newest" },
];

function isFreeAgent(agent: Agent): boolean {
  if (agent.pricing === "free") return true;
  if (!agent.price || agent.price === 0) return true;
  const lowerTags = agent.tags.map((t) => t.toLowerCase());
  return lowerTags.some((t) => t.includes("open-source") || t.includes("open source"));
}

function matchesLanguage(agent: Agent, lang: string): boolean {
  const check = (s: string) => {
    const l = s.toLowerCase();
    switch (lang) {
      case "chinese": return l.includes("chinese") || l.includes("中文");
      case "japanese": return l.includes("japanese") || l.includes("日本語");
      case "korean": return l.includes("korean") || l.includes("한국어");
      case "english": return l.includes("english");
      default: return false;
    }
  };
  return agent.tags.some(check) || check(agent.name) || check(agent.description);
}

export default function Agents() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeLanguage, setActiveLanguage] = useState("all");
  const [pricingFilter, setPricingFilter] = useState<"all" | "free" | "paid">("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTaskType, setActiveTaskType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("popular");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const creatorsMap = useMemo(
    () => new Map(creators?.map((c) => [c.id, c]) || []),
    [creators],
  );

  const allTags = useMemo(() => {
    if (!agents) return [];
    const tagSet = new Set<string>();
    agents.forEach((a) => a.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [agents]);

  const filtered = useMemo(() => {
    let result = agents ?? [];
    const q = searchQuery.trim().toLowerCase();

    // Search by name, description, AND creator name
    if (q) {
      result = result.filter((a) => {
        const creator = creatorsMap.get(a.creatorId);
        return (
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)) ||
          (creator && creator.name.toLowerCase().includes(q))
        );
      });
    }

    if (activeCategory !== "all") {
      result = result.filter((a) => a.category === activeCategory);
    }

    if (activeLanguage !== "all") {
      result = result.filter((a) => matchesLanguage(a, activeLanguage));
    }

    if (pricingFilter === "free") {
      result = result.filter(isFreeAgent);
    } else if (pricingFilter === "paid") {
      result = result.filter((a) => !isFreeAgent(a));
    }

    if (activeTaskType) {
      const tt = taskTypes.find((t) => t.value === activeTaskType);
      if (tt) {
        result = result.filter((a) =>
          a.tags.some((t) => tt.tags.includes(t.toLowerCase()))
        );
      }
    }

    if (activeTag) {
      result = result.filter((a) => a.tags.includes(activeTag));
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "downloads": return b.downloads - a.downloads;
        case "price-asc": return (a.price ?? 0) - (b.price ?? 0);
        case "newest": return b.id.localeCompare(a.id);
        default: return (b.stars + b.downloads) - (a.stars + a.downloads);
      }
    });

    return result;
  }, [agents, searchQuery, activeCategory, activeLanguage, pricingFilter, activeTag, activeTaskType, sortBy, creatorsMap]);

  const activeFilterCount =
    (activeCategory !== "all" ? 1 : 0) +
    (activeLanguage !== "all" ? 1 : 0) +
    (pricingFilter !== "all" ? 1 : 0) +
    (activeTag ? 1 : 0) +
    (activeTaskType ? 1 : 0) +
    (searchQuery ? 1 : 0);

  function clearFilters() {
    setSearchQuery("");
    setActiveCategory("all");
    setActiveLanguage("all");
    setPricingFilter("all");
    setActiveTag(null);
    setActiveTaskType(null);
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
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search agents, creators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-[200px] pl-8 text-xs bg-card border-border"
              data-testid="input-search-agents"
            />
          </div>
          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[170px] text-xs" data-testid="select-sort">
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

      {/* Category Tabs — HuggingFace style */}
      <div className="flex items-center gap-2 mb-4 border-b border-border pb-3" data-testid="filter-categories">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeCategory === cat
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            onClick={() => setActiveCategory(cat)}
            data-testid={`button-category-${cat}`}
          >
            {cat !== "all" && categoryIcons[cat]}
            <span className="capitalize">{cat === "all" ? "All Types" : categoryLabels[cat] + "s"}</span>
          </button>
        ))}
      </div>

      {/* Task Type Classification — HuggingFace style chips */}
      <div className="flex flex-col gap-3 mb-6">
        <div
          ref={tagsRef}
          className="flex items-center gap-1.5 flex-wrap overflow-hidden transition-all duration-300"
          style={{ maxHeight: tagsExpanded ? tagsRef.current?.scrollHeight : 36 }}
          data-testid="filter-task-types"
        >
          {taskTypes.map((tt) => (
            <button
              key={tt.value}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                activeTaskType === tt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              }`}
              onClick={() => setActiveTaskType(activeTaskType === tt.value ? null : tt.value)}
              data-testid={`button-task-${tt.value}`}
            >
              {tt.icon}
              {tt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-muted-foreground hover:text-foreground px-1"
            onClick={() => setTagsExpanded(!tagsExpanded)}
            data-testid="button-toggle-tasks"
          >
            {tagsExpanded ? "Fewer \u25B4" : "More \u25BE"}
          </Button>

          <div className="h-4 w-px bg-border" />

          {/* Language */}
          <div className="flex items-center gap-1.5">
            <Globe size={12} className="text-muted-foreground" />
            {languageFilters.map((lang) => (
              <button
                key={lang.value}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  activeLanguage === lang.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveLanguage(lang.value)}
                data-testid={`button-lang-${lang.value}`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Pricing */}
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={12} className="text-muted-foreground" />
            {(["all", "free", "paid"] as const).map((p) => (
              <button
                key={p}
                className={`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-all ${
                  pricingFilter === p
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setPricingFilter(p)}
                data-testid={`button-pricing-${p}`}
              >
                {p === "all" ? "Any" : p}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Tag select */}
          <Select value={activeTag || "__none__"} onValueChange={(v) => setActiveTag(v === "__none__" ? null : v)}>
            <SelectTrigger className="h-6 w-[130px] text-[11px]" data-testid="select-tag">
              <SelectValue placeholder="Tag..." />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((agent) => {
            const creator = creatorsMap.get(agent.creatorId);
            return (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="group block no-underline"
                data-testid={`card-agent-${agent.id}`}
              >
                <div className="rounded-xl border border-border bg-card p-5 h-full transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <AgentAvatar name={agent.name} className="w-11 h-11" />
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {agent.name}
                        </h3>
                        {creator && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            by {creator.name}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-medium shrink-0 uppercase tracking-wider gap-1 ${categoryColors[agent.category] || ""}`}>
                      {categoryIcons[agent.category]}
                      {categoryLabels[agent.category]}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                    {agent.description}
                  </p>

                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {agent.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star size={14} className="text-yellow-500" />
                        {formatNumber(agent.stars)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download size={14} />
                        {formatNumber(agent.downloads)}
                      </span>
                    </div>
                    <Badge
                      variant={agent.pricing === "free" ? "secondary" : "default"}
                      className={`text-xs font-semibold px-2.5 py-0.5 ${agent.pricing === "free" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : ""}`}
                    >
                      {formatPrice(agent.price, agent.pricing)}
                    </Badge>
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
