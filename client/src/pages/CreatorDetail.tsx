import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import type { Agent, Creator, Post } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Shield, Bot, Wrench, FileText, Globe, ExternalLink, Github,
  Star, Download, Users, Heart, MessageCircle, Clock, Bell, BellOff, Lock, CheckCircle,
} from "lucide-react";

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Bot size={14} />,
  tool: <Wrench size={14} />,
  content: <FileText size={14} />,
  api: <Globe size={14} />,
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

export default function CreatorDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data, isLoading } = useQuery<Creator & { agents: Agent[]; posts: Post[]; isSubscribed: boolean }>({
    queryKey: ["/api/creators", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/creators/${id}`);
      return res.json();
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/creators/${id}/subscribe`);
      return res.json();
    },
    onSuccess: (result: { subscribed: boolean; subscribers: number }) => {
      toast({
        title: result.subscribed ? "Subscribed" : "Unsubscribed",
        description: result.subscribed ? `You're now following ${data?.name}` : `Unfollowed ${data?.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/creators", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/me/subscriptions"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Sign in to subscribe", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <Users size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-lg font-semibold text-foreground mb-2">Creator not found</h1>
        <Link href="/creators" className="text-sm text-primary no-underline hover:underline">
          Back to creators
        </Link>
      </div>
    );
  }

  const creator = data;
  const agents = data.agents || [];
  const creatorPosts = data.posts || [];
  const isSubscribed = data.isSubscribed;

  const totalDownloads = agents.reduce((sum, a) => sum + a.downloads, 0);
  const totalStars = agents.reduce((sum, a) => sum + a.stars, 0);

  // Derive GitHub / website links from agents' apiEndpoints
  const externalLinks = (() => {
    const links: { url: string; label: string; isGithub: boolean }[] = [];
    const seen = new Set<string>();
    for (const a of agents) {
      if (!a.apiEndpoint) continue;
      try {
        const u = new URL(a.apiEndpoint);
        const origin = u.origin + u.pathname.split("/").slice(0, 2).join("/");
        if (seen.has(origin)) continue;
        seen.add(origin);
        const isGithub = u.hostname === "github.com";
        links.push({ url: a.apiEndpoint, label: isGithub ? u.pathname.slice(1) : u.hostname, isGithub });
      } catch { /* skip invalid URLs */ }
    }
    return links.slice(0, 3);
  })();

  // Category distribution
  const categoryDistribution = (() => {
    const counts: Record<string, number> = {};
    for (const a of agents) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <Link href="/creators" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 no-underline" data-testid="link-back">
        <ArrowLeft size={14} /> Back to creators
      </Link>

      {/* Creator Header with subtle gradient background */}
      <div className="rounded-xl bg-primary/5 border border-border p-6 mb-6" data-testid="section-creator-header">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <img
            src={creator.avatar}
            alt={creator.name}
            className="w-20 h-20 rounded-full bg-muted shrink-0 ring-2 ring-background shadow-sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-foreground">{creator.name}</h1>
              {creator.verified && (
                <Badge variant="secondary" className="text-[10px] gap-1 font-medium">
                  <Shield size={10} /> Verified
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">@{creator.handle}</p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
              {creator.bio}
            </p>

            <div className="flex flex-wrap gap-1.5 mt-3">
              {creator.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs font-medium">
                  {tag}
                </Badge>
              ))}
            </div>

            {/* GitHub / external links */}
            {externalLinks.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3" data-testid="section-external-links">
                {externalLinks.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors no-underline"
                    data-testid={`link-external-${link.label}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {link.isGithub ? <Github size={12} /> : <ExternalLink size={12} />}
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Subscribe Button — bigger and more prominent on mobile */}
          <Button
            className={`sm:shrink-0 w-full sm:w-auto h-10 sm:h-9 text-sm font-medium gap-1.5 ${!isSubscribed ? "shadow-sm" : ""}`}
            variant={isSubscribed ? "outline" : "default"}
            onClick={() => subscribeMutation.mutate()}
            disabled={subscribeMutation.isPending}
            data-testid="button-follow"
          >
            {subscribeMutation.isPending ? "..." : isSubscribed ? (
              <><CheckCircle size={14} /> Subscribed</>
            ) : (
              <><Bell size={14} /> Subscribe</>
            )}
          </Button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/50" data-testid="section-stats-bar">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1 text-muted-foreground">
              <Users size={13} />
            </div>
            <p className="text-lg font-bold text-foreground">{formatNumber(creator.subscribers)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Subscribers</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1 text-muted-foreground">
              <Bot size={13} />
            </div>
            <p className="text-lg font-bold text-foreground">{agents.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1 text-muted-foreground">
              <Download size={13} />
            </div>
            <p className="text-lg font-bold text-foreground">{formatNumber(totalDownloads)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Downloads</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1 text-muted-foreground">
              <Star size={13} />
            </div>
            <p className="text-lg font-bold text-foreground">{formatNumber(totalStars)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stars</p>
          </div>
        </div>

        {/* Category distribution */}
        {categoryDistribution.length > 1 && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50" data-testid="section-category-distribution">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">Builds:</span>
            <div className="flex items-center gap-2 flex-wrap">
              {categoryDistribution.map(([cat, count]) => (
                <span key={cat} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {categoryIcons[cat]}
                  <span className="capitalize">{cat}</span>
                  <span className="text-[10px] font-medium text-foreground">({count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tabs: Agents + Posts */}
      <Tabs defaultValue="agents">
        <TabsList className="mb-4">
          <TabsTrigger value="agents" className="text-xs gap-1.5">
            <Bot size={13} />
            Agents ({agents.length})
          </TabsTrigger>
          <TabsTrigger value="posts" className="text-xs gap-1.5">
            <FileText size={13} />
            Posts ({creatorPosts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="agents">
          {agents.length === 0 ? (
            <div className="text-center py-12 rounded-lg border border-dashed border-border" data-testid="empty-agents">
              <Bot size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-1">This creator hasn't published any agents yet.</p>
              <p className="text-xs text-muted-foreground">Subscribe to get notified when they do.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map((agent) => (
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
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-medium shrink-0 uppercase tracking-wider">
                        {agent.category}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                      {agent.description}
                    </p>

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
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="posts">
          <div className="space-y-3">
            {creatorPosts.map((post) => {
              const isGated = post.visibility === "subscribers" && !isSubscribed;
              return (
                <Link
                  key={post.id}
                  href={isGated ? "#" : `/posts/${post.id}`}
                  className="group block no-underline"
                  data-testid={`card-post-${post.id}`}
                  onClick={isGated ? (e: React.MouseEvent) => {
                    e.preventDefault();
                    toast({ title: "Subscribers only", description: "Subscribe to this creator to read this post." });
                  } : undefined}
                >
                  <div className={`rounded-lg border border-border p-4 hover:border-primary/30 hover:bg-muted/30 transition-all ${isGated ? "opacity-70" : ""}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
                        {post.title}
                      </h3>
                      {post.visibility === "subscribers" && (
                        <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                          <Lock size={10} /> Subscribers
                        </Badge>
                      )}
                    </div>
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {post.excerpt}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {post.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Heart size={12} />
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle size={12} />
                        {post.commentCount}
                      </span>
                      <span className="flex items-center gap-1 ml-auto">
                        <Clock size={12} />
                        {timeAgo(post.createdAt)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {creatorPosts.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No posts published yet.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
