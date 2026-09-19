"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import { useRequestAnalysis } from "@/lib/hooks/useInspections";
import styles from "./AnalysisSection.module.css";

interface AnalysisSectionProps {
  inspection: InspectionDetail;
  evidence: InspectionDetail["evidence"];
}

const analysisStatusMessages: Record<string, string> = {
  PENDING: "Analysis pending",
  RUNNING: "Analysis is in progress. Findings will appear when complete.",
  COMPLETED: "Analysis complete",
  FAILED: "Analysis unavailable. Manual review required.",
};

export function AnalysisSection({ inspection, evidence }: AnalysisSectionProps) {
  const requestAnalysisMutation = useRequestAnalysis(inspection.id);

  const analysis = inspection.analysis;
  const canStartAnalysis = inspection.status === "SUBMITTED" && !analysis;
  const isAnalyzing = inspection.status === "ANALYZING";

  const handleStartAnalysis = async () => {
    try {
      await requestAnalysisMutation.mutateAsync();
    } catch (err) {
      // Error handled by mutation error state in component
    }
  };

  if (!analysis && !canStartAnalysis && inspection.status !== "ANALYZING") {
    return null;
  }

  return (
    <section className={styles.section}>
      <h2>AI Analysis</h2>

      {(canStartAnalysis || isAnalyzing) && (
        <div className={styles.actionContainer}>
          <button
            onClick={handleStartAnalysis}
            disabled={requestAnalysisMutation.isPending || isAnalyzing}
            className={styles.startButton}
          >
            {requestAnalysisMutation.isPending ? "Starting..." : "Start Analysis"}
          </button>
          {requestAnalysisMutation.error && (
            <div className={styles.error}>
              Failed to start analysis. {String(requestAnalysisMutation.error)}
            </div>
          )}
        </div>
      )}

      {isAnalyzing && !analysis && (
        <div className={styles.statusCard}>
          <p className={styles.statusMessage}>{analysisStatusMessages.RUNNING}</p>
        </div>
      )}

      {analysis && (
        <>
          <div className={styles.statusCard}>
            <p className={styles.statusMessage}>
              {analysisStatusMessages[analysis.status] || analysis.status}
            </p>
          </div>

          {analysis.status === "COMPLETED" && analysis.findings.length > 0 && (
            <div className={styles.findingsList}>
              {analysis.findings.map((finding) => (
                <div key={finding.id} className={styles.findingCard}>
                  <div className={styles.findingHeader}>
                    <h3 className={styles.observation}>{finding.observation}</h3>
                    <div className={styles.badges}>
                      <span className={`${styles.severity} ${styles[`severity-${finding.severity.toLowerCase()}`]}`}>
                        {finding.severity}
                      </span>
                      <span className={styles.confidence}>
                        Confidence: {(finding.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {finding.checkpointId && (
                    <p className={styles.checkpoint}>Checkpoint: {finding.checkpointId}</p>
                  )}

                  {finding.roomLabel && (
                    <p className={styles.room}>Room: {finding.roomLabel}</p>
                  )}

                  {finding.evidenceIds.length > 0 && (
                    <div className={styles.evidence}>
                      <h4>Linked Evidence</h4>
                      <ul>
                        {finding.evidenceIds
                          .map((evId) => evidence.find((e) => e.id === evId))
                          .filter(Boolean)
                          .map((ev) => (
                            <li key={ev!.id}>
                              {ev!.kind} • {new Date(ev!.capturedAt).toLocaleDateString()}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  <p className={styles.advisory}>
                    ℹ️ AI findings are advisory only. You decide whether to accept, amend, or reject.
                  </p>
                </div>
              ))}
            </div>
          )}

          {analysis.status === "FAILED" && (
            <div className={styles.failedMessage}>
              <p>Analysis could not be completed. Please review manually or try again.</p>
            </div>
          )}

          {analysis.status === "COMPLETED" && analysis.findings.length === 0 && (
            <div className={styles.empty}>No findings detected during analysis.</div>
          )}
        </>
      )}
    </section>
  );
}
