import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { Post, Creator, Comment } from "@shared/schema";
import { Heart, MessageCircle, Clock, ArrowLeft, Send, Loader2, Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

function timeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Simple markdown-ish rendering (headers, bold, code blocks, lists, tables, line breaks)
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={i} className="bg-muted rounded-md p-4 text-sm overflow-x-auto my-3 font-mono">
            <code>{codeContent.join("\n")}</code>
          </pre>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Table
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line.split("|").filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) continue; // separator row
      if (!inTable) inTable = true;
      tableRows.push(cells);
      // Check if next line is not a table row
      if (i + 1 >= lines.length || !lines[i + 1].includes("|") || !lines[i + 1].trim().startsWith("|")) {
        elements.push(
          <div key={i} className="overflow-x-auto my-3">
            <table className="text-sm border-collapse w-full">
              <thead>
                <tr className="border-b border-border">
                  {tableRows[0]?.map((cell, ci) => (
                    <th key={ci} className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-border/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-2">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-semibold mt-6 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold mt-8 mb-3">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-bold mt-6 mb-4">{line.slice(2)}</h1>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-primary/40 pl-4 my-3 text-muted-foreground italic">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.startsWith("- **") || line.startsWith("- ")) {
      elements.push(
        <li key={i} className="ml-4 text-sm leading-relaxed list-disc"
          dangerouslySetInnerHTML={{
            __html: line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded font-mono">$1</code>')
          }}
        />
      );
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={i} className="ml-4 text-sm leading-relaxed list-decimal"
          dangerouslySetInnerHTML={{
            __html: line.replace(/^\d+\.\s/, "").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded font-mono">$1</code>')
          }}
        />
      );
    } else if (line === "---") {
      elements.push(<hr key={i} className="my-6 border-border" />);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-sm leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\*(.*?)\*/g, "<em>$1</em>").replace(/`(.*?)`/g, '<code class="text-xs bg-muted px-1 py-0.5 rounded font-mono">$1</code>')
          }}
        />
      );
    }
  }

  return <div className="space-y-1">{elements}</div>;
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");

  const { data: postData, isLoading } = useQuery<Post & { hasLiked: boolean; creator: Creator | null; isGated?: boolean }>({
    queryKey: ["/api/posts", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${id}`);
      return res.json();
    },
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: ["/api/posts", id, "comments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/posts/${id}/comments`);
      return res.json();
    },
  });

  const likeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/posts/${id}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts", id] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest("POST", `/api/posts/${id}/comments`, { body });
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts", id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!postData) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Post not found</p>
      </div>
    );
  }

  const { creator, hasLiked, isGated, ...post } = postData as Post & { hasLiked: boolean; creator: Creator | null; isGated?: boolean };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back link */}
      <Link href="/feed" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 no-underline">
        <ArrowLeft size={14} />
        Back to Feed
      </Link>

      {/* Author header */}
      <div className="flex items-center gap-3 mb-6">
        {creator && (
          <Link href={`/creators/${creator.id}`} className="no-underline">
            <img src={creator.avatar} alt={creator.name} className="w-10 h-10 rounded-full bg-muted" />
          </Link>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">{creator?.name ?? "Unknown"}</p>
          <p className="text-xs text-muted-foreground">
            @{creator?.handle} · <Clock size={11} className="inline -mt-px" /> {timeAgo(post.createdAt)}
          </p>
        </div>
        {post.visibility === "subscribers" && !isGated && (
          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
            <Lock size={10} /> Subscribers only
          </Badge>
        )}
      </div>

      {/* Gated content card */}
      {isGated ? (
        <>
          {/* Show excerpt */}
          <article className="mb-6">
            <p className="text-sm text-muted-foreground leading-relaxed italic">{post.body}</p>
          </article>

          {/* Gating card */}
          <div className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 p-8 text-center mb-8" data-testid="gating-card">
            <Lock size={28} className="mx-auto mb-3 text-amber-500" />
            <h3 className="text-base font-semibold text-foreground mb-2">This post is for subscribers only</h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
              Subscribe to {creator?.name ?? "this creator"} to unlock this and all subscriber-only content.
            </p>
            {creator && (
              <div className="flex items-center justify-center gap-3 mb-5">
                <img src={creator.avatar} alt={creator.name} className="w-10 h-10 rounded-full bg-muted" />
                <div className="text-left">
                  <p className="text-sm font-medium">{creator.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users size={11} /> {creator.subscribers} subscribers
                  </p>
                </div>
              </div>
            )}
            <Link href={creator ? `/creators/${creator.id}` : "/creators"} className="no-underline">
              <Button className="gap-1.5" data-testid="button-subscribe-cta">
                Subscribe
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* Post content */}
          <article className="mb-8">
            {renderMarkdown(post.body)}
          </article>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-6">
            {post.tags.map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>

          {/* Like + stats bar */}
          <div className="flex items-center gap-4 py-4 border-t border-b border-border mb-8">
            <Button
              variant={hasLiked ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => {
                if (!user) {
                  toast({ title: "Sign in to like posts", variant: "destructive" });
                  return;
                }
                likeMutation.mutate();
              }}
              disabled={likeMutation.isPending}
              data-testid="button-like"
            >
              <Heart size={14} fill={hasLiked ? "currentColor" : "none"} />
              {post.likes}
            </Button>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircle size={14} />
              {post.commentCount} comments
            </span>
          </div>

          {/* Comments section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Comments</h3>

            {/* Comment form */}
            {user ? (
              <div className="flex gap-3 mb-6">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                    {user.displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    className="min-h-[60px] text-sm resize-none"
                    data-testid="input-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      disabled={!commentText.trim() || commentMutation.isPending}
                      onClick={() => commentMutation.mutate(commentText.trim())}
                      data-testid="button-submit-comment"
                    >
                      {commentMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Comment
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 mb-6 border border-dashed border-border rounded-lg">
                <p className="text-sm text-muted-foreground mb-2">Sign in to join the discussion</p>
                <Link href="/auth" className="no-underline">
                  <Button size="sm" variant="outline" className="h-7 text-xs">Sign in</Button>
                </Link>
              </div>
            )}

            {/* Comments list */}
            <div className="space-y-4">
              {(comments ?? []).map((comment) => (
                <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-[9px] bg-muted font-medium">
                      {comment.authorName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{comment.authorName}</span>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="text-sm text-foreground/90 mt-0.5">{comment.body}</p>
                  </div>
                </div>
              ))}
              {(comments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No comments yet. Be the first to comment.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
