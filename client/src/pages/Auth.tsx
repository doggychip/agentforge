import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bot, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "register" | "forgot-username" | "forgot-password" | "2fa">("login");
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

  // 2FA state
  const [tempToken, setTempToken] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");

  // Check available auth providers
  const { data: providers } = useQuery<{ google?: boolean }>({
    queryKey: ["/api/auth/providers"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/auth/providers");
        return res.json();
      } catch {
        return {};
      }
    },
    staleTime: Infinity,
    retry: false,
  });

  // Redirect if already logged in
  if (user) {
    setLocation("/");
    return null;
  }

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/2fa/verify-login", {
        tempToken,
        code: twoFaCode,
      });
      const data = await res.json();
      // Set the user in the auth context and redirect
      const { queryClient } = await import("@/lib/queryClient");
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        try {
          await login(email, password);
          setLocation("/");
        } catch (err: any) {
          // Check if the error response indicates 2FA is required
          const text = err.message || "";
          try {
            const errData = JSON.parse(text.includes(": ") ? text.split(": ").slice(1).join(": ") : text);
            if (errData.requires2fa && errData.tempToken) {
              setTempToken(errData.tempToken);
              setMode("2fa");
              return;
            }
          } catch {}
          throw err;
        }
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
      case "2fa": return "Two-factor authentication";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "login": return "Sign in to subscribe to agents and publish your own";
      case "register": return "Join AgentForge to discover and publish AI agents";
      case "forgot-username": return "Enter your email to recover your username";
      case "forgot-password": return "Enter your email and we'll send you a reset link";
      case "2fa": return "Enter the 6-digit code from your authenticator app";
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

        {/* 2FA Mode */}
        {mode === "2fa" && (
          <>
            <form onSubmit={handle2faSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="twoFaCode" className="text-xs font-medium">Verification Code</Label>
                <Input
                  id="twoFaCode"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="text-center text-2xl tracking-[0.5em] font-mono"
                  required
                  autoFocus
                  data-testid="input-2fa-code"
                />
              </div>

              <Button type="submit" className="w-full gap-2" disabled={loading || twoFaCode.length !== 6} data-testid="button-2fa-submit">
                {loading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <>
                    Verify
                    <ArrowRight size={15} />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center mt-6">
              <button
                type="button"
                onClick={() => { setMode("login"); setTwoFaCode(""); setTempToken(""); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft size={14} /> Back to login
              </button>
            </div>
          </>
        )}

        {/* Non-2FA Modes */}
        {mode !== "2fa" && (
          <>
            {/* Google OAuth */}
            {providers?.google && (mode === "login" || mode === "register") && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 mb-4 border-border hover:bg-muted/50"
                  onClick={handleGoogleSignIn}
                  data-testid="button-google-signin"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>

                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-3 text-muted-foreground">or</span>
                  </div>
                </div>
              </>
            )}

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
          </>
        )}
      </div>
    </div>
  );
}
