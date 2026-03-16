import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bot, ArrowRight, Loader2 } from "lucide-react";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [, setLocation] = useLocation();
  const { login, register, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

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
      } else {
        await register({ email, password, username, displayName });
      }
      setLocation("/");
    } catch (err: any) {
      const message = err.message?.includes(":") ? err.message.split(": ").slice(1).join(": ") : err.message;
      let parsed = message;
      try {
        const json = JSON.parse(message);
        parsed = json.message || message;
      } catch {}
      toast({
        title: mode === "login" ? "Login failed" : "Registration failed",
        description: parsed,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {mode === "login"
              ? "Sign in to subscribe to agents and publish your own"
              : "Join AgentForge to discover and publish AI agents"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="displayName" className="text-xs font-medium">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ryan Cheung"
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
                  placeholder="doggychip"
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

          <Button type="submit" className="w-full gap-2" disabled={loading} data-testid="button-auth-submit">
            {loading ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                {mode === "login" ? "Sign in" : "Create account"}
                <ArrowRight size={15} />
              </>
            )}
          </Button>
        </form>

        {/* Toggle */}
        <div className="text-center mt-6">
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
        </div>
      </div>
    </div>
  );
}
