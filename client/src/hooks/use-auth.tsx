import { createContext, useContext, type ReactNode } from "react";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import type { SafeUser } from "@shared/schema";

type AuthContextType = {
  user: SafeUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  register: (data: { username: string; email: string; password: string; displayName: string }) => Promise<SafeUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut } = useClerkAuth();

  // Map Clerk user to our SafeUser shape
  const user: SafeUser | null = clerkUser
    ? {
        id: clerkUser.id,
        username: clerkUser.username || clerkUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "user",
        email: clerkUser.primaryEmailAddress?.emailAddress || "",
        displayName: clerkUser.fullName || clerkUser.firstName || "User",
        avatar: clerkUser.imageUrl || null,
        role: "user",
        stripeCustomerId: null,
        googleId: clerkUser.externalAccounts?.find(a => a.provider === "google")?.providerUserId || null,
        githubId: clerkUser.externalAccounts?.find(a => a.provider === "github")?.providerUserId || null,
        emailVerified: clerkUser.primaryEmailAddress?.verification?.status === "verified",
        totpEnabled: clerkUser.twoFactorEnabled || false,
      }
    : null;

  const login = async () => {
    // Clerk handles login via its own UI components
    throw new Error("Use Clerk SignIn component instead");
  };

  const register = async () => {
    // Clerk handles registration via its own UI components
    throw new Error("Use Clerk SignUp component instead");
  };

  const logout = async () => {
    await signOut();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: !isLoaded, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
