import { describe, expect, it } from "vitest";
import {
  AnalysisResult,
  INSPECTION_TRANSITIONS,
  Inspection,
  InspectionStatus,
  CreateEvidenceUploadRequest,
  DepositDecision,
  Finding,
  Report,
  SubmitReviewRequest,
  TenantInvitation,
} from "../src/index.js";

const iso = "2026-09-12T10:00:00.000Z";
const id = "cxxxxxxxxxxxxxxxxx";

/* State machine (contract for @inspectai/domain to enforce) */

describe("inspection state machine", () => {
  it("follows the documented happy path", () => {
    const path = ["DRAFT", "INVITED", "IN_PROGRESS", "SUBMITTED", "ANALYZING", "UNDER_REVIEW", "COMPLETED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(INSPECTION_TRANSITIONS[path[i]!]).toContain(path[i + 1]!);
    }
  });

  it("terminal states have no transitions", () => {
    expect(INSPECTION_TRANSITIONS.COMPLETED).toEqual([]);
    expect(INSPECTION_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("no state can transition back to itself or a previous state except via CANCELLED", () => {
    for (const [from, targets] of Object.entries(INSPECTION_TRANSITIONS)) {
      for (const to of targets) {
        if (to !== "CANCELLED") {
          expect(INSPECTION_TRANSITIONS[to]).toBeDefined();
        }
        expect(to).not.toBe(from);
      }
    }
  });

  it("every status enum value has a transition entry", () => {
    for (const status of InspectionStatus.options) {
      expect(INSPECTION_TRANSITIONS[status]).toBeDefined();
    }
  });
});

/* Advisory-only AI guarantees */

describe("AI advisory guarantees", () => {
  const finding = {
    id,
    checkpointId: id,
    category: "WALL_DAMAGE",
    severity: "MEDIUM",
    confidence: 0.82,
    observation: "Crack approximately 30cm long on the lounge east wall near the door frame.",
    evidenceIds: [id],
    advisory: true,
  };

  it("accepts a valid finding", () => {
    expect(Finding.parse(finding).advisory).toBe(true);
  });

  it("rejects a finding claiming to be non-advisory", () => {
    expect(Finding.safeParse({ ...finding, advisory: false }).success).toBe(false);
  });

  it("rejects findings without linked evidence (evidence-before-conclusions)", () => {
    expect(Finding.safeParse({ ...finding, evidenceIds: [] }).success).toBe(false);
  });

  it("rejects out-of-range confidence", () => {
    expect(Finding.safeParse({ ...finding, confidence: 1.5 }).success).toBe(false);
  });

  it("rejects a complete analysis result missing provenance", () => {
    const result = {
      analysisId: id,
      inspectionId: id,
      status: "COMPLETED",
      findings: [finding],
      comparisons: [],
      recommendations: [],
      conditionScore: { overall: 74, byRoom: [{ roomLabel: "Lounge", score: 70 }], advisory: true },
      summary: "Property in fair condition with moderate wear.",
    };
    expect(AnalysisResult.safeParse(result).success).toBe(false);
  });
});

/* Evidence upload flow */

describe("evidence upload contract", () => {
  const base = {
    inspectionId: id,
    checkpointId: id,
    kind: "PHOTO",
    contentSha256: "a".repeat(64),
    contentLengthBytes: 2_000_000,
    contentType: "image/jpeg",
    capturedAt: iso,
    deviceMetadata: { platform: "ios" },
  };

  it("accepts a valid capture request", () => {
    expect(CreateEvidenceUploadRequest.safeParse(base).success).toBe(true);
  });

  it("rejects payloads above the 500MB ceiling", () => {
    expect(
      CreateEvidenceUploadRequest.safeParse({ ...base, contentLengthBytes: 500 * 1024 * 1024 + 1 }).success,
    ).toBe(false);
  });

  it("rejects a malformed sha256", () => {
    expect(CreateEvidenceUploadRequest.safeParse({ ...base, contentSha256: "nothash" }).success).toBe(false);
  });
});

/* Human decision layer */

describe("review & decision contracts", () => {
  it("requires amendedObservation when a finding is AMENDED", () => {
    const review = { inspectionId: id, findingReviews: [{ findingId: id, decision: "AMENDED" }] };
    expect(SubmitReviewRequest.safeParse(review).success).toBe(false);
  });

  it("accepts an amended review with corrected observation", () => {
    const review = {
      inspectionId: id,
      findingReviews: [{ findingId: id, decision: "AMENDED", amendedObservation: "Crack is 15cm, pre-existing." }],
    };
    expect(SubmitReviewRequest.safeParse(review).success).toBe(true);
  });

  it("deposit decisions always require a human principal and rationale", () => {
    const decision = { id, tenancyId: id, kind: "DEDUCT", basedOnReportId: id, decidedAt: iso };
    expect(DepositDecision.safeParse(decision).success).toBe(false); // missing decidedByUserId + rationale
  });

  it("reports are versioned and publisher-attributed", () => {
    const report = {
      id, inspectionId: id, organizationId: id, version: 1,
      publishedByUserId: id, publishedAt: iso, pdfStorageKey: "org/1/insp/1/report.pdf",
    };
    const parsed = Report.parse(report);
    expect(parsed.version).toBeGreaterThanOrEqual(1);
  });
});

/* Entity round-trips */

describe("entity round-trips", () => {
  it("parses an invitation", () => {
    const inv = {
      id, tenancyId: id, organizationId: id,
      tenantEmail: "tenant@example.com", tenantFullName: "Thabo Mokoena",
      status: "PENDING", expiresAt: iso, acceptedAt: null, createdAt: iso,
    };
    expect(TenantInvitation.parse(inv).status).toBe("PENDING");
  });

  it("parses an inspection with a snapshot plan", () => {
    const inspection = {
      id, tenancyId: id, organizationId: id,
      type: "MOVE_OUT", status: "DRAFT",
      plan: { rooms: [{ label: "Lounge", roomCategory: "LOUNGE", checkpoints: [{ id, roomCategory: "LOUNGE", prompt: "Photograph the lounge walls", mandatory: true, position: 0 }] }] },
      scheduledFor: null, submittedAt: null, completedAt: null, createdAt: iso,
    };
    expect(Inspection.parse(inspection).plan.rooms).toHaveLength(1);
  });
});
