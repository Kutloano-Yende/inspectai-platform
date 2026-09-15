import { z } from "zod";
import { Id, IsoDateTime } from "./common.js";

export const InspectionType = z.enum(["MOVE_IN", "MOVE_OUT", "ROUTINE"]);
export type InspectionType = z.infer<typeof InspectionType>;

/**
 * Inspection lifecycle. The transition map is the contract; enforcement lives in
 * @inspectai/domain + apps/api (see AGENTS.md — never the frontend).
 * DRAFT → INVITED → IN_PROGRESS → SUBMITTED → ANALYZING → UNDER_REVIEW → COMPLETED
 * Any pre-UNDER_REVIEW state may → CANCELLED. CANCELLED is terminal.
 */
export const InspectionStatus = z.enum([
  "DRAFT",
  "INVITED",
  "IN_PROGRESS",
  "SUBMITTED",
  "ANALYZING",
  "UNDER_REVIEW",
  "COMPLETED",
  "CANCELLED",
]);
export type InspectionStatus = z.infer<typeof InspectionStatus>;

export const INSPECTION_TRANSITIONS: Readonly<Record<z.infer<typeof InspectionStatus>, readonly z.infer<typeof InspectionStatus>[]>> = {
  DRAFT: ["INVITED", "CANCELLED"],
  INVITED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["ANALYZING", "CANCELLED"],
  ANALYZING: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Room categories per SRS FR-006. Roof and utility areas are optional. */
export const RoomCategory = z.enum([
  "ENTRANCE", "LOUNGE", "BEDROOM", "BATHROOM", "KITCHEN",
  "GARAGE", "GARDEN", "ROOF", "UTILITY", "OTHER",
]);
export type RoomCategory = z.infer<typeof RoomCategory>;

export const Checkpoint = z.object({
  id: Id,
  roomCategory: RoomCategory,
  /** Human prompt shown to the tenant, e.g. "Photograph the lounge walls from the doorway". */
  prompt: z.string().min(1),
  mandatory: z.boolean(),
  /** Ordering within the guided flow. */
  position: z.number().int().min(0),
});
export type Checkpoint = z.infer<typeof Checkpoint>;

/**
 * Snapshot of the template copied onto the inspection at creation.
 * Guarantees historical consistency when templates later change.
 */
export const InspectionPlan = z.object({
  rooms: z.array(
    z.object({
      roomCategory: RoomCategory,
      label: z.string().min(1),
      checkpoints: z.array(Checkpoint),
    }),
  ),
});
export type InspectionPlan = z.infer<typeof InspectionPlan>;

export const Inspection = z.object({
  id: Id,
  tenancyId: Id,
  organizationId: Id,
  type: InspectionType,
  status: InspectionStatus,
  plan: InspectionPlan,
  scheduledFor: IsoDateTime.nullable(),
  submittedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Inspection = z.infer<typeof Inspection>;

/* ------------------------------------------------------------------ */
/* Evidence (FR-007)                                                   */
/* ------------------------------------------------------------------ */

export const EvidenceKind = z.enum(["PHOTO", "VIDEO"]);

/** GPS reading captured with the evidence. Accuracy in metres. */
export const Gps = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0),
});

/**
 * Step 1 of the upload flow: client requests a pre-signed PUT.
 * The server binds storageKey to checkpoint + inspection and issues a capture nonce.
 */
export const CreateEvidenceUploadRequest = z.object({
  inspectionId: Id,
  checkpointId: Id,
  kind: EvidenceKind,
  contentSha256: z.string().length(64),
  contentLengthBytes: z.number().int().positive().max(500 * 1024 * 1024),
  contentType: z.string(),
  capturedAt: IsoDateTime,
  gps: Gps.optional(),
  deviceMetadata: z.record(z.string()),
});
export type CreateEvidenceUploadRequest = z.infer<typeof CreateEvidenceUploadRequest>;

export const EvidenceUploadTicket = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string().min(1),
  evidenceId: Id,
  /** Server-issued nonce binding this capture to a freshness window. */
  captureNonce: z.string().min(16),
  expiresAt: IsoDateTime,
});
export type EvidenceUploadTicket = z.infer<typeof EvidenceUploadTicket>;

/** Step 2: client confirms the direct-to-storage upload; server verifies object + hash. */
export const CommitEvidenceRequest = z.object({
  evidenceId: Id,
  captureNonce: z.string().min(16),
});
export type CommitEvidenceRequest = z.infer<typeof CommitEvidenceRequest>;

export const EvidenceVerification = z.object({
  freshnessVerified: z.boolean(),
  duplicateDetected: z.boolean(),
  qualityAcceptable: z.boolean(),
  notes: z.array(z.string()),
});

export const Evidence = z.object({
  id: Id,
  inspectionId: Id,
  checkpointId: Id,
  kind: EvidenceKind,
  storageKey: z.string(),
  contentSha256: z.string().length(64),
  bytes: z.number().int().positive(),
  capturedAt: IsoDateTime,
  gps: Gps.nullable(),
  verification: EvidenceVerification,
  committedAt: IsoDateTime,
});
export type Evidence = z.infer<typeof Evidence>;

/** Submission is rejected unless every mandatory checkpoint has committed, verified evidence. */
export const SubmitInspectionRequest = z.object({ inspectionId: Id });
export type SubmitInspectionRequest = z.infer<typeof SubmitInspectionRequest>;

export const SubmissionRejection = z.object({
  code: z.literal("MANDATORY_CHECKPOINTS_INCOMPLETE"),
  missingCheckpoints: z.array(z.object({ checkpointId: Id, prompt: z.string(), roomLabel: z.string().optional() })),
});
export type SubmissionRejection = z.infer<typeof SubmissionRejection>;
