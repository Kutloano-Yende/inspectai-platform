"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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
}

export function AuthScreen({ mode, onSubmit }: AuthScreenProps) {
  const isLogin = mode === "login";

  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await onSubmit({ organizationName, fullName, email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
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

          <form className={styles.form} onSubmit={handleSubmit}>
            {!isLogin && (
              <>
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
                      disabled={isSubmitting}
                    />
                  </div>
                </label>

                <label className={styles.field}>
                  <span>
                    Full name <span className={styles.required}>*</span>
                  </span>
                  <div className={styles.inputWrap}>
                    <HugeIcon icon={UserIcon} size={18} />
                    <input
                      type="text"
                      placeholder="John Smith"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </label>
              </>
            )}

            <label className={styles.field}>
              <span>
                Email <span className={styles.required}>*</span>
              </span>
              <div className={styles.inputWrap}>
                <HugeIcon icon={Mail01Icon} size={18} />
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </label>

            <label className={styles.field}>
              <span>
                Password <span className={styles.required}>*</span>
              </span>
              <div className={styles.inputWrap}>
                <HugeIcon icon={LockKeyholeIcon} size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={isLogin ? "Enter your password" : "Create a password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isLogin ? undefined : 10}
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
              {!isLogin && <span className={styles.hint}>At least 10 characters.</span>}
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
            <button type="button" disabled aria-disabled="true" title="Coming soon">
              Google
            </button>
            <button type="button" disabled aria-disabled="true" title="Coming soon">
              Apple
            </button>
            <button type="button" disabled aria-disabled="true" title="Coming soon">
              Microsoft
            </button>
          </div>
          <p className={styles.socialNote}>Social sign-in is coming soon.</p>

          <p className={styles.switch}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <Link href={isLogin ? "/signup" : "/login"}>{isLogin ? "Sign up" : "Sign in"}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
