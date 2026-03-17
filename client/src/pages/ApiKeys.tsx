import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Key, Plus, Copy, Check, Trash2, Loader2, AlertTriangle, Terminal,
  Activity, TrendingUp, BarChart3, Clock, Settings2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

interface ApiKeyResponse {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revoked: boolean;
  rateLimit: number;
  rateLimitDay: number;
}

interface CreateKeyResponse extends ApiKeyResponse {
  key: string;
}

interface UsageStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  byKey: { keyId: string; keyName: string; keyPrefix: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
}

function formatDate(date: string | null) {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default function ApiKeys() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyResponse | null>(null);
  const [editRateLimit, setEditRateLimit] = useState<ApiKeyResponse | null>(null);
  const [rlHourly, setRlHourly] = useState("");
  const [rlDaily, setRlDaily] = useState("");

  const { data: keys, isLoading: loadingKeys } = useQuery<ApiKeyResponse[]>({
    queryKey: ["/api/keys"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/keys");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: usageStats } = useQuery<UsageStats>({
    queryKey: ["/api/keys/usage/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/keys/usage/stats");
      return res.json();
    },
    enabled: !!user,
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/keys", { name });
      return res.json() as Promise<CreateKeyResponse>;
    },
    onSuccess: (data) => {
      setNewKey(data.key);
      setShowKeyDialog(true);
      setKeyName("");
      setCopied(false);
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create key", variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/keys/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Key revoked", description: "The API key has been revoked." });
      setRevokeTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to revoke key", variant: "destructive" });
    },
  });

  const updateRateLimitMutation = useMutation({
    mutationFn: async ({ id, rateLimit, rateLimitDay }: { id: string; rateLimit: number; rateLimitDay: number }) => {
      const res = await apiRequest("PATCH", `/api/keys/${id}/rate-limit`, { rateLimit, rateLimitDay });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rate limits updated" });
      setEditRateLimit(null);
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update rate limits", variant: "destructive" });
    },
  });

  async function copyToClipboard() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy the key manually.", variant: "destructive" });
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  const activeKeys = keys?.filter((k) => !k.revoked) ?? [];
  const revokedKeys = keys?.filter((k) => k.revoked) ?? [];

  // Map usage count per key
  const usageByKeyMap = new Map<string, number>();
  if (usageStats?.byKey) {
    for (const bk of usageStats.byKey) {
      usageByKeyMap.set(bk.keyId, bk.count);
    }
  }

  const statCards = [
    { label: "Today", value: usageStats?.today ?? 0, icon: Activity, color: "text-blue-500" },
    { label: "This Week", value: usageStats?.thisWeek ?? 0, icon: TrendingUp, color: "text-emerald-500" },
    { label: "This Month", value: usageStats?.thisMonth ?? 0, icon: BarChart3, color: "text-purple-500" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2" data-testid="heading-api-keys">
          <Key size={20} />
          API Keys
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate API keys to access AgentForge programmatically. Keys let AI agents authenticate and consume subscribed content via API.
        </p>
      </div>

      {/* Usage Overview Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6" data-testid="section-usage-overview">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon size={14} className={s.color} />
              </div>
              <p className="text-lg font-bold" data-testid={`stat-${s.label.toLowerCase().replace(/\s/g, "-")}`}>
                {formatNumber(s.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Chart */}
      {usageStats && usageStats.dailyCounts.length > 0 && (
        <Card className="mb-6" data-testid="section-usage-chart">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={14} />
              API Calls (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={usageStats.dailyCounts}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip
                  labelFormatter={(d: string) => d}
                  formatter={(value: number) => [formatNumber(value), "Calls"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Create Key */}
      <Card className="mb-6" data-testid="section-create-key">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Create API Key</CardTitle>
          <CardDescription className="text-xs">Give your key a descriptive name so you can identify it later.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. Production Bot, My Agent"
              className="text-sm max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && keyName.trim()) {
                  createKeyMutation.mutate(keyName.trim());
                }
              }}
              data-testid="input-key-name"
            />
            <Button
              size="sm"
              className="gap-1.5 text-xs h-9"
              disabled={!keyName.trim() || createKeyMutation.isPending}
              onClick={() => createKeyMutation.mutate(keyName.trim())}
              data-testid="button-generate-key"
            >
              {createKeyMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              Generate Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Keys Table */}
      <Card className="mb-6" data-testid="section-keys-list">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Your Keys</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingKeys ? (
            <div className="space-y-3">
              {[1, 2].map((i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : !keys || keys.length === 0 ? (
            <div className="text-center py-8">
              <Key size={24} className="mx-auto mb-2 text-muted-foreground opacity-40" />
              <p className="text-sm text-muted-foreground">No API keys yet. Create one above.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Key</TableHead>
                    <TableHead className="text-xs">Calls</TableHead>
                    <TableHead className="text-xs">Rate Limit</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs">Last Used</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeKeys.map((k) => (
                    <TableRow key={k.id} data-testid={`key-row-${k.id}`}>
                      <TableCell className="text-sm font-medium">{k.name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{k.keyPrefix}...</TableCell>
                      <TableCell className="text-xs text-muted-foreground" data-testid={`key-calls-${k.id}`}>
                        {formatNumber(usageByKeyMap.get(k.id) ?? 0)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <button
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                          onClick={() => {
                            setEditRateLimit(k);
                            setRlHourly(String(k.rateLimit));
                            setRlDaily(String(k.rateLimitDay));
                          }}
                          data-testid={`button-edit-rate-limit-${k.id}`}
                        >
                          {formatNumber(k.rateLimit)}/hr | {formatNumber(k.rateLimitDay)}/day
                          <Settings2 size={11} />
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(k.createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(k.lastUsedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600">Active</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setRevokeTarget(k)}
                          data-testid={`button-revoke-${k.id}`}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {revokedKeys.map((k) => (
                    <TableRow key={k.id} className="opacity-50" data-testid={`key-row-${k.id}`}>
                      <TableCell className="text-sm">{k.name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{k.keyPrefix}...</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(k.createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(k.lastUsedAt)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] bg-red-500/10 text-red-600">Revoked</Badge>
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Usage Guide */}
      <Card data-testid="section-usage-guide">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Terminal size={14} />
            API Usage
          </CardTitle>
          <CardDescription className="text-xs">Use your API key to authenticate requests.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-3 font-mono text-xs leading-relaxed overflow-x-auto">
            <span className="text-muted-foreground"># List available agents</span>
            <br />
            curl -H "Authorization: Bearer af_k_..." \
            <br />
            &nbsp;&nbsp;{typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/agents
            <br /><br />
            <span className="text-muted-foreground"># Check subscription status</span>
            <br />
            curl -H "Authorization: Bearer af_k_..." \
            <br />
            &nbsp;&nbsp;{typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/agents/:id/subscription-status
            <br /><br />
            <span className="text-muted-foreground"># Response headers include rate limit info:</span>
            <br />
            <span className="text-muted-foreground"># X-RateLimit-Limit: 1000</span>
            <br />
            <span className="text-muted-foreground"># X-RateLimit-Remaining: 997</span>
          </div>
        </CardContent>
      </Card>

      {/* New Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={(open) => { if (!open) { setShowKeyDialog(false); setNewKey(null); } }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-new-key">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Key size={16} />
              API Key Created
            </DialogTitle>
            <DialogDescription className="text-xs">
              Copy your key now. It will only be shown once.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-2.5">
              <code className="text-xs font-mono flex-1 break-all select-all" data-testid="text-new-key">{newKey}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={copyToClipboard}
                data-testid="button-copy-key"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </Button>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md p-2.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This key will only be shown once. Store it securely — you won't be able to see it again.</span>
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              className="text-xs"
              onClick={() => { setShowKeyDialog(false); setNewKey(null); }}
              data-testid="button-done"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent data-testid="dialog-revoke-key">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke "{revokeTarget?.name}"? Any applications using this key will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => revokeTarget && revokeKeyMutation.mutate(revokeTarget.id)}
              disabled={revokeKeyMutation.isPending}
              data-testid="button-confirm-revoke"
            >
              {revokeKeyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Rate Limit Dialog */}
      <Dialog open={!!editRateLimit} onOpenChange={(open) => { if (!open) setEditRateLimit(null); }}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-edit-rate-limit">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Settings2 size={16} />
              Rate Limits
            </DialogTitle>
            <DialogDescription className="text-xs">
              Set hourly and daily request limits for "{editRateLimit?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Requests per hour</label>
              <Input
                type="number"
                value={rlHourly}
                onChange={(e) => setRlHourly(e.target.value)}
                min={10}
                max={100000}
                className="text-sm"
                data-testid="input-rate-limit-hourly"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Requests per day</label>
              <Input
                type="number"
                value={rlDaily}
                onChange={(e) => setRlDaily(e.target.value)}
                min={100}
                max={1000000}
                className="text-sm"
                data-testid="input-rate-limit-daily"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setEditRateLimit(null)}
              data-testid="button-cancel-rate-limit"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={updateRateLimitMutation.isPending}
              onClick={() => {
                if (!editRateLimit) return;
                updateRateLimitMutation.mutate({
                  id: editRateLimit.id,
                  rateLimit: parseInt(rlHourly, 10) || editRateLimit.rateLimit,
                  rateLimitDay: parseInt(rlDaily, 10) || editRateLimit.rateLimitDay,
                });
              }}
              data-testid="button-save-rate-limit"
            >
              {updateRateLimitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
