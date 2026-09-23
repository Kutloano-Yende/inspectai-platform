"use client";

import { useContext, createContext, useCallback, useEffect, useState, PropsWithChildren } from "react";
import { fetchApi, ApiError } from "../api";

interface AuthUser {
  userId: string;
  email: string;
  organizationId: string;
  memberships: Array<{ organizationId: string; role: string }>;
  hasPassword: boolean;
  googleLinked: boolean;
  appleLinked: boolean;
  microsoftLinked: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetchApi<{
        user: {
          id: string;
          email: string;
          hasPassword: boolean;
          googleLinked: boolean;
          appleLinked: boolean;
          microsoftLinked: boolean;
        };
        organizations: Array<{ id: string; name: string; role: string }>;
      }>("/auth/me");
      const orgs = response.organizations || [];
      setUser({
        userId: response.user.id,
        email: response.user.email,
        organizationId: orgs[0]?.id || "",
        memberships: orgs.map((org) => ({ organizationId: org.id, role: org.role })),
        hasPassword: response.user.hasPassword,
        googleLinked: response.user.googleLinked,
        appleLinked: response.user.appleLinked,
        microsoftLinked: response.user.microsoftLinked,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        setError(err instanceof Error ? err : new Error("Auth check failed"));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetchApi("/auth/logout", { method: "POST" });
      setUser(null);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, error, logout, refresh: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}
