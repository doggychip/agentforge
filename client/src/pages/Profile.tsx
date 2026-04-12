import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Creator, Post, Comment, Agent, Subscription } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User as UserIcon, Heart, MessageSquare, Users, Bot,
  Shield, ArrowRight, PenSquare, Clock, ExternalLink,
  CreditCard, DollarSign, Loader2, CheckCircle, AlertCircle,
  Banknote, Receipt,
} from "lucide-react";

type BillingRecord = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed";
};

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

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: subscribedCreators, isLoading: loadingSubs } = useQuery<Creator[]>({
    queryKey: ["/api/me/subscriptions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/subscriptions");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: likedPosts, isLoading: loadingLiked } = useQuery<Post[]>({
    queryKey: ["/api/me/liked-posts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/liked-posts");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: myComments, isLoading: loadingComments } = useQuery<Comment[]>({
    queryKey: ["/api/me/comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/comments");
      return res.json();
    },
    enabled: !!user,
  });

  // Agent subscriptions
  const { data: agentSubs, isLoading: loadingAgentSubs } = useQuery<(Subscription & { agent: Agent | null })[]>({
    queryKey: ["/api/me/agent-subscriptions"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/agent-subscriptions");
      return res.json();
    },
    enabled: !!user,
  });

  // Billing history
  const { data: billingRecords, isLoading: loadingBilling } = useQuery<BillingRecord[]>({
    queryKey: ["/api/me/billing"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/billing");
      return res.json();
    },
    enabled: !!user,
  });

  const cancelSubMutation = useMutation({
    mutationFn: async (subId: string) => {
      await apiRequest("POST", `/api/me/agent-subscriptions/${subId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/agent-subscriptions"] });
    },
  });

  const { data: creatorProfile } = useQuery<Creator | null>({
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

  // Stripe Connect status
  const { data: stripeStatus } = useQuery<{
    connected: boolean; onboarded: boolean;
    chargesEnabled?: boolean; payoutsEnabled?: boolean;
  }>({
    queryKey: ["/api/stripe/connect/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stripe/connect/status");
      return res.json();
    },
    enabled: !!user && !!creatorProfile,
  });

  // Stripe earnings
  const { data: earnings } = useQuery<{
    balance: { available: number; pending: number };
    recentPayouts: any[];
    currency: string;
  }>({
    queryKey: ["/api/stripe/connect/earnings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stripe/connect/earnings");
      return res.json();
    },
    enabled: !!user && !!creatorProfile && !!stripeStatus?.onboarded,
  });

  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/connect/onboard");
      const data = await res.json();
      if (data.url) {
        window.open(data.url, "_blank");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stripe/connect/status"] });
    },
  });

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  function getInitials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Profile Header */}
      <div className="rounded-lg border border-border bg-card p-6 mb-6" data-testid="section-profile-header">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold">
              {getInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground">{user.displayName}</h1>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
            <p className="text-xs text-muted-foreground mt-1">{user.email}</p>
          </div>
          <div className="shrink-0 flex gap-2">
            {creatorProfile ? (
              <Link href={`/creators/${creatorProfile.id}`}>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <Bot size={13} />
                  Creator Profile
                </Button>
              </Link>
            ) : (
              <Link href="/become-creator">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <PenSquare size={13} />
                  Become Creator
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{subscribedCreators?.length ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Subscriptions</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{likedPosts?.length ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Liked Posts</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{myComments?.length ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Comments</p>
          </div>
        </div>
      </div>

      {/* Stripe Connect Section for Creators */}
      {creatorProfile && (
        <div className="rounded-lg border border-border bg-card p-5 mb-6" data-testid="section-stripe-connect">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Payments & Earnings</h2>
          </div>

          {!stripeStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Connect Stripe to receive payments from subscribers. 10% platform fee on all transactions.
              </p>
              <Button
                size="sm"
                className="text-xs gap-1.5 h-8"
                onClick={() => connectStripeMutation.mutate()}
                disabled={connectStripeMutation.isPending}
                data-testid="button-connect-stripe"
              >
                {connectStripeMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CreditCard size={13} />
                )}
                Connect Stripe
              </Button>
            </div>
          ) : !stripeStatus.onboarded ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-yellow-500" />
                <p className="text-xs text-muted-foreground">Stripe connected but onboarding incomplete.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8"
                onClick={() => connectStripeMutation.mutate()}
                disabled={connectStripeMutation.isPending}
                data-testid="button-complete-stripe"
              >
                {connectStripeMutation.isPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <CreditCard size={13} />
                )}
                Complete Onboarding
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                <CheckCircle size={13} />
                <span className="font-medium">Stripe connected — ready to receive payments</span>
              </div>

              {/* Earnings Grid */}
              {earnings && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Available</p>
                    <p className="text-lg font-bold text-foreground">
                      ${((earnings.balance.available || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pending</p>
                    <p className="text-lg font-bold text-foreground">
                      ${((earnings.balance.pending || 0) / 100).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Recent Payouts */}
              {earnings?.recentPayouts && earnings.recentPayouts.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">Recent Payouts</h3>
                  <div className="space-y-1.5">
                    {earnings.recentPayouts.map((payout: any) => (
                      <div key={payout.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Banknote size={12} className="text-muted-foreground" />
                          <span className="text-foreground font-medium">${(payout.amount / 100).toFixed(2)}</span>
                        </div>
                        <Badge variant={payout.status === "paid" ? "secondary" : "outline"} className="text-[10px]">
                          {payout.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Platform fee: 10% on all subscriber payments. Payouts via Stripe Express.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Content Tabs */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="bg-muted/50 w-full" data-testid="tabs-profile">
          <TabsTrigger value="agents" className="text-xs flex-1 gap-1.5">
            <Bot size={13} /> Agents
          </TabsTrigger>
          <TabsTrigger value="subscriptions" className="text-xs flex-1 gap-1.5">
            <Users size={13} /> Creators
          </TabsTrigger>
          <TabsTrigger value="liked" className="text-xs flex-1 gap-1.5">
            <Heart size={13} /> Liked
          </TabsTrigger>
          <TabsTrigger value="comments" className="text-xs flex-1 gap-1.5">
            <MessageSquare size={13} /> Comments
          </TabsTrigger>
          <TabsTrigger value="billing" className="text-xs flex-1 gap-1.5">
            <CreditCard size={13} /> Billing
          </TabsTrigger>
        </TabsList>

        {/* Agent Subscriptions Tab */}
        <TabsContent value="agents">
          {loadingAgentSubs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : agentSubs && agentSubs.length > 0 ? (
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {agentSubs.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 p-3.5">
                  <Link
                    href={sub.agent ? `/agents/${sub.agent.id}` : "#"}
                    className="flex items-center gap-3 flex-1 min-w-0 no-underline"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {sub.agent?.name || "Unknown Agent"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {sub.plan === "free" ? "Free" : `$${((sub.agent?.price || 0) / 100).toFixed(0)}/mo`}
                        {" \u00b7 "}{sub.status}
                      </p>
                    </div>
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs shrink-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Cancel this subscription?")) {
                        cancelSubMutation.mutate(sub.id);
                      }
                    }}
                    disabled={cancelSubMutation.isPending}
                  >
                    {cancelSubMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Cancel"}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <Bot size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-3">No agent subscriptions yet</p>
              <Link href="/agents">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  Browse agents <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* Creator Subscriptions Tab */}
        <TabsContent value="subscriptions">
          {loadingSubs ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : subscribedCreators && subscribedCreators.length > 0 ? (
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {subscribedCreators.map((creator) => (
                <Link
                  key={creator.id}
                  href={`/creators/${creator.id}`}
                  className="flex items-center gap-3 p-3.5 hover:bg-muted/50 transition-colors no-underline"
                  data-testid={`row-sub-creator-${creator.id}`}
                >
                  <img src={creator.avatar} alt={creator.name} className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground truncate">{creator.name}</span>
                      {creator.verified && <Shield size={12} className="text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{creator.bio}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-foreground">{formatNumber(creator.subscribers)}</p>
                    <p className="text-[10px] text-muted-foreground">subs</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <Users size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-3">Not subscribed to any creators yet</p>
              <Link href="/creators">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  Discover creators <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* Liked Posts Tab */}
        <TabsContent value="liked">
          {loadingLiked ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : likedPosts && likedPosts.length > 0 ? (
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {likedPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="block p-3.5 hover:bg-muted/50 transition-colors no-underline"
                  data-testid={`row-liked-post-${post.id}`}
                >
                  <h3 className="text-sm font-medium text-foreground mb-1 line-clamp-1">{post.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Heart size={11} className="text-red-400" />
                      {post.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare size={11} />
                      {post.commentCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {timeAgo(post.createdAt)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <Heart size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-3">No liked posts yet</p>
              <Link href="/feed">
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  Browse the feed <ArrowRight size={12} />
                </Button>
              </Link>
            </div>
          )}
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments">
          {loadingComments ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : myComments && myComments.length > 0 ? (
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              {myComments.map((comment) => (
                <Link
                  key={comment.id}
                  href={`/posts/${comment.postId}`}
                  className="block p-3.5 hover:bg-muted/50 transition-colors no-underline"
                  data-testid={`row-comment-${comment.id}`}
                >
                  <p className="text-sm text-foreground line-clamp-2">{comment.body}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock size={11} />
                    {timeAgo(comment.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <MessageSquare size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No comments yet</p>
            </div>
          )}
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          {loadingBilling ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : billingRecords && billingRecords.length > 0 ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-muted/50 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Date</span>
                <span>Description</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
              </div>
              {/* Table rows */}
              <div className="divide-y divide-border">
                {billingRecords.map((record) => (
                  <div key={record.id} className="grid grid-cols-4 gap-2 px-4 py-3 items-center text-sm">
                    <span className="text-xs text-muted-foreground">
                      {new Date(record.date).toLocaleDateString()}
                    </span>
                    <span className="text-foreground text-xs truncate">{record.description}</span>
                    <span className="text-right text-xs font-medium text-foreground">
                      {(record.amount / 100).toLocaleString("en-US", {
                        style: "currency",
                        currency: record.currency || "USD",
                      })}
                    </span>
                    <div className="text-right">
                      <Badge
                        variant={record.status === "paid" ? "secondary" : record.status === "pending" ? "outline" : "destructive"}
                        className="text-[10px]"
                      >
                        {record.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 rounded-lg border border-dashed border-border">
              <Receipt size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground mb-1">No payment history</p>
              <p className="text-xs text-muted-foreground">Your billing records will appear here.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
