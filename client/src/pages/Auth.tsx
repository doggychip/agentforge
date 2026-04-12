import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bot, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register" | "forgot-username" | "forgot-password">("login");
  const [, setLocation] = useLocation();
  const { login, register, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  // Forgot flow state
  const [recoveredUsername, setRecoveredUsername] = useState<string | null>(null);

  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        setLocation("/");
      } else if (mode === "register") {
        await register({ email, password, username, displayName });
        setLocation("/");
      } else if (mode === "forgot-username") {
        const res = await apiRequest("POST", "/api/auth/forgot-username", { email });
        const data = await res.json();
        if (data.username) {
          setRecoveredUsername(data.username);
        } else {
          toast({ title: "Check your email", description: data.message });
        }
      } else if (mode === "forgot-password") {
        const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
        const data = await res.json();
        toast({ title: "Check your email", description: data.message });
      }
    } catch (err: any) {
      const message = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed = message;
      try {
        const json = JSON.parse(message);
        parsed = json.message || message;
      } catch {}
      toast({
        title: "Error",
        description: parsed,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return "Welcome back";
      case "register": return "Create your account";
      case "forgot-username": return "Forgot username";
      case "forgot-password": return "Reset password";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "login": return "Sign in to subscribe to agents and publish your own";
      case "register": return "Join AgentForge to discover and publish AI agents";
      case "forgot-username": return "Enter your email to recover your username";
      case "forgot-password": return "Enter your email and we'll send you a reset link";
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
            <Bot size={24} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-auth-title">
            {getTitle()}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {getSubtitle()}
          </p>
        </div>

        {/* Recovered username display */}
        {mode === "forgot-username" && recoveredUsername && (
          <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/20 text-center">
            <p className="text-sm text-muted-foreground mb-1">Your username is</p>
            <p className="text-lg font-semibold text-primary">{recoveredUsername}</p>
            <Button
              variant="ghost"
              className="mt-2 text-sm"
              onClick={() => { setMode("login"); setRecoveredUsername(null); }}
            >
              <ArrowLeft size={14} className="mr-1" /> Back to login
            </Button>
          </div>
        )}

        {/* Form */}
        {!(mode === "forgot-username" && recoveredUsername) && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName" className="text-xs font-medium">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your Name"
                    required
                    data-testid="input-display-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-medium">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    required
                    minLength={3}
                    pattern="^[a-zA-Z0-9_-]+$"
                    data-testid="input-username"
                  />
                  <p className="text-[11px] text-muted-foreground">Letters, numbers, hyphens, underscores only</p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                data-testid="input-email"
              />
            </div>

            {(mode === "login" || mode === "register") && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "At least 8 characters" : "Enter your password"}
                  required
                  minLength={mode === "register" ? 8 : 1}
                  data-testid="input-password"
                />
              </div>
            )}

            {/* Forgot links - only show on login */}
            {mode === "login" && (
              <div className="flex justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setMode("forgot-username"); setRecoveredUsername(null); }}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot username?
                </button>
                <button
                  type="button"
                  onClick={() => setMode("forgot-password")}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-auth-submit">
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  {mode === "login" && "Sign in"}
                  {mode === "register" && "Create account"}
                  {mode === "forgot-username" && "Recover username"}
                  {mode === "forgot-password" && "Send reset link"}
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </form>
        )}

        {/* Toggle / Back */}
        <div className="text-center mt-6">
          {(mode === "login" || mode === "register") && (
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Don\u2019t have an account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-primary font-medium hover:underline"
                data-testid="button-toggle-auth-mode"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
          )}
          {(mode === "forgot-username" || mode === "forgot-password") && !recoveredUsername && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} /> Back to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
