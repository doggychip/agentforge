import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { PerplexityAttribution } from "./PerplexityAttribution";
import { useAuth } from "@/hooks/use-auth";
import {
  Sun, Moon, Bot, Compass, Users, Zap, Menu, X, LogOut, User as UserIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  { href: "/", label: "Explore", icon: Compass },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/creators", label: "Creators", icon: Users },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout, isLoading } = useAuth();

  function getInitials(name: string) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

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
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
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

            {!isLoading && (
              <>
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 gap-2 px-2" data-testid="button-user-menu">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                            {getInitials(user.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden sm:inline text-xs font-medium max-w-[100px] truncate">
                          {user.displayName}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium">{user.displayName}</p>
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-xs" data-testid="menu-item-profile">
                        <UserIcon size={14} />
                        Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="gap-2 text-xs text-destructive focus:text-destructive"
                        onClick={() => logout()}
                        data-testid="menu-item-logout"
                      >
                        <LogOut size={14} />
                        Sign out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Link href="/auth" className="no-underline">
                    <Button size="sm" className="h-8 text-xs font-medium gap-1.5" data-testid="button-sign-in">
                      <Zap size={13} />
                      Sign in
                    </Button>
                  </Link>
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
              <Link
                href="/auth"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-primary no-underline"
              >
                <Zap size={16} />
                Sign in
              </Link>
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
            <span>Docs</span>
            <span>API</span>
            <span>Status</span>
            <PerplexityAttribution />
          </div>
        </div>
      </footer>
    </div>
  );
}
