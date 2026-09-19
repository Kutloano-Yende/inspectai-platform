"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeIcon } from "../HugeIcon";
import styles from "./LandingNav.module.css";

const NAV_LINKS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For Landlords", href: "#landlord-review" },
  { label: "For Tenants", href: "#for-tenants" },
  { label: "Security", href: "#security" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.navbar}>
      <div className={styles.container}>
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/" className={styles.brand} aria-label="InspectAI home">
            <svg className={styles.brandMark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2.2" />
              <path d="M11 16.5L14.3 19.8L21 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            InspectAI
          </Link>

          <div className={styles.links}>
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </div>

          <div className={styles.actions}>
            <Link href="/login" className={styles.signIn}>
              Sign in
            </Link>
            <Link href="/login" className={styles.getStarted}>
              Get started
            </Link>
          </div>

          <button
            type="button"
            className={styles.menuToggle}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <HugeIcon icon={open ? Cancel01Icon : Menu01Icon} size={20} />
          </button>
        </nav>
      </div>

      {open && (
        <div id="mobile-nav" className={styles.mobileNav}>
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </a>
          ))}
          <div className={styles.mobileActions}>
            <Link href="/login" className={styles.signIn} onClick={() => setOpen(false)}>
              Sign in
            </Link>
            <Link href="/login" className={styles.getStarted} onClick={() => setOpen(false)}>
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
