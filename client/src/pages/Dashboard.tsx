import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Creator, Agent } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users, Bot, Download, DollarSign, Star, Plus,
  Pencil, Trash2, ExternalLink, PenSquare, Loader2,
  X, Rocket, CreditCard,
} from "lucide-react";

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function formatPrice(price: number | null, pricing: string) {
  if (pricing === "free" || !price) return "Free";
  if (pricing === "usage") return `$${(price / 100).toFixed(2)}/call`;
  return `$${(price / 100).toFixed(0)}/mo`;
}

const categoryIcons: Record<string, React.ReactNode> = {
  agent: <Bot size={14} />,
  tool: <Bot size={14} />,
  content: <Bot size={14} />,
  api: <Bot size={14} />,
};

interface AgentFormData {
  name: string;
  description: string;
  longDescription: string;
  category: string;
  pricing: string;
  price: string;
  tags: string[];
  apiEndpoint: string;
}

const emptyForm: AgentFormData = {
  name: "",
  description: "",
  longDescription: "",
  category: "agent",
  pricing: "free",
  price: "",
  tags: [],
  apiEndpoint: "",
};

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState<AgentFormData>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);

  // Queries
  const { data: creatorProfile, isLoading: loadingCreator } = useQuery<Creator | null>({
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

  const { data: dashboardStats } = useQuery<{
    subscribers: number;
    agentCount: number;
    totalDownloads: number;
    totalStars: number;
  }>({
    queryKey: ["/api/creators/me/dashboard-stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/creators/me/dashboard-stats");
      return res.json();
    },
    enabled: !!user && !!creatorProfile,
  });

  const { data: myAgents, isLoading: loadingAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents", { creator: creatorProfile?.id }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/agents?creator=${creatorProfile!.id}`);
      return res.json();
    },
    enabled: !!user && !!creatorProfile,
  });

  const { data: stripeStatus } = useQuery<{
    connected: boolean;
    onboarded: boolean;
  }>({
    queryKey: ["/api/stripe/connect/status"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/stripe/connect/status");
        return res.json();
      } catch {
        return { connected: false, onboarded: false };
      }
    },
    enabled: !!user && !!creatorProfile,
  });

  const { data: earnings } = useQuery<{
    balance: { available: number; pending: number };
    currency: string;
  }>({
    queryKey: ["/api/stripe/connect/earnings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stripe/connect/earnings");
      return res.json();
    },
    enabled: !!user && !!creatorProfile && !!stripeStatus?.onboarded,
  });

  // Mutations
  const createAgentMutation = useMutation({
    mutationFn: async (data: AgentFormData) => {
      const body: any = {
        name: data.name,
        description: data.description,
        longDescription: data.longDescription || null,
        category: data.category,
        pricing: data.pricing,
        price: data.pricing !== "free" && data.price ? Math.round(parseFloat(data.price) * 100) : null,
        tags: data.tags,
        apiEndpoint: data.apiEndpoint || null,
      };
      const res = await apiRequest("POST", "/api/creators/me/agents", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Agent created", description: "Your new agent has been published." });
      setDialogOpen(false);
      setFormData(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me/dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create agent", variant: "destructive" });
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AgentFormData }) => {
      const body: any = {
        name: data.name,
        description: data.description,
        longDescription: data.longDescription || null,
        category: data.category,
        pricing: data.pricing,
        price: data.pricing !== "free" && data.price ? Math.round(parseFloat(data.price) * 100) : null,
        tags: data.tags,
        apiEndpoint: data.apiEndpoint || null,
      };
      const res = await apiRequest("PUT", `/api/creators/me/agents/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Agent updated", description: "Changes saved." });
      setDialogOpen(false);
      setEditingAgent(null);
      setFormData(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me/dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update agent", variant: "destructive" });
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/creators/me/agents/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Agent deleted", description: "The agent has been removed." });
      setDeleteAgent(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/creators/me/dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete agent", variant: "destructive" });
    },
  });

  // Helpers
  function openCreateDialog() {
    setEditingAgent(null);
    setFormData(emptyForm);
    setTagInput("");
    setDialogOpen(true);
  }

  function openEditDialog(agent: Agent) {
    setEditingAgent(agent);
    setFormData({
      name: agent.name,
      description: agent.description,
      longDescription: agent.longDescription || "",
      category: agent.category,
      pricing: agent.pricing,
      price: agent.price ? (agent.price / 100).toString() : "",
      tags: agent.tags,
      apiEndpoint: agent.apiEndpoint || "",
    });
    setTagInput("");
    setDialogOpen(true);
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !formData.tags.includes(t) && formData.tags.length < 5) {
      setFormData({ ...formData, tags: [...formData.tags, t] });
      setTagInput("");
    }
  }

  function handleSubmit() {
    if (editingAgent) {
      updateAgentMutation.mutate({ id: editingAgent.id, data: formData });
    } else {
      createAgentMutation.mutate(formData);
    }
  }

  const isSaving = createAgentMutation.isPending || updateAgentMutation.isPending;
  const canSubmit = formData.name.trim().length > 0 && formData.description.trim().length > 0;

  // Auth guard
  if (authLoading || loadingCreator) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  if (!creatorProfile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Rocket size={28} className="text-primary" />
        </div>
        <h1 className="text-xl font-semibold mb-2" data-testid="heading-become-creator">Become a Creator</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
          Set up your creator profile to publish agents, write posts, and manage your dashboard.
        </p>
        <Link href="/become-creator">
          <Button className="gap-2" data-testid="button-become-creator">
            <Rocket size={14} />
            Get Started
          </Button>
        </Link>
      </div>
    );
  }

  const stats = dashboardStats ?? { subscribers: 0, agentCount: 0, totalDownloads: 0, totalStars: 0 };
  const agents = myAgents ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-foreground" data-testid="heading-dashboard">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/new-post">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-new-post">
              <PenSquare size={13} />
              New Post
            </Button>
          </Link>
          <Link href={`/creators/${creatorProfile.id}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-view-profile">
              <ExternalLink size={13} />
              Public Profile
            </Button>
          </Link>
          {stripeStatus?.onboarded && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-stripe-dashboard"
              onClick={async () => {
                try {
                  const res = await apiRequest("POST", "/api/stripe/connect/onboard");
                  const data = await res.json();
                  if (data.url) window.open(data.url, "_blank");
                } catch {}
              }}
            >
              <CreditCard size={13} />
              Stripe
            </Button>
          )}
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8" data-testid="section-stats">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Subscribers</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-subscribers">{formatNumber(stats.subscribers)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={14} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-agents">{formatNumber(stats.agentCount)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Download size={14} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Downloads</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-downloads">{formatNumber(stats.totalDownloads)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Earnings</span>
          </div>
          <p className="text-lg font-bold text-foreground" data-testid="stat-earnings">
            {stripeStatus?.onboarded && earnings
              ? `$${((earnings.balance.available + earnings.balance.pending) / 100).toFixed(2)}`
              : "--"}
          </p>
        </div>
      </div>

      {/* My Agents */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">My Agents</h2>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreateDialog} data-testid="button-add-agent">
            <Plus size={13} />
            Add Agent
          </Button>
        </div>

        {loadingAgents ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-dashed border-border" data-testid="empty-agents">
            <Bot size={28} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground mb-3">No agents published yet</p>
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={openCreateDialog}>
              <Plus size={12} />
              Create your first agent
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border" data-testid="list-agents">
            {agents.map((agent) => (
              <div key={agent.id} className="flex items-center gap-3 p-3.5" data-testid={`agent-row-${agent.id}`}>
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                  {categoryIcons[agent.category] || <Bot size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{agent.name}</span>
                    <Badge variant="secondary" className="text-[10px] font-medium uppercase tracking-wider shrink-0">
                      {agent.category}
                    </Badge>
                    <span className={`text-[10px] font-semibold shrink-0 ${agent.pricing === "free" ? "text-emerald-500" : "text-primary"}`}>
                      {formatPrice(agent.price, agent.pricing)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star size={11} className="text-yellow-500" />
                      {formatNumber(agent.stars)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Download size={11} />
                      {formatNumber(agent.downloads)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(agent)}
                    data-testid={`button-edit-${agent.id}`}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteAgent(agent)}
                    data-testid={`button-delete-${agent.id}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Agent Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDialogOpen(false);
          setEditingAgent(null);
          setFormData(emptyForm);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-agent-form">
          <DialogHeader>
            <DialogTitle className="text-base">{editingAgent ? "Edit Agent" : "Add Agent"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="My Agent"
                className="text-sm"
                data-testid="input-agent-name"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description *</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of what this agent does"
                className="text-sm min-h-[60px] resize-none"
                data-testid="input-agent-description"
              />
            </div>

            {/* Long Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Long Description</label>
              <Textarea
                value={formData.longDescription}
                onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
                placeholder="Detailed description (optional)"
                className="text-sm min-h-[80px] resize-none"
                data-testid="input-agent-long-description"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                <SelectTrigger className="text-sm" data-testid="select-agent-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="tool">Tool</SelectItem>
                  <SelectItem value="content">Content</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pricing */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Pricing</label>
              <Select value={formData.pricing} onValueChange={(v) => setFormData({ ...formData, pricing: v })}>
                <SelectTrigger className="text-sm" data-testid="select-agent-pricing">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="usage">Usage-based</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Price (only shown if pricing != free) */}
            {formData.pricing !== "free" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Price (USD) {formData.pricing === "subscription" ? "/ month" : "/ call"}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="9.99"
                  className="text-sm"
                  data-testid="input-agent-price"
                />
              </div>
            )}

            {/* Tags */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tags (up to 5)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs gap-1 cursor-pointer hover:bg-destructive/10"
                    onClick={() => setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) })}
                  >
                    {tag}
                    <X size={10} />
                  </Badge>
                ))}
              </div>
              {formData.tags.length < 5 && (
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. devops, nlp"
                    className="text-sm h-8 max-w-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    data-testid="input-agent-tag"
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addTag}>
                    Add
                  </Button>
                </div>
              )}
            </div>

            {/* API Endpoint */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">API Endpoint</label>
              <Input
                value={formData.apiEndpoint}
                onChange={(e) => setFormData({ ...formData, apiEndpoint: e.target.value })}
                placeholder="https://api.example.com/agent"
                className="text-sm"
                data-testid="input-agent-api-endpoint"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSaving}
              className="text-sm gap-2"
              data-testid="button-save-agent"
            >
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              {editingAgent ? "Save Changes" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAgent} onOpenChange={(open) => { if (!open) setDeleteAgent(null); }}>
        <AlertDialogContent data-testid="dialog-delete-agent">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteAgent?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAgent && deleteAgentMutation.mutate(deleteAgent.id)}
              disabled={deleteAgentMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteAgentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
