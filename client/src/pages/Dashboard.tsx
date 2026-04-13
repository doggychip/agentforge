import { useState, useMemo } from "react";
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
import { AgentAvatar } from "@/components/AgentAvatar";
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
  X, Rocket, CreditCard, TrendingUp, TrendingDown,
  MessageSquare, ArrowUpDown, ChevronDown, ChevronUp,
  Wrench, FileText, Globe, BarChart3, Trophy, Rss, Github,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Helpers ─────────────────────────────────────────────────

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
  tool: <Wrench size={14} />,
  content: <FileText size={14} />,
  api: <Globe size={14} />,
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Types ───────────────────────────────────────────────────

interface AgentBreakdown {
  id: string;
  name: string;
  category: string;
  pricing: string;
  price: number | null;
  stars: number;
  downloads: number;
  reviewCount: number;
  avgRating: number;
}

interface DashboardStats {
  subscribers: number;
  agentCount: number;
  totalDownloads: number;
  totalStars: number;
  totalReviews: number;
  avgRating: number;
  agentBreakdown: AgentBreakdown[];
  categoryDistribution: Record<string, number>;
  pricingDistribution: Record<string, number>;
  topAgent: { name: string; downloads: number } | null;
  downloadsTrend: number[];
  subscribersTrend: number[];
  starsTrend: number[];
}

interface AgentFormData {
  name: string;
  description: string;
  longDescription: string;
  category: string;
  pricing: string;
  price: string;
  tags: string[];
  apiEndpoint: string;
  hfSpaceUrl: string;
  hfModelId: string;
  backendType: string;
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
  hfSpaceUrl: "",
  hfModelId: "",
  backendType: "self-hosted",
};

