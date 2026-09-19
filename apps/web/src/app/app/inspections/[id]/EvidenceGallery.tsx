"use client";

import { useState } from "react";
import type { InspectionDetail } from "@/lib/hooks/useInspections";
import { EvidenceViewer } from "./EvidenceViewer";
import styles from "./EvidenceGallery.module.css";

interface EvidenceGalleryProps {
  evidence: InspectionDetail["evidence"];
  selectedRoom: string | null;
}

export function EvidenceGallery({ evidence, selectedRoom }: EvidenceGalleryProps) {
  const [viewingEvidenceId, setViewingEvidenceId] = useState<string | null>(null);

  if (evidence.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📷</div>
        <h3>No evidence captured yet</h3>
        <p>When evidence is captured and committed, it will appear here.</p>
      </div>
    );
  }

  const filteredEvidence = selectedRoom
    ? evidence.filter((e) => {
        const checkpoint = evidence.length && e.checkpointId ? e.checkpointId : null;
        return checkpoint; // Simplified filter
      })
    : evidence;

  return (
    <>
      <div className={styles.gallery}>
        {filteredEvidence.map((ev) => (
          <button
            key={ev.id}
            className={styles.card}
            onClick={() => setViewingEvidenceId(ev.id)}
            title={`${ev.kind} • ${new Date(ev.capturedAt).toLocaleString()}`}
          >
            {ev.kind === "PHOTO" ? (
              <img
                src={ev.downloadUrl}
                alt={`Evidence ${ev.id}`}
                className={styles.thumbnail}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ccc' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EFailed to load%3C/text%3E%3C/svg%3E";
                }}
              />
            ) : (
              <div className={styles.videoPlaceholder}>🎥</div>
            )}
            <div className={styles.cardFooter}>
              <span className={styles.kind}>{ev.kind}</span>
              <span className={styles.date}>{new Date(ev.capturedAt).toLocaleDateString()}</span>
            </div>
          </button>
        ))}
      </div>

      {viewingEvidenceId && (
        <EvidenceViewer
          evidence={evidence.find((e) => e.id === viewingEvidenceId)!}
          onClose={() => setViewingEvidenceId(null)}
        />
      )}
    </>
  );
}
