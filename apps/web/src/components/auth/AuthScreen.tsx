"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  Mail01Icon,
  LockKeyholeIcon,
  EyeIcon,
  EyeOffIcon,
  UserIcon,
  Building06Icon,
  ArrowRight02Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeIcon } from "@/components/HugeIcon";
import { API_URL, ApiError } from "@/lib/api";
import tokens from "@/components/landing/landing-tokens.module.css";
import styles from "./AuthScreen.module.css";

export interface AuthFields {
  organizationName?: string;
  fullName?: string;
  email: string;
  password: string;
}

interface AuthScreenProps {
  mode: "login" | "signup";
  onSubmit: (fields: AuthFields) => Promise<void>;
  /** Seeds the error banner, e.g. from a ?error= query param after an OAuth redirect. */
  initialError?: string | undefined;
}

/** The API's ValidationFailedError joins Zod issues as "field: message; field: message". */
function parseFieldErrors(detail: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of detail.split("; ")) {
    const separator = part.indexOf(": ");
    if (separator === -1) continue;
    fields[part.slice(0, separator)] = part.slice(separator + 2);
  }
  return fields;
}

export function AuthScreen({ mode, onSubmit, initialError }: AuthScreenProps) {
  const isLogin = mode === "login";

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [appleEnabled, setAppleEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/auth/providers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { google?: boolean; apple?: boolean } | null) => {
        if (!cancelled && data) {
          setGoogleEnabled(Boolean(data.google));
          setAppleEnabled(Boolean(data.apple));
        }
      })
      .catch(() => {
        // Leave social buttons disabled if the provider status can't be reached.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!isLogin && !agreeToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ organizationName, fullName, email, password });
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION_FAILED") {
        const parsed = parseFieldErrors(err.message);
        if (Object.keys(parsed).length > 0) {
          setFieldErrors(parsed);
        } else {
          setError(err.message);
        }
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`${tokens.landingRoot} ${styles.page}`}>
      <div className={styles.shell}>
        <div className={styles.visual} aria-hidden="true">
          <div className={styles.visualGrid} />

          <img
            src="/illustrations/house-searching.svg"
            alt=""
            className={styles.visualIllustration}
            width={200}
            height={200}
          />

          <div className={styles.visualBadge}>
            <span className={styles.visualBadgeIcon}>
              <HugeIcon icon={CheckmarkCircle02Icon} size={16} />
            </span>
            <div>
              <strong>Inspection ready</strong>
              <span>Evidence captured</span>
            </div>
          </div>
        </div>

        <div className={styles.content}>
          <Link href="/" className={styles.brand}>
            <svg className={styles.brandMark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2.2" />
              <path
                d="M11 16.5L14.3 19.8L21 12.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            InspectAI
          </Link>

          <div className={styles.heading}>
            <span className={styles.eyebrow}>PROPERTY INSPECTIONS</span>
            <h1>
              {isLogin ? (
                <>
                  Welcome <span>back</span>
                </>
              ) : (
                <>
                  Get <span>started</span>
                </>
              )}
            </h1>
            <p>
              {isLogin
                ? "Sign in to continue managing your property inspections and reports."
                : "Create your account to start managing your property inspections."}
            </p>
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {!isLogin && (
              <>
                <label className={styles.field}>
                  <span>
                    Organisation name <span className={styles.required}>*</span>
                  </span>
                  <div className={fieldErrors.organizationName ? `${styles.inputWrap} ${styles.inputWrapError}` : styles.inputWrap}>
                    <HugeIcon icon={Building06Icon} size={18} />
                    <input
                      type="text"
                      placeholder="Acme Properties"
                      value={organizationName}
                      onChange={(e) => {
                        setOrganizationName(e.target.value);
                        clearFieldError("organizationName");
                      }}
                      required
                      aria-invalid={Boolean(fieldErrors.organizationName)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {fieldErrors.organizationName && <span className={styles.fieldError}>{fieldErrors.organizationName}</span>}
                </label>

                <label className={styles.field}>
                  <span>
                    Full name <span className={styles.required}>*</span>
                  </span>
                  <div className={fieldErrors.fullName ? `${styles.inputWrap} ${styles.inputWrapError}` : styles.inputWrap}>
                    <HugeIcon icon={UserIcon} size={18} />
                    <input
                      type="text"
                      placeholder="John Smith"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError("fullName");
                      }}
                      required
                      aria-invalid={Boolean(fieldErrors.fullName)}
                      disabled={isSubmitting}
                    />
                  </div>
                  {fieldErrors.fullName && <span className={styles.fieldError}>{fieldErrors.fullName}</span>}
                </label>
              </>
            )}

            <label className={styles.field}>
              <span>
                Email <span className={styles.required}>*</span>
              </span>
              <div className={fieldErrors.email ? `${styles.inputWrap} ${styles.inputWrapError}` : styles.inputWrap}>
                <HugeIcon icon={Mail01Icon} size={18} />
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  required
                  aria-invalid={Boolean(fieldErrors.email)}
                  disabled={isSubmitting}
                />
              </div>
              {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
            </label>

            <label className={styles.field}>
              <span>
                Password <span className={styles.required}>*</span>
              </span>
              <div className={fieldErrors.password ? `${styles.inputWrap} ${styles.inputWrapError}` : styles.inputWrap}>
                <HugeIcon icon={LockKeyholeIcon} size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={isLogin ? "Enter your password" : "Create a password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  required
                  aria-invalid={Boolean(fieldErrors.password)}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <HugeIcon icon={showPassword ? EyeOffIcon : EyeIcon} size={18} />
                </button>
              </div>
              {fieldErrors.password ? (
                <span className={styles.fieldError}>{fieldErrors.password}</span>
              ) : (
                !isLogin && <span className={styles.hint}>At least 10 characters.</span>
              )}
            </label>

            {!isLogin && (
              <label className={styles.terms}>
                <input
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  required
                  disabled={isSubmitting}
                />
                <span>I agree to the Terms of Service and Privacy Policy</span>
              </label>
            )}

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              <span>{isSubmitting ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</span>
              {!isSubmitting && <HugeIcon icon={ArrowRight02Icon} size={17} />}
            </button>
          </form>

          <div className={styles.divider}>
            <span />
            <small>or</small>
            <span />
          </div>

          <div className={styles.social}>
            {googleEnabled ? (
              <a href={`${API_URL}/auth/google`} className={styles.socialLink}>
                Google
              </a>
            ) : (
              <button type="button" disabled aria-disabled="true" title="Coming soon">
                Google
              </button>
            )}
            {appleEnabled ? (
              <a href={`${API_URL}/auth/apple`} className={styles.socialLink}>
                Apple
              </a>
            ) : (
              <button type="button" disabled aria-disabled="true" title="Coming soon">
                Apple
              </button>
            )}
            <button type="button" disabled aria-disabled="true" title="Coming soon">
              Microsoft
            </button>
          </div>
          {!googleEnabled && !appleEnabled && <p className={styles.socialNote}>Social sign-in is coming soon.</p>}

          <p className={styles.switch}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <Link href={isLogin ? "/signup" : "/login"}>{isLogin ? "Sign up" : "Sign in"}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
