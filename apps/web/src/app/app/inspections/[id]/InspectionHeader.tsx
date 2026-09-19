import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./InspectionHeader.module.css";

interface InspectionHeaderProps {
  inspection: InspectionDetail;
}

export function InspectionHeader({ inspection }: InspectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>
          {inspection.property?.address || "Unknown Property"}
        </h1>
        <p className={styles.property}>
          {inspection.property?.address && (
            <>
              Property • Type: <strong>{inspection.type}</strong>
            </>
          )}
        </p>
      </div>
      <div className={styles.meta}>
        <div className={styles.dateGroup}>
          <span className={styles.label}>Created</span>
          <span className={styles.value}>
            {new Date(inspection.createdAt).toLocaleDateString()}
          </span>
        </div>
        {inspection.submittedAt && (
          <div className={styles.dateGroup}>
            <span className={styles.label}>Submitted</span>
            <span className={styles.value}>
              {new Date(inspection.submittedAt).toLocaleDateString()}
            </span>
          </div>
        )}
        {inspection.completedAt && (
          <div className={styles.dateGroup}>
            <span className={styles.label}>Completed</span>
            <span className={styles.value}>
              {new Date(inspection.completedAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
