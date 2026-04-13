import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Rocket, X } from "lucide-react";

export default function BecomeCreator() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [, navigate] = useLocation();

  const [handle, setHandle] = useState(user?.username ?? "");
    const [bio, setBio] = useState("");
    const [tagInput, setTagInput] = useState("");
    const [tags, setTags] = useState<string[]>([]);

  // Bug fix: sync handle when user data loads asynchronously
  useEffect(() => {
        if (user?.username && !handle) {
                setHandle(user.username);
        }
  }, [user?.username]);

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
                // Bug fix: parse error message properly (API returns JSON in error string)
          let message = "Failed to create profile";
                try {
                          if (err?.message) {
                                      const colonIdx = err.message.indexOf(": ");
                                      if (colonIdx !== -1) {
                                                    const statusStr = err.message.substring(0, colonIdx);
                                                    const bodyStr = err.message.substring(colonIdx + 2);
                                                    // Check if it's a 401 - redirect to auth
                                        if (statusStr === "401") {
                                                        queryClient.setQueryData(["/api/auth/me"], null);
                                                        toast({ title: "Session expired. Please sign in again.", variant: "destructive" });
                                                        navigate("/auth");
                                                        return;
                                        }
                                                    try {
                                                                    const parsed = JSON.parse(bodyStr);
                                                                    message = parsed.message || parsed.error || bodyStr;
                                                    } catch {
                                                                    message = bodyStr;
                                                    }
                                      } else {
                                                    message = err.message;
                                      }
                          }
                } catch {
                          // fallback
                }
                toast({
                          title: message,
                          variant: "destructive",
                });
        },
  });

  function addTag() {
        const t = tagInput.trim().toLowerCase();
        if (t && !tags.includes(t) && tags.length < 5) {
                setTags([...tags, t]);
                setTagInput("");
        }
  }

  if (!user) {
        return (
                <div className="mx-auto max-w-md px-4 py-16 text-center">
                        <p className="text-sm text-muted-foreground mb-4">Sign in first to become a creator.</p>p>
                        <Link href="/auth" className="no-underline">
                                  <Button size="sm">Sign in</Button>Button>
                        </Link>Link>
                </div>div>
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
                        <ArrowLeft size={14} /> Back
                </Link>Link>
          
                <div className="mb-8">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                                  <Rocket size={24} className="text-primary" />
                        </div>div>
                        <h1 className="text-xl font-semibold mb-1">Become a creator</h1>h1>
                        <p className="text-sm text-muted-foreground">
                                  Set up your creator profile to publish posts, share agents, and grow your audience. After
                                  creating your profile, connect Stripe to start accepting payments.
                        </p>p>
                </div>div>
          
                <div className="space-y-5">
                  {/* Display name (from account) */}
                        <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                              Display name
                                  </label>label>
                                  <Input value={user.displayName} disabled className="text-sm bg-muted/50" />
                                  <p className="text-[11px] text-muted-foreground mt-1">
                                              Pulled from your account settings.
                                  </p>p>
                        </div>div>
                
                  {/* Handle */}
                        <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                              Handle
                                  </label>label>
                                  <div className="flex items-center gap-0">
                                              <span className="text-sm text-muted-foreground px-3 py-2 border border-r-0 border-border rounded-l-md bg-muted/50">
                                                            @
                                              </span>span>
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
                                  </div>div>
                        </div>div>
                
                  {/* Bio */}
                        <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                              Bio / 簡介
                                  </label>label>
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
                                  </p>p>
                        </div>div>
                
                  {/* Tags */}
                        <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                              Expertise tags (1-5)
                                  </label>label>
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {tags.map((tag) => (
                          <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                                            onClick={() => setTags(tags.filter((t) => t !== tag))}
                                          >
                            {tag} <X size={10} />
                          </Badge>Badge>
                        ))}
                                  </div>div>
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
                                      </Button>Button>
                        </div>div>
                                  )}
                        </div>div>
                
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
                        </Button>Button>
                </div>div>
          </div>div>
        );
}</div>
