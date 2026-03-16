import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Creator, Post, Comment } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User as UserIcon, Heart, MessageSquare, Users, Bot,
  Shield, ArrowRight, PenSquare, Clock, ExternalLink,
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

      {/* Content Tabs */}
      <Tabs defaultValue="subscriptions" className="space-y-4">
        <TabsList className="bg-muted/50 w-full" data-testid="tabs-profile">
          <TabsTrigger value="subscriptions" className="text-xs flex-1 gap-1.5">
            <Users size={13} /> Subscriptions
          </TabsTrigger>
          <TabsTrigger value="liked" className="text-xs flex-1 gap-1.5">
            <Heart size={13} /> Liked
          </TabsTrigger>
          <TabsTrigger value="comments" className="text-xs flex-1 gap-1.5">
            <MessageSquare size={13} /> Comments
          </TabsTrigger>
        </TabsList>

        {/* Subscriptions Tab */}
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
      </Tabs>
    </div>
  );
}
