import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { PerplexityAttribution } from "./PerplexityAttribution";
import { useAuth } from "@/hooks/use-auth";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";
import {
  Sun, Moon, Bot, Compass, Users, Zap, Menu, X, User as UserIcon, Newspaper, PenSquare,
  Bell, Heart, MessageCircle, UserPlus, FileText, LayoutDashboard, Key
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

function AgentForgeLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="AgentForge logo">
      <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
      <path d="M10 22V14L16 10L22 14V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2.5" fill="currentColor" />
      <path d="M16 10V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 14L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 14L26 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const navItems = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/creators", label: "Creators", icon: Users },
];

const notifIcons: Record<string, React.ReactNode> = {
  like: <Heart size={13} className="text-rose-500" />,
  comment: <MessageCircle size={13} className="text-blue-500" />,
  subscribe: <UserPlus size={13} className="text-emerald-500" />,
  new_post: <FileText size={13} className="text-amber-500" />,
};

function timeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/notifications/unread-count");
        return await res.json();
      } catch { return { count: 0 }; }
    },
    refetchInterval: 30000, // poll every 30s
  });

  const { data: notifications } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/notifications?limit=15");
        return await res.json();
      } catch { return []; }
    },
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-read", {});
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/notifications/unread-count"], { count: 0 });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = unreadData?.count ?? 0;

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (isOpen) {
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      }
    }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative" data-testid="button-notifications">
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="notifications-dropdown">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] text-primary hover:text-primary"
              onClick={() => markReadMutation.mutate()}
              data-testid="button-mark-all-read"
            >
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {(!notifications || notifications.length === 0) ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Bell size={20} className="mx-auto mb-2 opacity-40" />
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <Link
                key={n.id}
                href={n.link || "/"}
                onClick={() => setOpen(false)}
                className="no-underline"
              >
                <div
                  className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 ${
                    !n.read ? "bg-primary/5" : ""
                  }`}
                  data-testid={`notification-${n.id}`}
                >
                  <div className="mt-0.5 shrink-0">{notifIcons[n.type] || <Bell size={13} />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-relaxed">
                      <span className="font-semibold">{n.actorName}</span>{" "}
                      <span className="text-muted-foreground">{n.message}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />}
                </div>
              </Link>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();

  const { data: creatorProfile } = useQuery<{ id: string } | null>({
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

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 text-foreground no-underline">
            <AgentForgeLogo />
            <span className="font-semibold text-[15px] tracking-tight">AgentForge</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1" data-testid="nav-desktop">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || location.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>

            {!isLoading && user && <NotificationBell />}

            {!isLoading && (
              <>
                {user ? (
                  <UserButton
                    appearance={{
                      elements: { avatarBox: "h-8 w-8" },
                    }}
                  >
                    <UserButton.MenuItems>
                      <UserButton.Link label="Profile" href="/#/profile" labelIcon={<UserIcon size={14} />} />
                      {creatorProfile && (
                        <UserButton.Link label="Dashboard" href="/#/dashboard" labelIcon={<LayoutDashboard size={14} />} />
                      )}
                      <UserButton.Link label="Write a post" href="/#/new-post" labelIcon={<PenSquare size={14} />} />
                      <UserButton.Link label="API Keys" href="/#/settings/api-keys" labelIcon={<Key size={14} />} />
                    </UserButton.MenuItems>
                  </UserButton>
                ) : (
                  <SignInButton mode="modal">
                    <Button size="sm" className="h-8 text-xs font-medium gap-1.5" data-testid="button-sign-in">
                      <Zap size={13} />
                      Sign in
                    </Button>
                  </SignInButton>
                )}
              </>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </Button>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 pb-3 pt-2" data-testid="nav-mobile">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 no-underline"
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            {!user && (
              <div className="px-3 py-2.5">
                <SignInButton mode="modal">
                  <button
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-sm font-medium text-primary"
                  >
                    <Zap size={16} />
                    Sign in
                  </button>
                </SignInButton>
              </div>
            )}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border bg-background mt-auto">
        <div className="mx-auto max-w-7xl px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <AgentForgeLogo />
            <span>&copy; 2026 AgentForge</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted-foreground hover:text-foreground no-underline">For Creators</Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground no-underline">Docs</Link>
            <Link href="/docs" className="text-muted-foreground hover:text-foreground no-underline">API</Link>
            <span>Status</span>
            <PerplexityAttribution />
          </div>
        </div>
      </footer>
    </div>
  );
}
