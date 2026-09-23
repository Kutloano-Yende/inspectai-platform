"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import { API_URL, fetchApi } from "@/lib/api";
import styles from "./page.module.css";

type ProviderKey = "google" | "apple" | "microsoft";

const PROVIDER_LABELS: Record<ProviderKey, string> = {
  google: "Google",
  apple: "Apple",
  microsoft: "Microsoft",
};

const LINK_ERROR_MESSAGES: Record<string, string> = {
  provider_already_linked: "That account is already linked to a different InspectAI account.",
  oauth_not_configured: "That sign-in method isn't available right now.",
};

function SettingsScreen() {
  const { user, isLoading: authLoading, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [providers, setProviders] = useState<Record<ProviderKey, boolean>>({ google: false, apple: false, microsoft: false });
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [unlinking, setUnlinking] = useState<ProviderKey | null>(null);
  const [unlinkError, setUnlinkError] = useState("");

  useEffect(() => {
    fetchApi<{ google: boolean; apple: boolean; microsoft: boolean }>("/auth/providers")
      .then(setProviders)
      .catch(() => {
        // Leave every provider showing "not available" if the status can't be reached.
      });
  }, []);

  useEffect(() => {
    const linked = searchParams.get("linked");
    const linkError = searchParams.get("link_error");
    if (linked && linked in PROVIDER_LABELS) {
      setBanner({ kind: "success", text: `${PROVIDER_LABELS[linked as ProviderKey]} is now linked to your account.` });
      refresh();
      router.replace("/app/settings");
    } else if (linkError) {
      setBanner({ kind: "error", text: LINK_ERROR_MESSAGES[linkError] || "Something went wrong linking that account. Please try again." });
      router.replace("/app/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleUnlink = async (provider: ProviderKey) => {
    setUnlinkError("");
    setUnlinking(provider);
    try {
      await fetchApi(`/auth/providers/${provider}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setUnlinking(null);
    }
  };

  if (authLoading || !user) {
    return <div className={styles.container} />;
  }

  const linkedCount = [user.hasPassword, user.googleLinked, user.appleLinked, user.microsoftLinked].filter(Boolean).length;

  return (
    <div className={styles.container}>
      <section className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>{user.email}</p>
      </section>

      {banner && <div className={`${styles.banner} ${styles[banner.kind]}`}>{banner.text}</div>}

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>Sign-in methods</h2>
        <p className={styles.sectionHint}>
          {user.hasPassword ? "Password is set." : "No password set — you sign in with a linked account below."}
        </p>

        <div className={styles.providerList}>
          {(Object.keys(PROVIDER_LABELS) as ProviderKey[]).map((provider) => {
            const linked = provider === "google" ? user.googleLinked : provider === "apple" ? user.appleLinked : user.microsoftLinked;
            const configured = providers[provider];

            return (
              <div key={provider} className={styles.providerRow}>
                <div>
                  <span className={styles.providerName}>{PROVIDER_LABELS[provider]}</span>
                  <span className={linked ? styles.statusLinked : styles.statusUnlinked}>
                    {linked ? "Linked" : configured ? "Not linked" : "Not available"}
                  </span>
                </div>

                {linked ? (
                  <button
                    type="button"
                    className={styles.unlinkButton}
                    disabled={unlinking === provider || linkedCount <= 1}
                    title={linkedCount <= 1 ? "You must keep at least one way to sign in" : undefined}
                    onClick={() => handleUnlink(provider)}
                  >
                    {unlinking === provider ? "Removing…" : "Unlink"}
                  </button>
                ) : configured ? (
                  <a href={`${API_URL}/auth/${provider}`} className={styles.linkButton}>
                    Link
                  </a>
                ) : (
                  <button type="button" className={styles.linkButton} disabled aria-disabled="true" title="Coming soon">
                    Link
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {unlinkError && (
          <div className={styles.error} role="alert">
            {unlinkError}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsScreen />
    </Suspense>
  );
}
