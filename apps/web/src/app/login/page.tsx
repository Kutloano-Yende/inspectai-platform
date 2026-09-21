"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { AuthScreen, type AuthFields } from "@/components/auth/AuthScreen";

function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialError = searchParams.get("error") === "oauth_failed" ? "Google sign-in didn't go through. Please try again." : undefined;

  const handleSubmit = async ({ email, password }: AuthFields) => {
    await fetchApi("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    router.push("/app/inspections");
  };

  return <AuthScreen mode="login" onSubmit={handleSubmit} initialError={initialError} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
