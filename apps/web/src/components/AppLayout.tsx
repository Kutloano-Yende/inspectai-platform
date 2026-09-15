"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/app/inspections" className={styles.logo}>
            InspectAI
          </Link>
          <nav className={styles.nav}>
            <Link href="/app/inspections" className={styles.navLink}>
              Inspections
            </Link>
            <Link href="/app/properties" className={styles.navLink}>
              Properties
            </Link>
          </nav>
          <div className={styles.userMenu}>
            {user && <span className={styles.userEmail}>{user.email}</span>}
            <button onClick={handleLogout} className={styles.logoutBtn}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
