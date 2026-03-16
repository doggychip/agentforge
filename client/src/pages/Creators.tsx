import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Creator } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Bot, Users } from "lucide-react";

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function Creators() {
  const { data: creators, isLoading } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-lg font-bold text-foreground">Creators</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Developers building AI agents, tools, and technical content
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {creators
            ?.sort((a, b) => b.subscribers - a.subscribers)
            .map((creator) => (
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
    </div>
  );
}
