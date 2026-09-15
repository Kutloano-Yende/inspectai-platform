"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

function LoadingState() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
      </div>
    </div>
  );
}
