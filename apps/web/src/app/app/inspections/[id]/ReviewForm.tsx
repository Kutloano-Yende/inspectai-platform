"use client";

import { useState } from "react";
import type { InspectionDetail } from "@/lib/hooks/useInspections";
import { useSubmitReview } from "@/lib/hooks/useInspections";
import { FindingReviewCard } from "./FindingReviewCard";
import styles from "./ReviewForm.module.css";

interface ReviewFormProps {
  inspection: InspectionDetail;
  evidence: InspectionDetail["evidence"];
}

export function ReviewForm({ inspection, evidence }: ReviewFormProps) {
  const [reviews, setReviews] = useState<
    Record<
      string,
      {
        decision: "ACCEPTED" | "AMENDED" | "REJECTED";
        amendedObservation?: string;
        landlordNote?: string;
      }
    >
  >({});

  const [overallNote, setOverallNote] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const submitMutation = useSubmitReview(inspection.id);

  const isUnderReview = inspection.status === "UNDER_REVIEW";
  const analysis = inspection.analysis;

  if (!analysis || analysis.findings.length === 0) {
    return null;
  }

  const handleReviewChange = (
    findingId: string,
    value: {
      decision: "ACCEPTED" | "AMENDED" | "REJECTED";
      amendedObservation?: string;
      landlordNote?: string;
    }
  ) => {
    setReviews((prev) => ({
      ...prev,
      [findingId]: value,
    }));
    // Clear validation error for this finding when user makes a change
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[findingId];
      return next;
    });
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    let isValid = true;

    Object.entries(reviews).forEach(([findingId, review]) => {
      if (review.decision === "AMENDED" && !review.amendedObservation?.trim()) {
        errors[findingId] = "Amended observation is required";
        isValid = false;
      }
    });

    setValidationErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const findingReviews = Object.entries(reviews).map(([findingId, review]) => ({
      findingId,
      decision: review.decision,
      ...(review.amendedObservation ? { amendedObservation: review.amendedObservation } : {}),
      ...(review.landlordNote ? { landlordNote: review.landlordNote } : {}),
    }));

    try {
      await submitMutation.mutateAsync({
        findingReviews,
        ...(overallNote ? { overallNote } : {}),
      });
    } catch (err) {
      // Error handled by mutation error state
    }
  };

  // If review already submitted, show read-only view
  if (inspection.review) {
    return (
      <section className={styles.section}>
        <h2>Review (Submitted)</h2>
        <div className={styles.submittedMessage}>
          <p>Review submitted on {new Date(inspection.review.reviewedAt).toLocaleString()}</p>
        </div>
        <div className={styles.findingsList}>
          {analysis.findings.map((finding) => {
            const findingReview = inspection.review?.findingReviews.find((fr) => fr.findingId === finding.id);
            if (!findingReview) return null;

            return (
              <FindingReviewCard
                key={finding.id}
                finding={finding}
                evidence={evidence}
                isUnderReview={false}
                value={findingReview}
              />
            );
          })}
        </div>
      </section>
    );
  }

  if (!isUnderReview) {
    return null;
  }

  return (
    <section className={styles.section}>
      <h2>Review Findings</h2>
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.findingsList}>
          {analysis.findings.map((finding) => (
            <FindingReviewCard
              key={finding.id}
              finding={finding}
              evidence={evidence}
              isUnderReview={isUnderReview}
              value={reviews[finding.id]}
              onChange={(value) => handleReviewChange(finding.id, value)}
              validationError={validationErrors[finding.id]}
            />
          ))}
        </div>

        <div className={styles.overallNoteField}>
          <label htmlFor="overall-note">Overall note (optional):</label>
          <textarea
            id="overall-note"
            value={overallNote}
            onChange={(e) => setOverallNote(e.target.value)}
            placeholder="Add any additional notes about this inspection"
            rows={3}
          />
        </div>

        {submitMutation.error && (
          <div className={styles.errorMessage}>
            <p>Failed to submit review: {String(submitMutation.error)}</p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="submit"
            disabled={submitMutation.isPending || Object.keys(reviews).length === 0}
            className={styles.submitButton}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit Review"}
          </button>
          <p className={styles.helpText}>
            You must make a decision for at least one finding before submitting.
          </p>
        </div>
      </form>
    </section>
  );
}
