"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building06Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "@/components/HugeIcon";
import { ApiError, fetchApi } from "@/lib/api";
import tokens from "@/components/landing/landing-tokens.module.css";
import styles from "./page.module.css";

export default function CompleteOrganizationPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [organizationName, setOrganizationName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetchApi<{ organizations: unknown[] }>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        if (me.organizations.length > 0) {
          router.replace("/app/inspections");
          return;
        }
        setCheckingAuth(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
          return;
        }
        setCheckingAuth(false);
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await fetchApi("/auth/complete-organization", {
        method: "POST",
        body: JSON.stringify({ organizationName }),
      });
      router.push("/app/inspections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (checkingAuth) {
    return <div className={`${tokens.landingRoot} ${styles.page}`} />;
  }

  return (
    <div className={`${tokens.landingRoot} ${styles.page}`}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <svg className={styles.brandMark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2.2" />
            <path d="M11 16.5L14.3 19.8L21 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          InspectAI
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>ONE LAST STEP</span>
          <h1>
            Name your <span>organisation</span>
          </h1>
          <p>This is how your property portfolio will be labelled — you can change it later.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <label className={styles.field}>
            <span>
              Organisation name <span className={styles.required}>*</span>
            </span>
            <div className={styles.inputWrap}>
              <HugeIcon icon={Building06Icon} size={18} />
              <input
                type="text"
                placeholder="Acme Properties"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                required
                autoFocus
                disabled={isSubmitting}
              />
            </div>
          </label>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            <span>{isSubmitting ? "Please wait…" : "Continue"}</span>
            {!isSubmitting && <HugeIcon icon={ArrowRight02Icon} size={17} />}
          </button>
        </form>
      </div>
    </div>
  );
}
