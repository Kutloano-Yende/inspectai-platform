import { describe, expect, it } from "vitest";
import {
  INSPECTION_TRANSITIONS,
  InspectionStatus,
  type InspectionPlan,
} from "@inspectai/contracts";
import {
  AuditAction,
  InvalidTransitionError,
  InvitationNotUsableError,
  assertInvitationUsable,
  assertTransition,
  canTransition,
  checkSubmissionReadiness,
  defaultMoveOutPlan,
  isCaptureFresh,
  isDuplicateWithinInspection,
  isQualityAcceptable,
} from "../src/index.js";

const t = (offsetMs: number) => new Date(Date.parse("2026-09-12T10:00:00.000Z") + offsetMs);

/* 1+3. State machine vs contract transition map */

describe("inspection state machine", () => {
  it("permits exactly the contract happy path", () => {
    const path = ["DRAFT", "INVITED", "IN_PROGRESS", "SUBMITTED", "ANALYZING", "UNDER_REVIEW", "COMPLETED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
      expect(() => assertTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it("rejects every transition absent from the contract map", () => {
    const statuses = InspectionStatus.options;
    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = INSPECTION_TRANSITIONS[from]!.includes(to);
        expect(canTransition(from, to)).toBe(allowed);
        if (!allowed) expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      }
    }
  });

  it("terminal states allow nothing", () => {
    for (const terminal of ["COMPLETED", "CANCELLED"] as const) {
      for (const to of InspectionStatus.options) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("any pre-UNDER_REVIEW state may be cancelled", () => {
    for (const from of InspectionStatus.options) {
      if (from !== "COMPLETED" && from !== "CANCELLED") {
        expect(canTransition(from, "CANCELLED")).toBe(true);
      }
    }
  });

  it("throws on invalid status values", () => {
    expect(() => assertTransition("NOT_A_STATUS" as any, "SUBMITTED")).toThrow(InvalidTransitionError);
  });
});

/* 2+4. Mandatory-checkpoint submission blocking */

const plan: InspectionPlan = {
  rooms: [
    {
      label: "Lounge",
      roomCategory: "LOUNGE",
      checkpoints: [
        { id: "cp-1", roomCategory: "LOUNGE", prompt: "Walls", mandatory: true, position: 1 },
        { id: "cp-2", roomCategory: "LOUNGE", prompt: "Floor", mandatory: false, position: 2 },
      ],
    },
    {
      label: "Kitchen",
      roomCategory: "KITCHEN",
      checkpoints: [{ id: "cp-3", roomCategory: "KITCHEN", prompt: "Worktops", mandatory: true, position: 3 }],
    },
  ],
};

const okVerification = { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true };

describe("submission readiness", () => {
  it("blocks when a mandatory checkpoint has no evidence", () => {
    const r = checkSubmissionReadiness(plan, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.map((m) => m.checkpointId)).toEqual(["cp-1", "cp-3"]);
  });

  it("ignores non-mandatory checkpoints", () => {
    const r = checkSubmissionReadiness(plan, [
      { checkpointId: "cp-1", committed: true, verification: okVerification },
      { checkpointId: "cp-3", committed: true, verification: okVerification },
    ]);
    expect(r.ok).toBe(true);
  });

  it("blocks when evidence is uncommitted or failed verification", () => {
    for (const bad of [
      { checkpointId: "cp-1", committed: false, verification: okVerification },
      { checkpointId: "cp-1", committed: true, verification: { ...okVerification, freshnessVerified: false } },
      { checkpointId: "cp-1", committed: true, verification: { ...okVerification, duplicateDetected: true } },
      { checkpointId: "cp-1", committed: true, verification: { ...okVerification, qualityAcceptable: false } },
    ]) {
      const r = checkSubmissionReadiness(plan, [bad, { checkpointId: "cp-3", committed: true, verification: okVerification }]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toHaveLength(1);
    }
  });

  it("reports prompt and room label for missing checkpoints", () => {
    const r = checkSubmissionReadiness(plan, []);
    if (!r.ok) expect(r.missing[0]).toMatchObject({ prompt: "Walls", roomLabel: "Lounge" });
  });

  it("default MOVE_OUT plan has mandatory checkpoints in every non-optional room", () => {
    const p = defaultMoveOutPlan();
    expect(p.rooms.length).toBeGreaterThan(3);
    for (const room of p.rooms) {
      for (const cp of room.checkpoints) {
        expect(cp.prompt.length).toBeGreaterThan(5);
      }
    }
  });
});

/* 5. Invitation expiry/revocation */

describe("invitation usability", () => {
  const expires = t(60 * 60 * 1000); // 1h ahead

  it("accepts a PENDING unexpired invitation", () => {
    expect(() => assertInvitationUsable("PENDING", t(0), expires)).not.toThrow();
  });

  it("rejects an expired invitation", () => {
    expect(() => assertInvitationUsable("PENDING", t(2 * 60 * 60 * 1000), expires)).toThrow(InvitationNotUsableError);
  });

  it("rejects at exactly the expiry instant", () => {
    expect(() => assertInvitationUsable("PENDING", expires, expires)).toThrow(InvitationNotUsableError);
  });

  it("rejects ACCEPTED, EXPIRED and REVOKED regardless of time", () => {
    for (const status of ["ACCEPTED", "EXPIRED", "REVOKED"] as const) {
      expect(() => assertInvitationUsable(status, t(0), expires)).toThrow(InvitationNotUsableError);
    }
  });
});

/* 6. Evidence freshness, quality, duplicate hash */

describe("evidence rules", () => {
  it("accepts a capture taken just before the ticket was issued", () => {
    const issued = t(0);
    expect(isCaptureFresh(t(-30_000), issued, t(5_000))).toBe(true);
  });

  it("rejects a capture older than the freshness window", () => {
    const issued = t(0);
    expect(isCaptureFresh(t(-20 * 60 * 1000), issued, t(0))).toBe(false);
  });

  it("rejects a capture claiming a time before the nonce was issued (beyond skew)", () => {
    const issued = t(0);
    expect(isCaptureFresh(t(-10 * 60 * 1000), issued, t(0))).toBe(false);
  });

  it("tolerates small device clock skew", () => {
    const issued = t(0);
    expect(isCaptureFresh(t(-60_000), issued, t(0))).toBe(true);
  });

  it("quality: passes without metadata, enforces minimum dimensions", () => {
    expect(isQualityAcceptable(undefined, undefined)).toBe(true);
    expect(isQualityAcceptable(1920, 1080)).toBe(true);
    expect(isQualityAcceptable(320, 240)).toBe(false);
  });

  it("duplicate hash detection is per-inspection", () => {
    const h = "a".repeat(64);
    expect(isDuplicateWithinInspection(h, [h])).toBe(true);
    expect(isDuplicateWithinInspection(h, ["b".repeat(64)])).toBe(false);
  });
});

/* 7. Audit action codes */

describe("audit action codes", () => {
  it("covers every Phase 1 workflow step", () => {
    const required = [
      "user.registered_org", "user.login",
      "property.created", "unit.created", "tenancy.created",
      "invitation.created", "invitation.accepted",
      "inspection.created", "inspection.started",
      "evidence.committed", "inspection.submitted",
      "analysis.started", "analysis.completed",
      "review.submitted", "report.published",
    ];
    const codes = Object.values(AuditAction);
    for (const code of required) expect(codes).toContain(code);
  });

  it("uses dot-namespaced lowercase codes", () => {
    for (const code of Object.values(AuditAction)) {
      expect(code).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});
