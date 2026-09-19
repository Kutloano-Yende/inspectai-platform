import styles from "./StatusProgress.module.css";

interface StatusProgressProps {
  status: string;
  analysisStatus?: string | undefined;
}

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  INVITED: "Invited",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  ANALYZING: "Analyzing",
  UNDER_REVIEW: "Under Review",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const analysisStatusMessages: Record<string, string> = {
  PENDING: "Analysis pending",
  RUNNING: "Analysis in progress. Findings will appear when complete.",
  COMPLETED: "Analysis complete",
  FAILED: "Analysis unavailable. Manual review required.",
};

export function StatusProgress({ status, analysisStatus }: StatusProgressProps) {
  const analysisMessage = analysisStatus ? analysisStatusMessages[analysisStatus] || analysisStatus : null;

  return (
    <div className={styles.container}>
      <div className={styles.statusCard}>
        <h3 className={styles.statusLabel}>Status</h3>
        <div className={`${styles.statusBadge} ${styles[`status-${status.toLowerCase()}`]}`}>
          {statusLabels[status] || status}
        </div>
      </div>

      {analysisStatus && (
        <div className={styles.statusCard}>
          <h3 className={styles.statusLabel}>Analysis</h3>
          <p className={styles.analysisMessage}>{analysisMessage}</p>
        </div>
      )}
    </div>
  );
}