type SortKey = "name" | "downloads" | "stars" | "reviewCount" | "avgRating" | "pricing";

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ icon, iconBg, label, value, trend, testId }: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  trend?: number[];
  testId: string;
}) {
  const trendPct = useMemo(() => {
    if (!trend || trend.length < 2) return null;
    const first = trend.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const last = trend.slice(-3).reduce((s, v) => s + v, 0) / 3;
    if (first === 0) return null;
    return Math.round(((last - first) / first) * 100);
  }, [trend]);

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid={testId}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        {trendPct !== null && (
          <span className={`ml-auto flex items-center gap-0.5 text-[10px] font-medium ${trendPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {trendPct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(trendPct)}%
          </span>
        )}
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function MiniStarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={10}
          className={i <= Math.round(rating) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/20"}
        />
      ))}
    </div>
  );
}

function DistributionBar({ items, colors }: {
  items: [string, number][];
  colors: Record<string, string>;
}) {
  const total = items.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-muted">
        {items.map(([key, val]) => (
          <div
            key={key}
            className={`${colors[key] || "bg-muted-foreground/30"} transition-all`}
            style={{ width: `${(val / total) * 100}%` }}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map(([key, val]) => (
          <span key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`w-2 h-2 rounded-full ${colors[key] || "bg-muted-foreground/30"}`} />
            <span className="capitalize">{key}</span>
            <span className="font-medium text-foreground">{val}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Custom Recharts Tooltip ─────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className="font-medium text-foreground">{formatNumber(payload[0].value)}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function Dashboard() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [formData, setFormData] = useState<AgentFormData>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("downloads");
  const [sortAsc, setSortAsc] = useState(false);

  // ─── Queries ─────────────────────────────────────────────

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

  const { data: dashboardStats } = useQuery<DashboardStats>({
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

  const { data: contentSources } = useQuery<{
    id: string; name: string; url: string; type: string;
    language: string; curatorId: string; category: string; active: boolean;
  }[]>({
    queryKey: ["/api/content-sources"],
  });

  // ─── Mutations ───────────────────────────────────────────

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
        hfSpaceUrl: data.hfSpaceUrl || null,
        hfModelId: data.hfModelId || null,
        backendType: data.backendType,
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
        hfSpaceUrl: data.hfSpaceUrl || null,
        hfModelId: data.hfModelId || null,
        backendType: data.backendType,
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

  // ─── Dialog helpers ──────────────────────────────────────

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
      hfSpaceUrl: agent.hfSpaceUrl || "",
      hfModelId: agent.hfModelId || "",
      backendType: agent.backendType || "self-hosted",
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

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const isSaving = createAgentMutation.isPending || updateAgentMutation.isPending;
  const canSubmit = formData.name.trim().length > 0 && formData.description.trim().length > 0;

  // ─── Derived data ────────────────────────────────────────

  const stats = dashboardStats ?? {
    subscribers: 0, agentCount: 0, totalDownloads: 0, totalStars: 0,
    totalReviews: 0, avgRating: 0,
    agentBreakdown: [], categoryDistribution: {}, pricingDistribution: {},
    topAgent: null, downloadsTrend: [], subscribersTrend: [], starsTrend: [],
  };

  const agents = myAgents ?? [];

  const sortedBreakdown = useMemo(() => {
    const items = [...(stats.agentBreakdown || [])];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "pricing") cmp = a.pricing.localeCompare(b.pricing);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    return items;
  }, [stats.agentBreakdown, sortKey, sortAsc]);

  const maxDownloads = useMemo(
    () => Math.max(1, ...sortedBreakdown.map((a) => a.downloads)),
    [sortedBreakdown]
  );

  const chartData = useMemo(() => {
    return stats.downloadsTrend.map((val, i) => ({
      day: DAY_LABELS[i] || `D${i + 1}`,
      downloads: val,
    }));
  }, [stats.downloadsTrend]);

  const catColors: Record<string, string> = {
    agent: "bg-primary", tool: "bg-blue-500", content: "bg-violet-500", api: "bg-amber-500",
  };

  const pricingColors: Record<string, string> = {
    free: "bg-emerald-500", subscription: "bg-blue-500", usage: "bg-violet-500",
  };

  // ─── Auth guard ──────────────────────────────────────────

  if (authLoading || loadingCreator) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
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

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header + Quick Actions */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-xl font-bold text-foreground" data-testid="heading-dashboard">Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
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
          {stripeStatus?.onboarded ? (
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
              Stripe Dashboard
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" data-testid="button-connect-stripe"
              onClick={async () => {
                try {
                  const res = await apiRequest("POST", "/api/stripe/connect/onboard");
                  const data = await res.json();
                  if (data.url) window.open(data.url, "_blank");
                } catch {
                  toast({ title: "Error", description: "Failed to start Stripe setup", variant: "destructive" });
                }
              }}
            >
              <CreditCard size={13} />
              Connect Stripe
            </Button>
          )}
        </div>
      </div>

      {/* ─── 1. Stats Grid ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6" data-testid="section-stats">
        <StatCard
          icon={<Users size={14} className="text-blue-600 dark:text-blue-400" />}
          iconBg="bg-blue-500/10"
          label="Subscribers"
          value={formatNumber(stats.subscribers)}
          trend={stats.subscribersTrend}
          testId="stat-subscribers"
        />
        <StatCard
          icon={<Bot size={14} className="text-primary" />}
          iconBg="bg-primary/10"
          label="Agents"
          value={formatNumber(stats.agentCount)}
          testId="stat-agents"
        />
        <StatCard
          icon={<Download size={14} className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          label="Downloads"
          value={formatNumber(stats.totalDownloads)}
          trend={stats.downloadsTrend}
          testId="stat-downloads"
        />
        <StatCard
          icon={<Star size={14} className="text-amber-500" />}
          iconBg="bg-amber-500/10"
          label="Stars"
          value={formatNumber(stats.totalStars)}
          trend={stats.starsTrend}
          testId="stat-stars"
        />
        <StatCard
          icon={<MessageSquare size={14} className="text-violet-600 dark:text-violet-400" />}
          iconBg="bg-violet-500/10"
          label="Reviews"
          value={formatNumber(stats.totalReviews)}
          testId="stat-reviews"
        />
        <StatCard
          icon={<DollarSign size={14} className="text-emerald-600 dark:text-emerald-400" />}
          iconBg="bg-emerald-500/10"
          label="Earnings"
          value={
            stripeStatus?.onboarded && earnings
              ? `$${((earnings.balance.available + earnings.balance.pending) / 100).toFixed(2)}`
              : "--"
          }
          testId="stat-earnings"
        />
      </div>

      {/* ─── 2. Downloads Trend + Top Agent ──────────────────── */}
      {chartData.length > 0 && stats.totalDownloads > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {/* Chart */}
          <div className="sm:col-span-2 rounded-lg border border-border bg-card p-4" data-testid="section-downloads-chart">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <BarChart3 size={14} className="text-primary" />
                Downloads — Last 7 Days
              </h2>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="dlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="downloads"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#dlGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sidebar: Top Agent + Avg Rating */}
          <div className="space-y-3">
            {stats.topAgent && (
              <div className="rounded-lg border border-border bg-card p-4" data-testid="section-top-agent">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trophy size={13} className="text-amber-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Agent</span>
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{stats.topAgent.name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Download size={11} /> {formatNumber(stats.topAgent.downloads)} downloads
                </p>
              </div>
            )}
            {stats.avgRating > 0 && (
              <div className="rounded-lg border border-border bg-card p-4" data-testid="section-avg-rating">
                <div className="flex items-center gap-1.5 mb-2">
                  <Star size={13} className="text-amber-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Rating</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-foreground">{stats.avgRating.toFixed(1)}</span>
                  <MiniStarRating rating={stats.avgRating} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">from {stats.totalReviews} reviews</p>
              </div>
            )}
            {/* Earnings breakdown when Stripe connected */}
            {stripeStatus?.onboarded && earnings && (
              <div className="rounded-lg border border-border bg-card p-4" data-testid="section-earnings-detail">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign size={13} className="text-emerald-500" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Available</span>
                    <span className="font-medium text-emerald-500">${(earnings.balance.available / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium text-foreground">${(earnings.balance.pending / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 3. Category & Pricing Distribution ──────────────── */}
      {agents.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card p-4" data-testid="section-category-dist">
            <h3 className="text-xs font-semibold text-foreground mb-3">Category Distribution</h3>
            <DistributionBar
              items={Object.entries(stats.categoryDistribution).sort((a, b) => b[1] - a[1])}
              colors={catColors}
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4" data-testid="section-pricing-dist">
            <h3 className="text-xs font-semibold text-foreground mb-3">Pricing Distribution</h3>
            <DistributionBar
              items={Object.entries(stats.pricingDistribution).sort((a, b) => b[1] - a[1])}
              colors={pricingColors}
            />
          </div>
        </div>
      )}

      {/* ─── 4. Agent Performance Table ──────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Agent Performance</h2>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreateDialog} data-testid="button-add-agent">
            <Plus size={13} />
            Add Agent
          </Button>
        </div>

        {loadingAgents ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
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
          <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="table-agents">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_70px_90px_80px_70px_80px_60px] gap-2 px-3 py-2 border-b border-border bg-muted/50 text-[10px] text-muted-foreground uppercase tracking-wider">
              <SortHeader label="Name" sortKey="name" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <span>Category</span>
              <SortHeader label="Downloads" sortKey="downloads" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Stars" sortKey="stars" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Reviews" sortKey="reviewCount" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <SortHeader label="Rating" sortKey="avgRating" current={sortKey} asc={sortAsc} onSort={toggleSort} />
              <span className="text-right">Actions</span>
            </div>

            {/* Table Rows */}
            {sortedBreakdown.map((ab) => {
              const agent = agents.find((a) => a.id === ab.id);
              return (
                <div
                  key={ab.id}
                  className="grid grid-cols-[1fr_70px_90px_80px_70px_80px_60px] gap-2 px-3 py-2.5 border-b border-border last:border-b-0 items-center text-xs hover:bg-muted/30 transition-colors"
                  data-testid={`agent-row-${ab.id}`}
                >
                  {/* Name + pricing badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    <AgentAvatar name={ab.name} className="w-7 h-7" />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground truncate block text-[13px]">{ab.name}</span>
                      <span className={`text-[10px] font-semibold ${
                        ab.pricing === "free" ? "text-emerald-500" :
                        ab.pricing === "subscription" ? "text-blue-500" : "text-violet-500"
                      }`}>
                        {formatPrice(ab.price, ab.pricing)}
                      </span>
                    </div>
                  </div>

                  {/* Category */}
                  <Badge variant="secondary" className="text-[9px] font-medium uppercase tracking-wider w-fit">
                    {ab.category}
                  </Badge>

                  {/* Downloads with bar */}
                  <div className="space-y-1">
                    <span className="font-medium text-foreground">{formatNumber(ab.downloads)}</span>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(ab.downloads / maxDownloads) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Stars */}
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Star size={10} className="text-amber-500 fill-amber-500" />
                    <span className="font-medium text-foreground">{formatNumber(ab.stars)}</span>
                  </span>

                  {/* Reviews */}
                  <span className="text-muted-foreground">{ab.reviewCount}</span>

                  {/* Rating */}
                  <div>
                    {ab.avgRating > 0 ? (
                      <div className="flex items-center gap-1">
                        <MiniStarRating rating={ab.avgRating} />
                        <span className="text-[10px] text-muted-foreground">{ab.avgRating.toFixed(1)}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-0.5">
                    {agent && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(agent)}
                          data-testid={`button-edit-${ab.id}`}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteAgent(agent)}
                          data-testid={`button-delete-${ab.id}`}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Content Sources ─────────────────────────────────── */}
      {contentSources && contentSources.length > 0 && (
        <div className="mt-8" data-testid="section-content-sources">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Rss size={14} className="text-muted-foreground" />
            Content Sources
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            RSS feeds and APIs powering the curated content bots.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {contentSources.map((src) => {
              const langLabel = src.language === "en" ? "EN" : src.language === "zh" ? "中文" : "日本語";
              const langColor = src.language === "en" ? "bg-blue-500/10 text-blue-600" : src.language === "zh" ? "bg-red-500/10 text-red-600" : "bg-purple-500/10 text-purple-600";
              const TypeIcon = src.type === "github" ? Github : src.type === "rss" ? Rss : Globe;
              const curatorNames: Record<string, string> = {
                c197: "AI Daily 日報", c198: "Web3 Wire", c199: "DevTools Radar",
                c200: "Asia Tech Express", c201: "Research Digest", c202: "Agent Economy",
              };
              return (
                <div
                  key={src.id}
                  className="rounded-lg border border-border bg-card p-3.5 flex items-start gap-3"
                  data-testid={`card-source-${src.id}`}
                >
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                    <TypeIcon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-foreground truncate">{src.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${langColor}`}>
                        {langLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mb-1.5">
                      {curatorNames[src.curatorId] ?? src.curatorId}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{src.category}</Badge>
                      {src.active && (
                        <span className="flex items-center gap-1 text-[9px] text-emerald-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Add/Edit Agent Dialog ──────────────────────────── */}
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

            {/* Hugging Face Space URL */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">HF Space URL</label>
              <Input
                value={formData.hfSpaceUrl}
                onChange={(e) => setFormData({ ...formData, hfSpaceUrl: e.target.value })}
                placeholder="https://huggingface.co/spaces/org/space-name"
                className="text-sm"
                data-testid="input-agent-hf-space-url"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Embeds an interactive "Try it" tab on the agent page</p>
            </div>

            {/* Hugging Face Model ID */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">HF Model ID</label>
              <Input
                value={formData.hfModelId}
                onChange={(e) => setFormData({ ...formData, hfModelId: e.target.value })}
                placeholder="meta-llama/Llama-3-8B"
                className="text-sm"
                data-testid="input-agent-hf-model-id"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Shows a "Powered by" model info card on the Overview tab</p>
            </div>

            {/* Backend Type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Backend Type</label>
              <Select value={formData.backendType} onValueChange={(v) => setFormData({ ...formData, backendType: v })}>
                <SelectTrigger className="text-sm" data-testid="select-agent-backend-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self-hosted">Self-hosted</SelectItem>
                  <SelectItem value="hf-inference">HF Inference</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">HF Inference proxies requests through Hugging Face's Inference API</p>
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

      {/* ─── Delete Confirmation Dialog ─────────────────────── */}
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

// ─── Sort Header Helper ────────────────────────────────────

function SortHeader({ label, sortKey: key, current, asc, onSort }: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = current === key;
  return (
    <button
      className="flex items-center gap-0.5 hover:text-foreground transition-colors text-left"
      onClick={() => onSort(key)}
      data-testid={`sort-${key}`}
    >
      {label}
      {active ? (
        asc ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : (
        <ArrowUpDown size={9} className="opacity-40" />
      )}
    </button>
  );
}
