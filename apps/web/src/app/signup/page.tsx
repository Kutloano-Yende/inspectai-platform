"use client";

import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api";
import { AuthScreen, type AuthFields } from "@/components/auth/AuthScreen";

export default function SignupPage() {
  const router = useRouter();

  const handleSubmit = async ({ organizationName, fullName, email, password }: AuthFields) => {
    await fetchApi("/auth/register", {
      method: "POST",
      body: JSON.stringify({ organizationName, fullName, email, password }),
    });
    router.push("/app/inspections");
  };

  return <AuthScreen mode="signup" onSubmit={handleSubmit} />;
}
