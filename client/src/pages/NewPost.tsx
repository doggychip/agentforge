import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { SignInButton } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import type { Creator } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Loader2,
  Eye,
  Edit3,
  Lock,
  Globe,
  X,
} from "lucide-react";

export default function NewPost() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);

  // Check if user has a creator profile
  const { data: creatorProfile } = useQuery<Creator | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/creators/me");
        return await res.json();
      } catch {
        return null;
      }
    },
    enabled: !!user,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/posts", {
        title,
        body,
        excerpt: excerpt || undefined,
        visibility,
        tags,
      });
      return res.json();
    },
    onSuccess: (post) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Post published" });
      navigate(`/posts/${post.id}`);
    },
    onError: () => {
      toast({ title: "Failed to publish post", variant: "destructive" });
    },
  });

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff\u3400-\u4dbf-]/g, "");
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  // Not signed in
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Edit3 size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-lg font-semibold mb-2">Sign in to write</h1>
        <p className="text-sm text-muted-foreground mb-4">
          You need an account to publish posts on AgentForge.
        </p>
        <SignInButton mode="modal">
          <Button size="sm">Sign in</Button>
        </SignInButton>
      </div>
    );
  }

  // No creator profile yet — show setup prompt
  if (creatorProfile === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Edit3 size={40} className="mx-auto mb-4 text-muted-foreground opacity-40" />
        <h1 className="text-lg font-semibold mb-2">Become a creator</h1>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          You need a creator profile to publish posts. Set up your profile to start sharing with the community.
        </p>
        <Link href="/become-creator" className="no-underline">
          <Button size="sm">Set up creator profile</Button>
        </Link>
      </div>
    );
  }

  const canPublish = title.trim().length >= 3 && body.trim().length >= 10;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/feed"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground no-underline"
        >
          <ArrowLeft size={14} />
          Back to Feed
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setPreview(!preview)}
            data-testid="button-toggle-preview"
          >
            {preview ? <Edit3 size={13} /> : <Eye size={13} />}
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!canPublish || publishMutation.isPending}
            onClick={() => publishMutation.mutate()}
            data-testid="button-publish"
          >
            {publishMutation.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Send size={13} />
            )}
            Publish
          </Button>
        </div>
      </div>

      {preview ? (
        /* Preview mode */
        <article className="space-y-4">
          <h1 className="text-xl font-bold">{title || "Untitled"}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>By {creatorProfile?.name ?? user.displayName}</span>
            {visibility === "subscribers" && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Lock size={10} />
                Subscribers only
              </Badge>
            )}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {body || "Start writing..."}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-4">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </article>
      ) : (
        /* Edit mode */
        <div className="space-y-5">
          {/* Title */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Post title / 文章標題"
              className="text-lg font-semibold h-12 border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
              data-testid="input-title"
            />
          </div>

          {/* Body */}
          <div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your post in Markdown...&#10;&#10;用 Markdown 撰寫你的文章..."
              className="min-h-[320px] text-sm leading-relaxed resize-none border-0 px-0 focus-visible:ring-0"
              data-testid="input-body"
            />
          </div>

          {/* Excerpt (optional) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Excerpt / 摘要 (optional)
            </label>
            <Input
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short preview shown in the feed"
              className="text-sm"
              data-testid="input-excerpt"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Visibility / 可見性
            </label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger className="w-48 h-9 text-sm" data-testid="select-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">
                  <span className="flex items-center gap-1.5">
                    <Globe size={13} />
                    Public
                  </span>
                </SelectItem>
                <SelectItem value="subscribers">
                  <span className="flex items-center gap-1.5">
                    <Lock size={13} />
                    Subscribers only
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Tags (up to 5)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                  onClick={() => removeTag(tag)}
                >
                  {tag}
                  <X size={10} />
                </Badge>
              ))}
            </div>
            {tags.length < 5 && (
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add a tag"
                  className="text-sm h-8 max-w-[200px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  data-testid="input-tag"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={addTag}
                  data-testid="button-add-tag"
                >
                  Add
                </Button>
              </div>
            )}
          </div>

          {/* Markdown help */}
          <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            Supports Markdown: # headings, **bold**, `code`, ```code blocks```, &gt; blockquotes, - lists, | tables |
          </div>
        </div>
      )}
    </div>
  );
}
