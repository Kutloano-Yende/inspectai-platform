"use client";

import Link from "next/link";
import { useState } from "react";
import { useInspections } from "@/lib/hooks/useInspections";
import { LoadingState, ErrorState, EmptyState } from "@/components/States";
import styles from "./page.module.css";

export default function InspectionsPage() {
  const [status, setStatus] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = useInspections({ status: status || undefined, limit, offset });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!data) return <EmptyState />;

  const inspections = data.data;
  const { total, hasMore } = data.pagination;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Inspections</h1>
        <div className={styles.filters}>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className={styles.select}>
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="ANALYZING">Analyzing</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {inspections.length === 0 ? (
        <EmptyState message="No inspections found" />
      ) : (
        <>
          <div className={styles.list}>
            {inspections.map((inspection) => (
              <Link
                href={`/app/inspections/${inspection.id}`}
                key={inspection.id}
                className={styles.card}
              >
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{inspection.property?.address || "Unknown Property"}</h3>
                  <span className={`${styles.badge} ${styles[`badge-${inspection.status.toLowerCase().replace(/_/g, '-')}`]}`}>
                    {inspection.status}
                  </span>
                </div>
                <div className={styles.cardMeta}>
                  <span className={styles.metaItem}>Type: {inspection.type}</span>
                  <span className={styles.metaItem}>Analysis: {inspection.analysisStatus}</span>
                  {inspection.submittedAt && (
                    <span className={styles.metaItem}>Submitted: {new Date(inspection.submittedAt).toLocaleDateString()}</span>
                  )}
                  <span className={styles.metaItem}>Created: {new Date(inspection.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className={styles.pagination}>
            <p className={styles.pageInfo}>
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </p>
            <div className={styles.pageButtons}>
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className={styles.pageButton}
              >
                ← Previous
              </button>
              <button onClick={() => setOffset(offset + limit)} disabled={!hasMore} className={styles.pageButton}>
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
