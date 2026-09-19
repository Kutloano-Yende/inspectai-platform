"use client";

import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { AuthScreen, type AuthFields } from "@/components/auth/AuthScreen";

export default function LoginPage() {
  const router = useRouter();

  const handleSubmit = async ({ email, password }: AuthFields) => {
    await fetchApi("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    router.push("/app/inspections");
  };

  return <AuthScreen mode="login" onSubmit={handleSubmit} />;
}
