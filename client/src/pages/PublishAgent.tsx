import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Bot, X } from "lucide-react";

export default function PublishAgent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [category, setCategory] = useState("agent");
  const [pricing, setPricing] = useState("free");
  const [price, setPrice] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [hfModelId, setHfModelId] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        name: name.trim(),
        description: description.trim(),
        longDescription: longDescription.trim() || null,
        category,
        pricing,
        price: pricing === "free" ? null : Math.round(parseFloat(price) * 100),
        tags,
        apiEndpoint: apiEndpoint.trim() || null,
        hfModelId: hfModelId.trim() || null,
      };
      const res = await apiRequest("POST", "/api/agents", body);
      return res.json();
    },
    onSuccess: (agent) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me"] });
      toast({ title: "Agent published!", description: `${agent.name} is now live.` });
      navigate(`/agents/${agent.id}`);
    },
    onError: (err: any) => {
      let message = "Failed to publish agent";
      try {
        const body = err.message.includes(": ")
          ? err.message.split(": ").slice(1).join(": ")
          : err.message;
        const parsed = JSON.parse(body);
        message = parsed.message || message;
      } catch {}

      if (err.message?.startsWith("401")) {
        queryClient.setQueryData(["/api/auth/me"], null);
        navigate("/auth");
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

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">Sign in first to publish an agent.</p>
        <Link href="/auth" className="no-underline">
          <Button size="sm">Sign in</Button>
        </Link>
      </div>
    );
  }

  const canSubmit =
    name.trim().length >= 2 &&
    description.trim().length >= 10 &&
    tags.length >= 1 &&
    (pricing === "free" || (price && parseFloat(price) > 0));

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-32">
      <Link
        href="/creator-dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 no-underline"
      >
        <ArrowLeft size={14} />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
          <Bot size={24} className="text-primary" />
        </div>
        <h1 className="text-xl font-semibold mb-1">Publish an Agent</h1>
        <p className="text-sm text-muted-foreground">
          Fill in the details below to publish your agent on AgentForge.
        </p>
      </div>

      <div className="space-y-5">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Agent Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome Agent"
            className="text-sm"
            maxLength={80}
            data-testid="input-agent-name"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Short Description
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief description of what your agent does"
            className="text-sm min-h-[60px] resize-none"
            maxLength={300}
            data-testid="input-agent-description"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{description.length}/300</p>
        </div>

        {/* Long Description */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Long Description (optional)
          </label>
          <Textarea
            value={longDescription}
            onChange={(e) => setLongDescription(e.target.value)}
            placeholder="Detailed description, usage instructions, etc."
            className="text-sm min-h-[100px] resize-none"
            maxLength={2000}
            data-testid="input-agent-long-description"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="select-category"
          >
            <option value="agent">Agent</option>
            <option value="tool">Tool</option>
            <option value="content">Content</option>
            <option value="api">API</option>
          </select>
        </div>

        {/* Pricing */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Pricing Model
          </label>
          <select
            value={pricing}
            onChange={(e) => setPricing(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="select-pricing"
          >
            <option value="free">Free</option>
            <option value="subscription">Subscription</option>
            <option value="usage">Usage-based</option>
            <option value="one-time">One-time Purchase</option>
          </select>
        </div>

        {/* Price (shown when not free) */}
        {pricing !== "free" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Price (USD)
            </label>
            <div className="flex items-center gap-0">
              <span className="text-sm text-muted-foreground px-3 py-2 border border-r-0 border-border rounded-l-md bg-muted/50">
                $
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="9.99"
                className="text-sm rounded-l-none"
                data-testid="input-price"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {pricing === "subscription" && "Monthly subscription price"}
              {pricing === "usage" && "Price per API call"}
              {pricing === "one-time" && "One-time purchase price"}
            </p>
          </div>
        )}

        {/* Tags */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Tags (1-5)
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
                placeholder="e.g. nlp, chatbot, devops"
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

        {/* API Endpoint (optional) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            API Endpoint (optional)
          </label>
          <Input
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            placeholder="https://api.example.com/v1/agent"
            className="text-sm"
            data-testid="input-api-endpoint"
          />
        </div>

        {/* HF Model ID (optional) */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Hugging Face Model ID (optional)
          </label>
          <Input
            value={hfModelId}
            onChange={(e) => setHfModelId(e.target.value)}
            placeholder="meta-llama/Llama-3-8B"
            className="text-sm"
            data-testid="input-hf-model-id"
          />
        </div>

        {/* Submit */}
        <Button
          className="w-full h-10 text-sm font-medium gap-2"
          disabled={!canSubmit || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          data-testid="button-publish-agent"
        >
          {createMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Bot size={14} />
          )}
          Publish Agent
        </Button>
      </div>
    </div>
  );
}
