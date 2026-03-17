import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Post, Creator } from "@shared/schema";
import { Heart, MessageCircle, Clock, Bookmark, TrendingUp, PenSquare, Tag, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";

function timeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function PostCard({ post, creators, onTagClick }: { post: Post; creators: Map<string, Creator>; onTagClick?: (tag: string) => void }) {
  const creator = creators.get(post.creatorId);

  return (
    <Link href={`/posts/${post.id}`} className="no-underline">
      <article
        className="group border border-border rounded-lg p-5 hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer"
        data-testid={`card-post-${post.id}`}
      >
        {/* Header: creator info + time */}
        <div className="flex items-center gap-3 mb-3">
          {creator && (
            <img
              src={creator.avatar}
              alt={creator.name}
              className="w-8 h-8 rounded-full bg-muted"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {creator?.name ?? "Unknown"}
            </p>
            <p className="text-xs text-muted-foreground">
              @{creator?.handle ?? "unknown"} · <Clock size={11} className="inline -mt-px" /> {timeAgo(post.createdAt)}
            </p>
          </div>
          {post.featured && (
            <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
              <TrendingUp size={10} />
              Featured
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="text-[15px] font-semibold text-foreground group-hover:text-primary transition-colors mb-2 line-clamp-2">
          {post.title}
        </h3>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {post.excerpt}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick?.(tag);
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer: likes & comments */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Heart size={13} />
            {post.likes}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={13} />
            {post.commentCount}
          </span>
          {post.visibility === "subscribers" && (
            <span className="flex items-center gap-1 ml-auto text-amber-500">
              <Bookmark size={13} />
              Subscribers only
            </span>
          )}
        </div>
      </article>
    </Link>
  );
}

export default function Feed() {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { data: posts, isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const { data: creators } = useQuery<Creator[]>({
    queryKey: ["/api/creators"],
  });

  const creatorsMap = new Map((creators ?? []).map((c) => [c.id, c]));

  // Extract popular tags from posts (sorted by frequency)
  const popularTags = useMemo(() => {
    if (!posts) return [];
    const tagCount = new Map<string, number>();
    posts.forEach((p) => p.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
    return Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag]) => tag);
  }, [posts]);

  // Filter posts by tag
  const filteredPosts = useMemo(() => {
    if (!activeTag) return posts ?? [];
    return (posts ?? []).filter((p) => p.tags.includes(activeTag));
  }, [posts, activeTag]);

  const featuredPosts = filteredPosts.filter((p) => p.featured);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight mb-1" data-testid="text-feed-title">Feed</h1>
          <p className="text-sm text-muted-foreground">
            Latest posts from creators — tutorials, announcements, and technical deep-dives
          </p>
        </div>
        <Link href="/new-post" className="no-underline shrink-0">
          <Button size="sm" className="h-8 text-xs gap-1.5" data-testid="button-new-post">
            <PenSquare size={13} />
            Write
          </Button>
        </Link>
      </div>

      {/* Tag filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6" data-testid="filter-tags">
        <Tag size={13} className="text-muted-foreground shrink-0" />
        <Button
          variant={!activeTag ? "default" : "outline"}
          size="sm"
          className="h-6 text-[11px] px-2.5"
          onClick={() => setActiveTag(null)}
          data-testid="button-tag-all"
        >
          All
        </Button>
        {popularTags.map((tag) => (
          <Button
            key={tag}
            variant={activeTag === tag ? "default" : "outline"}
            size="sm"
            className="h-6 text-[11px] px-2.5"
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            data-testid={`button-tag-${tag}`}
          >
            {tag}
          </Button>
        ))}
        {activeTag && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
            onClick={() => setActiveTag(null)}
            data-testid="button-clear-tag"
          >
            <XIcon size={11} />
            Clear
          </Button>
        )}
      </div>

      {/* Featured */}
      {featuredPosts.length > 0 && !activeTag && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} />
            Trending
          </h2>
          <div className="space-y-3">
            {featuredPosts.slice(0, 3).map((post) => (
              <PostCard key={post.id} post={post} creators={creatorsMap} onTagClick={setActiveTag} />
            ))}
          </div>
        </div>
      )}

      {/* All posts */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {activeTag ? `Tagged: ${activeTag}` : "Recent"}
        </h2>
        {postsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPosts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No posts found{activeTag ? ` tagged "${activeTag}"` : ""}</p>
                {activeTag && (
                  <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setActiveTag(null)}>
                    Show all posts
                  </Button>
                )}
              </div>
            ) : (
              filteredPosts.map((post) => (
                <PostCard key={post.id} post={post} creators={creatorsMap} onTagClick={setActiveTag} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
