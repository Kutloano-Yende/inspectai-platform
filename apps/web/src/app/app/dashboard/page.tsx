"use client";

import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import { useInspections } from "@/lib/hooks/useInspections";
import { LoadingState, ErrorState } from "@/components/States";
import styles from "./page.module.css";

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: response, isLoading: inspectionsLoading, error } = useInspections();

  if (authLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;

  const recentInspections = response?.data?.slice(0, 10) || [];

  return (
    <div className={styles.container}>
      <section className={styles.welcomeSection}>
        <h1 className={styles.title}>Welcome to InspectAI</h1>
        {user && (
          <p className={styles.subtitle}>
            {user.email} • {user.memberships.length} organization{user.memberships.length !== 1 ? "s" : ""}
          </p>
        )}
      </section>

      <section className={styles.inspectionsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Inspections</h2>
          <Link href="/app/inspections" className={styles.viewAllLink}>
            View all →
          </Link>
        </div>

        {inspectionsLoading ? (
          <div className={styles.loadingContainer}>
            <p className={styles.loadingText}>Loading inspections...</p>
          </div>
        ) : recentInspections.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>No inspections yet.</p>
            <p className={styles.emptyHint}>Create an inspection to get started.</p>
          </div>
        ) : (
          <div className={styles.inspectionsList}>
            {recentInspections.map((inspection) => (
              <Link
                key={inspection.id}
                href={`/app/inspections/${inspection.id}`}
                className={styles.inspectionCard}
              >
                <div className={styles.cardContent}>
                  <p className={styles.inspectionType}>{inspection.type}</p>
                  <p className={styles.inspectionStatus}>
                    <span className={`${styles.statusBadge} ${styles[`status-${inspection.status.toLowerCase()}`]}`}>
                      {inspection.status}
                    </span>
                  </p>
                  <p className={styles.inspectionDate}>
                    {new Date(inspection.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
