"use client";

import { useEffect, useState } from "react";
import type { InspectionDetail } from "@/lib/hooks/useInspections";
import styles from "./EvidenceViewer.module.css";

interface EvidenceViewerProps {
  evidence: InspectionDetail["evidence"][0];
  onClose: () => void;
}

export function EvidenceViewer({ evidence, onClose }: EvidenceViewerProps) {
  const [isExpired, setIsExpired] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const checkExpiry = () => {
      const expiresAt = new Date(evidence.expiresAt);
      if (expiresAt < new Date()) {
        setIsExpired(true);
      }
    };
    checkExpiry();
  }, [evidence.expiresAt]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <dialog className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.content}>
          {isExpired ? (
            <div className={styles.expiredMessage}>
              <p>This evidence link has expired.</p>
              <p>Return to the inspection to view it again.</p>
            </div>
          ) : loadError ? (
            <div className={styles.errorMessage}>
              <p>Failed to load evidence.</p>
            </div>
          ) : evidence.kind === "PHOTO" ? (
            <img
              src={evidence.downloadUrl}
              alt="Evidence"
              className={styles.image}
              onError={() => setLoadError(true)}
            />
          ) : (
            <video
              src={evidence.downloadUrl}
              controls
              className={styles.video}
              onError={() => setLoadError(true)}
            />
          )}
        </div>

        <div className={styles.metadata}>
          <div className={styles.metaRow}>
            <span className={styles.label}>Checkpoint:</span>
            <span className={styles.value}>{evidence.checkpointId}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.label}>Kind:</span>
            <span className={styles.value}>{evidence.kind}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.label}>Captured:</span>
            <span className={styles.value}>{new Date(evidence.capturedAt).toLocaleString()}</span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.label}>Size:</span>
            <span className={styles.value}>{(evidence.bytes / 1024 / 1024).toFixed(2)} MB</span>
          </div>

          {evidence.verification && (
            <div className={styles.verification}>
              <h4>Verification</h4>
              <ul>
                {evidence.verification.freshnessVerified && <li>✓ Freshness verified</li>}
                {!evidence.verification.duplicateDetected && <li>✓ No duplicates detected</li>}
                {evidence.verification.qualityAcceptable && <li>✓ Quality acceptable</li>}
              </ul>
            </div>
          )}

          {evidence.gps && (
            <div className={styles.gps}>
              <h4>Location</h4>
              <p>{evidence.gps.latitude.toFixed(4)}°N {evidence.gps.longitude.toFixed(4)}°W</p>
              <p>Accuracy: ±{evidence.gps.accuracyM}m</p>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
