import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { SignInButton } from "@clerk/clerk-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Rocket, X, Zap } from "lucide-react";

export default function BecomeCreator() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Check if already a creator — redirect to dashboard
  const { data: existingCreator, isLoading: checkingCreator } = useQuery<{ id: string } | null>({
    queryKey: ["/api/creators/me"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/creators/me");
        return res.json();
      } catch { return null; }
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (existingCreator?.id) {
      toast({ title: "You already have a creator profile!" });
      navigate("/creator-dashboard");
    }
  }, [existingCreator]);

  const [handle, setHandle] = useState(user?.username ?? "");

  useEffect(() => {
    if (user?.username && !handle) {
      setHandle(user.username);
    }
  }, [user?.username]);

  const [bio, setBio] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/creators/me", {
        handle: handle.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
        bio,
        tags,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creators"] });
      toast({ title: "Creator profile created", description: "Connect Stripe to start earning" });
      navigate("/profile");
    },
    onError: (err: any) => {
      let message = "Failed to create profile";
      try {
        const body = err.message.includes(": ")
          ? err.message.split(": ").slice(1).join(": ")
          : err.message;
        const parsed = JSON.parse(body);
        message = parsed.message || message;
      } catch {}

      if (err.message?.startsWith("401")) {
        queryClient.setQueryData(["/api/auth/me"], null);
        toast({ title: "Session expired. Please sign in again." });
        return;
      }
      toast({ title: message, variant: "destructive" });
    },
  });

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 5) {
      setTags([...tags, t]);
      setTagInput("");
    }
  }

  if (authLoading || checkingCreator) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Loader2 size={24} className="animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Rocket size={32} className="mx-auto mb-4 text-primary" />
        <h2 className="text-lg font-semibold mb-2">Become a Creator</h2>
        <p className="text-sm text-muted-foreground mb-6">Sign in with Google or GitHub to get started.</p>
        <SignInButton mode="modal" forceRedirectUrl="/#/become-creator">
          <Button size="default" className="gap-2">
            <Zap size={14} />
            Sign in to continue
          </Button>
        </SignInButton>
      </div>
    );
  }

  const canSubmit =
    handle.trim().length >= 3 && bio.trim().length >= 10 && tags.length >= 1;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-32">
      <Link
        href="/feed"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 no-underline"
      >
        <ArrowLeft size={14} />
        Back
      </Link>

      <div className="mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <Rocket size={24} className="text-primary" />
        </div>
        <h1 className="text-xl font-semibold mb-1">Become a creator</h1>
        <p className="text-sm text-muted-foreground">
          Set up your creator profile to publish posts, share agents, and grow your audience.
          After creating your profile, connect Stripe to start accepting payments.
        </p>
      </div>

      <div className="space-y-5">
        {/* Display name (from account) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Display name
          </label>
          <Input
            value={user.displayName}
            disabled
            className="text-sm bg-muted/50"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Pulled from your account settings.
          </p>
        </div>

        {/* Handle */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Handle
          </label>
          <div className="flex items-center gap-0">
            <span className="text-sm text-muted-foreground px-3 py-2 border border-r-0 border-border rounded-l-md bg-muted/50">
              @
            </span>
            <Input
              value={handle}
              onChange={(e) =>
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
              }
              placeholder="yourhandle"
              className="text-sm rounded-l-none"
              maxLength={30}
              data-testid="input-handle"
            />
          </div>
        </div>

        {/* Bio */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Bio / 簡介
          </label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell people what you build — 告訴大家你在做什麼"
            className="text-sm min-h-[80px] resize-none"
            maxLength={300}
            data-testid="input-bio"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            {bio.length}/300
          </p>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Expertise tags (1-5)
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
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
                placeholder="e.g. devops, nlp, fintech"
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
              >
                Add
              </Button>
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          className="w-full h-10 text-sm font-medium gap-2"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          data-testid="button-create-profile"
        >
          {createMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Rocket size={14} />
          )}
          Create creator profile
        </Button>
      </div>
    </div>
  );
}
