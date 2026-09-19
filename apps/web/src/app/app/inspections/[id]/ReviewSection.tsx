"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./ReviewSection.module.css";

interface ReviewSectionProps {
  review: InspectionDetail["review"] | null;
}

export function ReviewSection({ review }: ReviewSectionProps) {
  if (!review) {
    return (
      <section className={styles.section}>
        <h2>Landlord Review</h2>
        <div className={styles.empty}>No review yet.</div>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2>Landlord Review</h2>
      <div className={styles.reviewContainer}>
        <div className={styles.reviewedAt}>
          <strong>Reviewed:</strong> {new Date(review.reviewedAt).toLocaleString()}
        </div>

        {review.findingReviews && review.findingReviews.length > 0 && (
          <div className={styles.findings}>
            <h3>Finding Reviews</h3>
            <ul className={styles.findingList}>
              {review.findingReviews.map((fr) => (
                <li key={fr.findingId} className={styles.findingReview}>
                  <div className={styles.decision}>
                    <span className={`${styles.decisionBadge} ${styles[`decision-${fr.decision.toLowerCase()}`]}`}>
                      {fr.decision}
                    </span>
                  </div>
                  {fr.amendedObservation && (
                    <p className={styles.amended}>{fr.amendedObservation}</p>
                  )}
                  {fr.landlordNote && <p className={styles.notes}>{fr.landlordNote}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
