"use client";

"use client";

import { AuthProvider } from "@/lib/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <AppLayout>{children}</AppLayout>
      </ProtectedRoute>
    </AuthProvider>
  );
}
