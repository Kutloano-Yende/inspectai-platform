"use client";

import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./FindingReviewCard.module.css";

type Finding = NonNullable<InspectionDetail["analysis"]>["findings"][0];

interface FindingReviewCardProps {
  finding: Finding;
  evidence: InspectionDetail["evidence"];
  isUnderReview: boolean;
  value?: {
    decision: "ACCEPTED" | "AMENDED" | "REJECTED";
    amendedObservation?: string;
    landlordNote?: string;
  } | null;
  onChange?: (value: {
    decision: "ACCEPTED" | "AMENDED" | "REJECTED";
    amendedObservation?: string;
    landlordNote?: string;
  }) => void;
  validationError?: string;
}

export function FindingReviewCard({
  finding,
  evidence,
  isUnderReview,
  value,
  onChange,
  validationError,
}: FindingReviewCardProps) {
  const decision = value?.decision ?? null;
  const isReadOnly = !isUnderReview || !onChange;

  const handleDecisionChange = (newDecision: "ACCEPTED" | "AMENDED" | "REJECTED") => {
    if (!isReadOnly && onChange) {
      const update: Parameters<typeof onChange>[0] = {
        decision: newDecision,
      };
      if (value?.amendedObservation) update.amendedObservation = value.amendedObservation;
      if (value?.landlordNote) update.landlordNote = value.landlordNote;
      onChange(update);
    }
  };

  const handleAmendedObservationChange = (text: string) => {
    if (!isReadOnly && onChange && decision) {
      const update: Parameters<typeof onChange>[0] = {
        decision,
      };
      if (text) update.amendedObservation = text;
      if (value?.landlordNote) update.landlordNote = value.landlordNote;
      onChange(update);
    }
  };

  const handleLandlordNoteChange = (text: string) => {
    if (!isReadOnly && onChange && decision) {
      const update: Parameters<typeof onChange>[0] = {
        decision,
      };
      if (value?.amendedObservation) update.amendedObservation = value.amendedObservation;
      if (text) update.landlordNote = text;
      onChange(update);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.findingInfo}>
        <h4 className={styles.observation}>{finding.observation}</h4>
        <div className={styles.badges}>
          <span className={`${styles.severity} ${styles[`severity-${finding.severity.toLowerCase()}`]}`}>
            {finding.severity}
          </span>
          <span className={styles.confidence}>
            {(finding.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      <p className={styles.advisory}>AI observation (advisory only)</p>

      {finding.checkpointId && (
        <p className={styles.checkpoint}>Checkpoint: {finding.checkpointId}</p>
      )}

      {finding.roomLabel && <p className={styles.room}>Room: {finding.roomLabel}</p>}

      {finding.evidenceIds.length > 0 && (
        <div className={styles.evidence}>
          <span className={styles.evidenceLabel}>Evidence:</span>
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

      <div className={styles.decisionSection}>
        <fieldset className={styles.decisionGroup} disabled={isReadOnly}>
          <legend>Your decision:</legend>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`decision-${finding.id}`}
              value="ACCEPTED"
              checked={decision === "ACCEPTED"}
              onChange={() => handleDecisionChange("ACCEPTED")}
              disabled={isReadOnly}
            />
            <span>Accept</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`decision-${finding.id}`}
              value="AMENDED"
              checked={decision === "AMENDED"}
              onChange={() => handleDecisionChange("AMENDED")}
              disabled={isReadOnly}
            />
            <span>Amend</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name={`decision-${finding.id}`}
              value="REJECTED"
              checked={decision === "REJECTED"}
              onChange={() => handleDecisionChange("REJECTED")}
              disabled={isReadOnly}
            />
            <span>Reject</span>
          </label>
        </fieldset>

        {decision === "AMENDED" && (
          <div className={styles.amendedObservationField}>
            <label htmlFor={`amended-${finding.id}`}>Amended observation (required):</label>
            <textarea
              id={`amended-${finding.id}`}
              value={value?.amendedObservation ?? ""}
              onChange={(e) => handleAmendedObservationChange(e.target.value)}
              disabled={isReadOnly}
              placeholder="Enter your corrected observation"
              className={validationError ? styles.error : ""}
              rows={3}
            />
            {validationError && (
              <span className={styles.errorMessage}>{validationError}</span>
            )}
          </div>
        )}

        <div className={styles.notesField}>
          <label htmlFor={`note-${finding.id}`}>Note (optional):</label>
          <textarea
            id={`note-${finding.id}`}
            value={value?.landlordNote ?? ""}
            onChange={(e) => handleLandlordNoteChange(e.target.value)}
            disabled={isReadOnly}
            placeholder="Add any additional notes"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
