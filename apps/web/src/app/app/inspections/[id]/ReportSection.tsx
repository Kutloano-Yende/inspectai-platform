"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import { useDownloadReport } from "@/lib/hooks/useInspections";
import styles from "./ReportSection.module.css";

interface ReportSectionProps {
  reports: InspectionDetail["reports"];
}

function ReportCard({ report }: { report: InspectionDetail["reports"][0] }) {
  const downloadMutation = useDownloadReport(report.id);

  const handleDownload = async () => {
    try {
      const result = await downloadMutation.mutateAsync();
      // Open download in new tab/window
      window.open(result.url, "_blank");
    } catch (err) {
      // Error handled by mutation error state
    }
  };

  return (
    <div className={styles.reportCard}>
      <div className={styles.reportHeader}>
        <div>
          <p className={styles.reportTitle}>Report</p>
          <p className={styles.reportVersion}>v{report.version}</p>
        </div>
        <p className={styles.reportDate}>
          {new Date(report.publishedAt).toLocaleDateString()}
        </p>
      </div>
      <div className={styles.actions}>
        <button
          onClick={handleDownload}
          disabled={downloadMutation.isPending}
          className={styles.downloadButton}
        >
          {downloadMutation.isPending ? "Downloading..." : "Download PDF"}
        </button>
        {downloadMutation.error && (
          <p className={styles.error}>
            Download failed: {String(downloadMutation.error)}
          </p>
        )}
      </div>
    </div>
  );
}

export function ReportSection({ reports }: ReportSectionProps) {
  if (reports.length === 0) {
    return (
      <section className={styles.section}>
        <h2>Reports</h2>
        <div className={styles.empty}>No reports available.</div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2>Reports</h2>
      <div className={styles.reportsList}>
        {reports.map((report) => (
          <ReportCard key={report.id} report={report} />
        ))}
      </div>
    </section>
  );
}
