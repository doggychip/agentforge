import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Agent, Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, Download, Bot, Wrench, FileText, Globe, Filter
} from "lucide-react";
import { useState } from "react";

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

export default function Agents() {
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: agents, isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const creatorsMap = new Map(creators?.map((c) => [c.id, c]) || []);

  const filtered = activeCategory === "all"
    ? agents
    : agents?.filter((a) => a.category === activeCategory);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-lg font-bold text-foreground">Agents & Tools</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse all AI agents, developer tools, content, and APIs
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-1.5 mb-6 flex-wrap" data-testid="filter-categories">
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered?.map((agent) => {
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

      {filtered?.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Bot size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No {activeCategory === "all" ? "items" : activeCategory + "s"} found</p>
        </div>
      )}
    </div>
  );
}
