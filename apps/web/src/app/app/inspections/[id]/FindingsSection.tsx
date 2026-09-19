"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./FindingsSection.module.css";

interface FindingsSectionProps {
  analysis: InspectionDetail["analysis"] | null;
  evidence: InspectionDetail["evidence"];
  findingReviews?: Array<{
    findingId: string;
    decision: "ACCEPTED" | "AMENDED" | "REJECTED";
    amendedObservation?: string;
    landlordNote?: string;
  }> | undefined;
}

export function FindingsSection({ analysis, evidence, findingReviews = [] }: FindingsSectionProps) {
  if (!analysis || analysis.findings.length === 0) {
    return (
      <section className={styles.section}>
        <h2>AI Analysis Findings</h2>
        <div className={styles.empty}>No findings available.</div>
      </section>
    );
  }

  const findingReviewsMap = new Map(findingReviews.map((fr) => [fr.findingId, fr]));

  return (
    <section className={styles.section}>
      <h2>AI Analysis Findings</h2>
      <div className={styles.findingsList}>
        {analysis.findings.map((finding) => {
          const review = findingReviewsMap.get(finding.id);
          return (
            <article key={finding.id} className={styles.finding}>
              <div className={styles.findingHeader}>
                <h3>{finding.observation}</h3>
                <div className={styles.badges}>
                  {finding.severity && (
                    <span className={`${styles.badge} ${styles[`severity-${finding.severity.toLowerCase()}`]}`}>
                      {finding.severity}
                    </span>
                  )}
                  {finding.confidence && (
                    <span className={styles.confidence}>
                      {Math.round(finding.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>


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

              {review && (
                <div className={styles.review}>
                  <h4>Landlord Review</h4>
                  <p>
                    <strong>Decision:</strong> {review.decision}
                  </p>
                  {review.amendedObservation && (
                    <p>
                      <strong>Amended:</strong> {review.amendedObservation}
                    </p>
                  )}
                  {review.landlordNote && <p className={styles.notes}>{review.landlordNote}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
