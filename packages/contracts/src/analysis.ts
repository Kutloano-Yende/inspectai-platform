import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";

/**
 * AI-assisted condition analysis. All outputs are ADVISORY (see AGENTS.md):
 * they inform the landlord review and report but never a deposit/tenancy decision.
 */

export const AnalysisStatus = z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]);

/** Damage/condition categories per SRS FR-009. */
export const FindingCategory = z.enum([
  "WALL_DAMAGE", "FLOOR_DAMAGE", "WINDOW_ISSUE", "DOOR_ISSUE",
  "WATER_DAMAGE", "MOULD", "ELECTRICAL_ISSUE", "CEILING_DAMAGE",
  "KITCHEN_FIXTURE_ISSUE", "BATHROOM_FIXTURE_ISSUE", "CLEANLINESS",
  "GENERAL_WEAR", "OTHER",
]);

export const Severity = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const Finding = z.object({
  id: Id,
  checkpointId: Id.nullable(), // null = room-level or whole-property observation
  roomCategory: z.string().optional(),
  category: FindingCategory,
  severity: Severity,
  /** 0–1, rendered as a percentage. */
  confidence: z.number().min(0).max(1),
  observation: z.string().min(1),
  evidenceIds: z.array(Id).min(1), // evidence-before-conclusions invariant
  advisory: z.literal(true),
});
export type Finding = z.infer<typeof Finding>;

/** Change highlight between this inspection and a prior one (FR-010). */
export const ComparisonDelta = z.object({
  priorInspectionId: Id,
  priorEvidenceId: Id,
  currentEvidenceId: Id,
  changeSummary: z.string().min(1),
  severity: Severity,
});
export type ComparisonDelta = z.infer<typeof ComparisonDelta>;

/** Advisory recommendations per SRS FR-011. Cost is an indicative range only. */
export const RecommendationAction = z.enum([
  "CLEAN_ONLY", "PAINT", "REPAIR_CRACK", "REPLACE_FITTING",
  "REPLACE_APPLIANCE", "PROFESSIONAL_ASSESSMENT",
]);

export const Recommendation = z.object({
  id: Id,
  findingId: Id,
  action: RecommendationAction,
  confidence: z.number().min(0).max(1),
  estimatedEffort: z.enum(["MINOR", "MODERATE", "MAJOR"]),
  indicativeCost: z.object({
    currency: z.literal("ZAR"),
    min: z.number().min(0),
    max: z.number().min(0),
  }),
  advisory: z.literal(true),
});
export type Recommendation = z.infer<typeof Recommendation>;

/** 0–100 condition score with room breakdown (SRS definition). */
export const ConditionScore = z.object({
  overall: z.number().min(0).max(100),
  byRoom: z.array(z.object({ roomLabel: z.string(), score: z.number().min(0).max(100) })),
  advisory: z.literal(true),
});
export type ConditionScore = z.infer<typeof ConditionScore>;

/**
 * Full provider output contract. Anything failing this schema is rejected
 * by the pipeline (never surfaced raw to users) — ARCHITECTURE.md §8.
 */
export const AnalysisResult = z.object({
  analysisId: Id,
  inspectionId: Id,
  status: AnalysisStatus,
  findings: z.array(Finding),
  comparisons: z.array(ComparisonDelta),
  recommendations: z.array(Recommendation),
  conditionScore: ConditionScore.nullable(),
  summary: z.string().min(1),
  provenance: z.object({
    provider: z.string(),
    model: z.string(),
    inputSetSha256: z.string().length(64),
    completedAt: IsoDateTime,
  }),
});
export type AnalysisResult = z.infer<typeof AnalysisResult>;
