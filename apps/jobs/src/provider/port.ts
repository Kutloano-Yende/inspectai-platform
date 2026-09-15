import type { AnalysisResult, InspectionPlan } from "@inspectai/contracts";

/**
 * Provider port (ARCHITECTURE.md §8). Implementations see committed evidence only.
 * The pipeline — not the provider — assigns analysisId/inspectionId/status and
 * validates the final payload against the shared AnalysisResult contract BEFORE
 * any persistence. Providers never see or influence review/deposit decisions.
 */
export interface AnalysisInput {
  inspectionId: string;
  plan: InspectionPlan;
  evidence: Array<{
    id: string;
    checkpointId: string;
    kind: string; // PHOTO | VIDEO
    contentSha256: string;
    capturedAt: string; // ISO
  }>;
}

export type ProviderAnalysisOutput = Omit<AnalysisResult, "analysisId" | "inspectionId" | "status">;

export interface ConditionAnalysisProvider {
  readonly name: string;
  analyze(input: AnalysisInput): Promise<ProviderAnalysisOutput>;
}

export class ProviderTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Condition analysis exceeded ${timeoutMs}ms`);
  }
}

/** SRS §8: AI results within 60 seconds. */
export const ANALYSIS_TIMEOUT_MS = 55_000;

export function withTimeout<T>(promise: Promise<T>, timeoutMs = ANALYSIS_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs),
    ),
  ]);
}
