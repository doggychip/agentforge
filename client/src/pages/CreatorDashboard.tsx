import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Creator, Agent, Review } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot, Download, Star, DollarSign, Users, Plus,
  ArrowRight, BarChart3,
} from "lucide-react";

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

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

export default function CreatorDashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: creator, isLoading: loadingCreator } = useQuery<Creator | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/creators/me");
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!user,
  });

  const { data: agents, isLoading: loadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents", { creator: creator?.id }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents?creator=${creator!.id}`);
      return res.json();
    },
    enabled: !!creator,
  });

  // Fetch reviews for each agent
  const { data: allReviews } = useQuery<(Review & { agentName: string })[]>({
    queryKey: ["/api/creator-reviews", agents?.map((a) => a.id)],
    queryFn: async () => {
      if (!agents || agents.length === 0) return [];
      const results: (Review & { agentName: string })[] = [];
      for (const agent of agents.slice(0, 10)) {
        try {
          const res = await apiRequest("GET", `/api/agents/${agent.id}/reviews`);
          const data = await res.json();
          if (data.reviews) {
            for (const r of data.reviews) {
              results.push({ ...r, agentName: agent.name });
            }
          }
        } catch {}
      }
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return results.slice(0, 10);
    },
    enabled: !!agents && agents.length > 0,
  });

  if (authLoading || loadingCreator) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  if (!creator) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Bot size={32} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-4">You need a creator profile to access the dashboard.</p>
        <Link href="/become-creator" className="no-underline">
          <Button size="sm" className="gap-1.5">
            <Plus size={14} /> Become a Creator
          </Button>
        </Link>
      </div>
    );
  }

  const totalDownloads = agents?.reduce((sum, a) => sum + a.downloads, 0) ?? 0;
  const totalStars = agents?.reduce((sum, a) => sum + a.stars, 0) ?? 0;
  const totalRevenue = agents
    ?.filter((a) => a.pricing !== "free" && a.price)
    .reduce((sum, a) => sum + (a.price ?? 0) * a.downloads, 0) ?? 0;

  // Generate mock install data for last 30 days bar chart
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const dayLabel = `${date.getMonth() + 1}/${date.getDate()}`;
    // Derive a deterministic value from total downloads spread across days
    const base = Math.max(1, Math.floor(totalDownloads / 30));
    const jitter = ((i * 7 + 3) % 5) - 2;
    return { day: dayLabel, installs: Math.max(0, base + jitter) };
  });
  const maxInstalls = Math.max(1, ...last30Days.map((d) => d.installs));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Creator Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome back, {creator.name}
          </p>
        </div>
        <Link href="/publish" className="no-underline">
          <Button size="sm" className="gap-1.5 text-xs h-8">
            <Plus size={13} /> Publish Agent
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={14} className="text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{agents?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Download size={14} className="text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Installs</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatNumber(totalDownloads)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Subscribers</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatNumber(creator.subscribers)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-primary" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Revenue</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            ${(totalRevenue / 100).toFixed(0)}
          </p>
        </div>
      </div>

      {/* Installs Chart (last 30 days) */}
      <div className="rounded-lg border border-border bg-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={14} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Installs — Last 30 Days</h2>
        </div>
        <div className="flex items-end gap-[2px] h-32">
          {last30Days.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <div
                className="w-full bg-primary/70 rounded-t-sm min-h-[2px] transition-colors group-hover:bg-primary"
                style={{ height: `${(d.installs / maxInstalls) * 100}%` }}
              />
              {/* Tooltip on hover */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-popover border border-border text-foreground text-[10px] px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap z-10">
                {d.day}: {d.installs}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">{last30Days[0]?.day}</span>
          <span className="text-[10px] text-muted-foreground">{last30Days[last30Days.length - 1]?.day}</span>
        </div>
      </div>

      {/* Agent List */}
      <div className="rounded-lg border border-border bg-card mb-6">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Your Agents</h2>
        </div>
        {loadingAgents ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : agents && agents.length > 0 ? (
          <div className="divide-y divide-border">
            {agents.map((agent) => (
              <Link
                key={agent.id}
                href={`/agents/${agent.id}`}
                className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors no-underline"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{agent.name}</span>
                    <Badge variant="outline" className="text-[10px]">{agent.category}</Badge>
                    <Badge variant={agent.pricing === "free" ? "secondary" : "default"} className="text-[10px]">
                      {agent.pricing === "free" ? "Free" : `$${((agent.price ?? 0) / 100).toFixed(0)}`}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.description}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download size={11} /> {formatNumber(agent.downloads)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={11} /> {agent.stars}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Bot size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground mb-3">No agents published yet</p>
            <Link href="/publish" className="no-underline">
              <Button variant="outline" size="sm" className="text-xs gap-1.5">
                Publish your first agent <ArrowRight size={12} />
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Recent Reviews */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Recent Reviews</h2>
        </div>
        {allReviews && allReviews.length > 0 ? (
          <div className="divide-y divide-border">
            {allReviews.map((review) => (
              <div key={review.id} className="p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-foreground">{review.authorName}</span>
                  <span className="text-xs text-yellow-500">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(review.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{review.body}</p>
                <Badge variant="outline" className="text-[10px] mt-1.5">{review.agentName}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Star size={24} className="mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No reviews yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
