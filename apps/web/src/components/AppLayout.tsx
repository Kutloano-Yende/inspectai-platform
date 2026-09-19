"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard" },
  { label: "Inspections", href: "/app/inspections" },
  { label: "Properties", href: "/app/properties" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/app/dashboard" className={styles.logo}>
            InspectAI
          </Link>

          <nav className={styles.desktopNav}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ""}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.userMenu}>
            {user && <span className={styles.userEmail}>{user.email}</span>}
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>

          <button
            className={styles.mobileMenuToggle}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            ☰
          </button>
        </div>
      </header>

      {mobileMenuOpen && (
        <nav className={styles.mobileNav}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.mobileNavLink} ${isActive(item.href) ? styles.mobileNavLinkActive : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <main className={styles.main}>{children}</main>
    </div>
  );
}
