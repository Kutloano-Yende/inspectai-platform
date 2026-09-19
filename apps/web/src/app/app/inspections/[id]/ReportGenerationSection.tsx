"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import { useRequestReport } from "@/lib/hooks/useInspections";
import styles from "./ReportGenerationSection.module.css";

interface ReportGenerationSectionProps {
  inspection: InspectionDetail;
  hasReview: boolean;
}

export function ReportGenerationSection({ inspection, hasReview }: ReportGenerationSectionProps) {
  const requestReportMutation = useRequestReport(inspection.id);

  const canRequestReport = inspection.status === "UNDER_REVIEW" && hasReview;
  const hasReports = inspection.reports && inspection.reports.length > 0;

  const handleRequestReport = async () => {
    try {
      await requestReportMutation.mutateAsync();
    } catch (err) {
      // Error handled by mutation error state
    }
  };

  if (!canRequestReport && !hasReports) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h2>Report Generation</h2>

      {canRequestReport && (
        <div className={styles.actionContainer}>
          <p className={styles.description}>
            Generate a PDF report summarizing the inspection findings and landlord review decisions.
          </p>
          <button
            onClick={handleRequestReport}
            disabled={requestReportMutation.isPending}
            className={styles.requestButton}
          >
            {requestReportMutation.isPending ? "Requesting..." : "Generate Report"}
          </button>
          {requestReportMutation.error && (
            <div className={styles.error}>
              Failed to request report. {String(requestReportMutation.error)}
            </div>
          )}
          {requestReportMutation.data && (
            <div className={styles.success}>
              <p>Report generation requested. It will appear below when ready.</p>
            </div>
          )}
        </div>
      )}

      {hasReports && (
        <div className={styles.statusInfo}>
          <p className={styles.statusMessage}>
            {inspection.reports.length} report{inspection.reports.length !== 1 ? "s" : ""} available.
          </p>
        </div>
      )}
    </section>
  );
}
