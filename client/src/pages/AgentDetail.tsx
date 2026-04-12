import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useState, useMemo } from "react";
import type { Agent, Creator, Review } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Star, Download, Bot, Wrench, FileText, Globe, ArrowLeft, Share2, X as XIcon,
  Shield, Copy, Code, Cpu, MessageSquare, CheckCircle, Terminal, Play, Box,
  Loader2,
} from "lucide-react";
import { AgentAvatar } from "@/components/AgentAvatar";

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Bot size={18} />,
  tool: <Wrench size={18} />,
  content: <FileText size={18} />,
  api: <Globe size={18} />,
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

function StarRating({ rating, size = 14, interactive = false, onRate }: {
  rating: number; size?: number; interactive?: boolean; onRate?: (r: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={`${i <= rating ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"} ${interactive ? "cursor-pointer hover:text-yellow-400" : ""}`}
          onClick={() => interactive && onRate?.(i)}
        />
      ))}
    </div>
  );
}

interface HfModelMeta {
  id: string;
  pipeline_tag?: string;
  library_name?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  cardData?: {
    license?: string;
  };
  safetensors?: {
    total?: number;
    parameters?: Record<string, number>;
  };
}

function HfModelCard({ modelId }: { modelId: string }) {
  const { data: model, isLoading, error } = useQuery<HfModelMeta>({
    queryKey: ["hf-model", modelId],
    queryFn: async () => {
      const res = await fetch(`https://huggingface.co/api/models/${modelId}`);
      if (!res.ok) throw new Error("Model not found");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading model info...</span>
      </div>
    );
  }

  if (error || !model) return null;

  const totalParams = model.safetensors?.parameters
    ? Object.values(model.safetensors.parameters).reduce((a, b) => a + b, 0)
    : null;

  const license = model.cardData?.license || model.tags?.find(t => t.startsWith("license:"))?.replace("license:", "");

  function formatParams(n: number) {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
    return n.toLocaleString();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2" data-testid="hf-model-card">
      <div className="flex items-center gap-2 mb-1">
        <Box size={14} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Powered by</h3>
      </div>
      <a
        href={`https://huggingface.co/${modelId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-primary hover:underline no-underline"
      >
        {model.id}
      </a>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
        {totalParams && (
          <span>Parameters: <span className="font-medium text-foreground">{formatParams(totalParams)}</span></span>
        )}
        {license && (
          <span>License: <span className="font-medium text-foreground">{license}</span></span>
        )}
        {model.downloads != null && (
          <span>Downloads: <span className="font-medium text-foreground">{model.downloads.toLocaleString()}</span></span>
        )}
        {model.pipeline_tag && (
          <span>Task: <span className="font-medium text-foreground">{model.pipeline_tag}</span></span>
        )}
      </div>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Parse checkout status from hash URL: /#/agents/a1?checkout=success
  const checkoutStatus = useMemo(() => {
    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return null;
    const params = new URLSearchParams(hash.slice(qIdx));
    return params.get("checkout") as "success" | "cancel" | null;
  }, []);

  const { data: agentData, isLoading } = useQuery<Agent & { creator?: Creator }>({
    queryKey: ["/api/agents", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${id}`);
      const agent = await res.json();
      try {
        const cRes = await apiRequest("GET", `/api/creators/${agent.creatorId}`);
        const creator = await cRes.json();
        return { ...agent, creator };
      } catch {
        return agent;
      }
    },
  });

  const { data: reviewData } = useQuery<{ reviews: Review[]; avg: number; count: number }>({
    queryKey: ["/api/agents", id, "reviews"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${id}/reviews`);
      return res.json();
    },
  });

  // Check existing subscription status for paid agents
  const { data: subStatus } = useQuery<{ subscribed: boolean }>({
    queryKey: ["/api/agents", id, "subscription-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents/${id}/subscription-status`);
      return res.json();
    },
    enabled: !!user && !!id,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      // For paid agents, redirect to Stripe Checkout
      if (agentData && agentData.pricing !== "free" && agentData.price) {
        const res = await apiRequest("POST", "/api/stripe/checkout", { agentId: id });
        const data = await res.json();
        if (data.url) {
          window.open(data.url, "_blank");
          return;
        }
        throw new Error(data.message || "Checkout failed");
      }
      // For free agents, just create a DB subscription
      await apiRequest("POST", "/api/subscriptions", {
        subscriberId: user?.id || "anonymous",
        subscriberType: "human",
        agentId: id,
        plan: "free",
        status: "active",
      });
    },
    onSuccess: () => {
      if (agentData?.pricing === "free" || !agentData?.price) {
        toast({ title: "Installed", description: `You've installed ${agentData?.name}` });
      } else {
        toast({ title: "Checkout opened", description: "Complete payment in the new tab" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "subscription-status"] });
    },
    onError: (err: any) => {
      const msg = err?.message || "Sign in to subscribe";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/agents/${id}/reviews`, {
        rating: reviewRating,
        body: reviewBody,
      });
    },
    onSuccess: () => {
      toast({ title: "Review posted" });
      setReviewBody("");
      setReviewRating(5);
      queryClient.invalidateQueries({ queryKey: ["/api/agents", id, "reviews"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Sign in to leave a review", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!agentData) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <Bot size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-lg font-semibold text-foreground mb-2">Agent not found</h1>
        <Link href="/agents" className="text-sm text-primary no-underline hover:underline">
          Back to agents
        </Link>
      </div>
    );
  }

  const agent = agentData;
  const creator = (agent as any).creator as Creator | undefined;
  const reviews = reviewData?.reviews || [];
  const avgRating = reviewData?.avg || 0;
  const reviewCount = reviewData?.count || 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back */}
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 no-underline" data-testid="link-back">
        <ArrowLeft size={14} /> Back to agents
      </Link>

      {/* Checkout success/cancel banner */}
      {checkoutStatus && !bannerDismissed && (
        <div
          className={`rounded-lg border p-4 mb-6 flex items-center justify-between ${
            checkoutStatus === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400"
          }`}
          data-testid={`banner-checkout-${checkoutStatus}`}
        >
          <div className="flex items-center gap-2">
            {checkoutStatus === "success" ? <CheckCircle size={16} /> : <XIcon size={16} />}
            <span className="text-sm font-medium">
              {checkoutStatus === "success"
                ? `Payment successful! You now have access to ${agent.name}.`
                : "Payment was cancelled. You can try again anytime."}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => setBannerDismissed(true)}
            data-testid="button-dismiss-banner"
          >
            <XIcon size={14} />
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <AgentAvatar name={agent.name} className="w-14 h-14" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{agent.name}</h1>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-medium">
              {agent.category}
            </Badge>
            {agent.status === "beta" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium text-yellow-500 border-yellow-500/30">
                Beta
              </Badge>
            )}
          </div>

          {creator && (
            <Link
              href={`/creators/${creator.id}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground no-underline mb-3"
            >
              <img src={creator.avatar} alt={creator.name} className="w-5 h-5 rounded-full" />
              {creator.name}
              {creator.verified && <Shield size={12} className="text-primary" />}
            </Link>
          )}

          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            {agent.description}
          </p>

          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Star size={14} className="text-yellow-500" />
              <span className="font-medium text-foreground">{formatNumber(agent.stars)}</span> stars
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Download size={14} />
              <span className="font-medium text-foreground">{formatNumber(agent.downloads)}</span> downloads
            </div>
            {reviewCount > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <StarRating rating={Math.round(avgRating)} size={12} />
                <span className="font-medium text-foreground">{avgRating.toFixed(1)}</span>
                <span>({reviewCount})</span>
              </div>
            )}
          </div>
        </div>

        {/* Price / Subscribe Card */}
        <div className="sm:w-56 shrink-0">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">
                {formatPrice(agent.price, agent.pricing)}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                {agent.pricing === "free" ? "Open source" : agent.pricing === "usage" ? "Per API call" : "Per month"}
              </p>
            </div>

            <Link href={`/playground/${agent.id}`}>
              <Button className="w-full h-9 text-sm font-medium gap-1.5" variant="default">
                <Play size={14} /> Try it now
              </Button>
            </Link>

            {/* Installed state for free agents */}
            {(subStatus?.subscribed || subscribeMutation.isSuccess || checkoutStatus === "success") && agent.pricing === "free" ? (
              <div className="flex items-center justify-center gap-2 h-9 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium" data-testid="badge-installed">
                <CheckCircle size={15} />
                Installed
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-9 text-sm font-medium"
                onClick={() => subscribeMutation.mutate()}
                disabled={subscribeMutation.isPending || subStatus?.subscribed}
                data-testid="button-subscribe"
              >
                {subscribeMutation.isPending ? "..." : (subStatus?.subscribed || subscribeMutation.isSuccess || checkoutStatus === "success") ? (
                  <span className="flex items-center gap-1.5"><CheckCircle size={14} /> Subscribed</span>
                ) : agent.pricing === "free" ? "Install" : "Subscribe"}
              </Button>
            )}

            {agent.apiEndpoint && (
              <Button variant="outline" className="w-full h-8 text-xs gap-1.5" data-testid="button-api-docs">
                <Code size={12} /> API Docs
              </Button>
            )}

            {/* Share button */}
            <Button
              variant="outline"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => {
                const url = window.location.origin + `/agents/${agent.id}`;
                navigator.clipboard.writeText(url);
                toast({ title: "Link copied", description: "Agent URL copied to clipboard" });
              }}
              data-testid="button-share"
            >
              <Share2 size={12} /> Share
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted/50" data-testid="tabs-agent">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          {agent.hfSpaceUrl && (
            <TabsTrigger value="tryit" className="text-xs gap-1">
              <Play size={11} /> Try it
            </TabsTrigger>
          )}
          <TabsTrigger value="api" className="text-xs">Quick Start</TabsTrigger>
          <TabsTrigger value="reviews" className="text-xs">
            Reviews {reviewCount > 0 && `(${reviewCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {agent.longDescription && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="text-sm text-muted-foreground leading-relaxed">{agent.longDescription}</p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs font-medium">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {agent.apiEndpoint && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">API Endpoint</h3>
              <div className="flex items-center gap-2 p-3 rounded-md bg-muted font-mono text-xs text-muted-foreground">
                <code className="flex-1 truncate">{agent.apiEndpoint}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(agent.apiEndpoint || "");
                    toast({ title: "Copied to clipboard" });
                  }}
                  data-testid="button-copy-endpoint"
                >
                  <Copy size={12} />
                </Button>
              </div>
            </div>
          )}

          {/* Powered by HF Model card */}
          {agent.hfModelId && <HfModelCard modelId={agent.hfModelId} />}
        </TabsContent>

        {/* Try it tab — HF Space embed */}
        {agent.hfSpaceUrl && (
          <TabsContent value="tryit">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                <Play size={14} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Interactive Demo</h3>
                <a
                  href={agent.hfSpaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground no-underline"
                >
                  Open on Hugging Face &rarr;
                </a>
              </div>
              <iframe
                src={agent.hfSpaceUrl.replace("huggingface.co/spaces/", "huggingface.co/spaces/").replace(/\/?$/, "?__theme=dark")}
                title={`${agent.name} — HF Space`}
                className="w-full border-0"
                style={{ minHeight: "560px" }}
                allow="accelerometer; camera; clipboard-write; encrypted-media; gyroscope; microphone"
                sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
                data-testid="iframe-hf-space"
              />
            </div>
          </TabsContent>
        )}

        <TabsContent value="api">
          <div className="space-y-4">
            {/* Install */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Terminal size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Installation</h3>
              </div>
              <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
                <pre>{`npm install @agentforge/${agent.id}`}</pre>
              </div>
            </div>

            {/* Usage */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Code size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Usage</h3>
              </div>
              <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
                <pre>{`import { ${agent.name.replace(/[^a-zA-Z0-9]/g, "")} } from "@agentforge/${agent.id}";

const agent = new ${agent.name.replace(/[^a-zA-Z0-9]/g, "")}({
  apiKey: process.env.AGENTFORGE_KEY,
});

// Run the agent
const result = await agent.run({
  input: "your data here",
});

console.log(result);`}</pre>
              </div>
            </div>

            {/* API for Agents */}
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bot size={15} className="text-primary" />
                <h3 className="text-sm font-semibold text-foreground">For AI Agent Consumers</h3>
              </div>
              <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground overflow-x-auto">
                <pre>{`# REST API endpoint
curl -X POST ${agent.apiEndpoint || `https://api.agentforge.dev/v1/agents/${agent.id}/run`} \\
  -H "Authorization: Bearer $AGENTFORGE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "your data here"}'`}</pre>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                AI agents can subscribe and consume this agent via REST API with their own API key.
              </p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          {/* Write Review */}
          {user && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Write a review</h3>
              <StarRating rating={reviewRating} interactive onRate={setReviewRating} />
              <Textarea
                placeholder="Share your experience with this agent..."
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                className="text-sm min-h-[80px]"
                data-testid="textarea-review"
              />
              <Button
                size="sm"
                className="text-xs"
                onClick={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending || !reviewBody.trim()}
                data-testid="button-submit-review"
              >
                {reviewMutation.isPending ? "Posting..." : "Post Review"}
              </Button>
            </div>
          )}

          {/* Review List */}
          {reviews.length > 0 ? (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className="rounded-lg border border-border bg-card p-4" data-testid={`review-${review.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{review.authorName}</span>
                      <StarRating rating={review.rating} size={11} />
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(review.createdAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{review.body}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <MessageSquare size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No reviews yet. Be the first to review.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
