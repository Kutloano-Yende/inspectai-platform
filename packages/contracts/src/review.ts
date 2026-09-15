import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";
import { Finding } from "./analysis.js";

/**
 * Human decision layer. These records are written ONLY by an authenticated
 * human principal (landlord/PM) via apps/api review endpoints — the AI
 * pipeline has no write path here (AGENTS.md product principle 2).
 */

export const FindingDecision = z.enum(["ACCEPTED", "AMENDED", "REJECTED"]);

export const FindingReview = z.object({
  findingId: Id,
  decision: FindingDecision,
  /** Required when AMENDED: the landlord's corrected observation. */
  amendedObservation: z.string().min(1).optional(),
  landlordNote: z.string().optional(),
});
export type FindingReview = z.infer<typeof FindingReview>;

export const SubmitReviewRequest = z.object({
  inspectionId: Id,
  findingReviews: z.array(FindingReview).min(1),
  overallNote: z.string().optional(),
}).superRefine((req, ctx) => {
  for (const [i, fr] of req.findingReviews.entries()) {
    if (fr.decision === "AMENDED" && !fr.amendedObservation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["findingReviews", i, "amendedObservation"],
        message: "amendedObservation is required when a finding decision is AMENDED",
      });
    }
  }
});
export type SubmitReviewRequest = z.infer<typeof SubmitReviewRequest>;

export const InspectionReview = z.object({
  id: Id,
  inspectionId: Id,
  reviewedByUserId: Id,
  reviewedAt: IsoDateTime,
  findingReviews: z.array(FindingReview),
  overallNote: z.string().nullable(),
});
export type InspectionReview = z.infer<typeof InspectionReview>;

/* Report ---------------------------------------------------------------- */

/** Published reports are immutable and versioned. */
export const Report = z.object({
  id: Id,
  inspectionId: Id,
  organizationId: Id,
  version: z.number().int().min(1),
  /** Includes accepted/amended findings only; rejected findings are excluded with audit trail retained. */
  publishedByUserId: Id,
  publishedAt: IsoDateTime,
  pdfStorageKey: z.string(),
});
export type Report = z.infer<typeof Report>;

/* Deposit decision (Phase 4 — contract established now, endpoints later) -- */

export const DepositDecisionKind = z.enum(["APPROVE_FULL", "DEDUCT", "DISPUTE"]);

export const DepositDecision = z.object({
  id: Id,
  tenancyId: Id,
  kind: DepositDecisionKind,
  decidedByUserId: Id, // human principal, always
  decisionRationale: z.string().min(1),
  basedOnReportId: Id,
  decidedAt: IsoDateTime,
});
export type DepositDecision = z.infer<typeof DepositDecision>;
