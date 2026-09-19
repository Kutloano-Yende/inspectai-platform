"use client";

import { useInspection } from "@/lib/hooks/useInspections";
import { LoadingState, ErrorState } from "@/components/States";
import { InspectionHeader } from "./InspectionHeader";
import { StatusProgress } from "./StatusProgress";
import { RoomCheckpointNav } from "./RoomCheckpointNav";
import { EvidenceGallery } from "./EvidenceGallery";
import { AnalysisSection } from "./AnalysisSection";
import { FindingsSection } from "./FindingsSection";
import { ReviewForm } from "./ReviewForm";
import { ReviewSection } from "./ReviewSection";
import { ReportGenerationSection } from "./ReportGenerationSection";
import { ReportSection } from "./ReportSection";
import styles from "./page.module.css";
import { useState } from "react";

interface InspectionPageProps {
  params: { id: string };
}

export default function InspectionPage({ params }: InspectionPageProps) {
  const { data: inspection, isLoading, error } = useInspection(params.id);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState message={error.message} />;
  if (!inspection) return <ErrorState message="Inspection not found" />;

  return (
    <div className={styles.container}>
      <InspectionHeader inspection={inspection} />
      <StatusProgress status={inspection.status} analysisStatus={inspection.analysis?.status} />

      <div className={styles.mainContent}>
        <aside className={styles.sidebar}>
          <RoomCheckpointNav
            plan={inspection.plan}
            evidence={inspection.evidence}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
          />
        </aside>

        <main className={styles.main}>
          <EvidenceGallery
            evidence={inspection.evidence}
            selectedRoom={selectedRoom}
          />

          {(inspection.status === "SUBMITTED" || inspection.status === "ANALYZING" || inspection.analysis) && (
            <AnalysisSection inspection={inspection} evidence={inspection.evidence} />
          )}

          {inspection.analysis && !inspection.review && inspection.status === "UNDER_REVIEW" && (
            <FindingsSection
              analysis={inspection.analysis}
              evidence={inspection.evidence}
            />
          )}

          {inspection.status === "UNDER_REVIEW" && (
            <ReviewForm inspection={inspection} evidence={inspection.evidence} />
          )}

          {inspection.review && (
            <ReviewSection review={inspection.review} />
          )}

          {(inspection.status === "UNDER_REVIEW" || inspection.status === "COMPLETED") && (
            <ReportGenerationSection inspection={inspection} hasReview={!!inspection.review} />
          )}

          {inspection.reports && inspection.reports.length > 0 && (
            <ReportSection reports={inspection.reports} />
          )}
        </main>
      </div>
    </div>
  );
}
