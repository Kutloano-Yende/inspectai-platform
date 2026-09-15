import { createHash } from "node:crypto";

export interface ReportFinding {
  id: string;
  category: string;
  severity: string;
  confidence: number;
  /** Amended observation when the landlord amended; original otherwise. */
  observation: string;
  amended: boolean;
  evidenceCount: number;
  decision: "ACCEPTED" | "AMENDED";
}

export interface ReportModelInput {
  inspection: {
    id: string;
    type: string;
    status: string;
    submittedAt: Date | null;
    plan: unknown;
  };
  property: { displayName: string; addressLine1: string; city: string; province: string } | null;
  unit: { label: string } | null;
  findings: Array<{
    id: string;
    category: string;
    severity: string;
    confidence: number;
    observation: string;
    evidenceIds: unknown; // Json column: string[]
  }>;
  findingReviews: Array<{
    findingId: string;
    decision: string;
    amendedObservation: string | null;
  }>;
  analysis: { summary: string | null; provenance: unknown } | null;
  publishedBy: { fullName: string; email: string };
  publishedAt: Date;
  version: number;
}

export interface ReportModel {
  inspection: ReportModelInput["inspection"];
  property: ReportModelInput["property"];
  unit: ReportModelInput["unit"];
  findings: ReportFinding[];
  includedFindingIds: string[];
  excludedFindingIds: string[];
  summary: string;
  analysisProvenance: unknown;
  publishedBy: { fullName: string; email: string };
  publishedAt: Date;
  version: number;
  contentHash: string;
}

/**
 * Report content selection — the evidence → finding → human-review chain:
 * only ACCEPTED and AMENDED findings enter the report. REJECTED findings are
 * excluded here, so they can never reach the rendered PDF. Unreviewed findings
 * (no decision yet) are also excluded — human approval is required.
 */
export function buildReportModel(input: ReportModelInput): ReportModel {
  const decisionByFinding = new Map(input.findingReviews.map((r) => [r.findingId, r]));

  const findings: ReportFinding[] = [];
  const included: string[] = [];
  const excluded: string[] = [];

  for (const f of input.findings) {
    const decision = decisionByFinding.get(f.id);
    if (decision?.decision === "ACCEPTED" || decision?.decision === "AMENDED") {
      findings.push({
        id: f.id,
        category: f.category,
        severity: f.severity,
        confidence: f.confidence,
        observation: decision.decision === "AMENDED" && decision.amendedObservation ? decision.amendedObservation : f.observation,
        amended: decision.decision === "AMENDED",
        evidenceCount: Array.isArray(f.evidenceIds) ? f.evidenceIds.length : 0,
        decision: decision.decision,
      });
      included.push(f.id);
    } else {
      excluded.push(f.id);
    }
  }

  const summary = input.analysis?.summary ?? "No AI analysis was available for this inspection (manual review).";

  const model: Omit<ReportModel, "contentHash"> = {
    inspection: input.inspection,
    property: input.property,
    unit: input.unit,
    findings,
    includedFindingIds: included,
    excludedFindingIds: excluded,
    summary,
    analysisProvenance: input.analysis?.provenance ?? null,
    publishedBy: input.publishedBy,
    publishedAt: input.publishedAt,
    version: input.version,
  };
  return {
    ...model,
    contentHash: createHash("sha256").update(canonicalJson(model)).digest("hex"),
  };
}

/** Deterministic JSON so the same content always hashes identically. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}
