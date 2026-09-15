import type { InspectionPlan } from "@inspectai/contracts";

export interface SubmissionEvidenceState {
  checkpointId: string;
  committed: boolean;
  verification: { freshnessVerified: boolean; duplicateDetected: boolean; qualityAcceptable: boolean };
}

export interface SubmissionBlock {
  checkpointId: string;
  prompt: string;
  roomLabel?: string;
}

/**
 * Submission is blocked unless every mandatory checkpoint in the plan snapshot
 * has committed evidence whose verification passed (fresh, non-duplicate, quality OK).
 */
export function checkSubmissionReadiness(
  plan: InspectionPlan,
  evidence: SubmissionEvidenceState[],
): { ok: true } | { ok: false; missing: SubmissionBlock[] } {
  const byCheckpoint = new Map(evidence.map((e) => [e.checkpointId, e]));
  const missing: SubmissionBlock[] = [];

  for (const room of plan.rooms) {
    for (const cp of room.checkpoints) {
      if (!cp.mandatory) continue;
      const e = byCheckpoint.get(cp.id);
      const passes =
        !!e &&
        e.committed &&
        e.verification.freshnessVerified &&
        !e.verification.duplicateDetected &&
        e.verification.qualityAcceptable;
      if (!passes) {
        missing.push({ checkpointId: cp.id, prompt: cp.prompt, roomLabel: room.label });
      }
    }
  }

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
