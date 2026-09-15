import { createHash } from "node:crypto";
import { Id, type Finding } from "@inspectai/contracts";
import { type AnalysisInput, type ConditionAnalysisProvider, type ProviderAnalysisOutput } from "../provider/port.js";

/**
 * Phase 1 deterministic stub (constraint: no real AI provider yet).
 * Same input → same findings, severities, confidences, score and summary.
 * Output is always schema-valid against the shared AnalysisResult contract.
 * Every finding references exactly the evidence it was derived from —
 * evidence before conclusions.
 */
export class StubConditionAnalysisProvider implements ConditionAnalysisProvider {
  readonly name = "stub";

  async analyze(input: AnalysisInput): Promise<ProviderAnalysisOutput> {
    const ordered = [...input.evidence].sort((a, b) =>
      a.capturedAt === b.capturedAt ? a.id.localeCompare(b.id) : a.capturedAt.localeCompare(b.capturedAt),
    );

    const findings: Finding[] = ordered.map((e, i) => ({
      id: Id.parse(`stub-finding-${i + 1}`),
      checkpointId: Id.parse(e.checkpointId),
      category: "GENERAL_WEAR",
      severity: "LOW",
      confidence: 0.62,
      observation: `Stub observation: routine wear recorded at checkpoint "${promptFor(input.plan, e.checkpointId)}".`,
      evidenceIds: [Id.parse(e.id)],
      advisory: true,
    }));

    const perRoom = new Map<string, number>();
    for (const room of input.plan.rooms) {
      const count = findings.filter((f) => room.checkpoints.some((cp) => cp.id === f.checkpointId)).length;
      perRoom.set(room.label, Math.max(0, 100 - 7 * count));
    }
    const conditionScore = {
      overall: Math.max(0, 100 - 7 * findings.length),
      byRoom: [...perRoom.entries()].map(([roomLabel, score]) => ({ roomLabel, score })),
      advisory: true as const,
    };

    const summary =
      findings.length === 0
        ? "Stub analysis: no committed evidence was available for this inspection."
        : `Stub analysis: ${findings.length} routine-wear observation(s) recorded. All findings are advisory and require landlord review.`;

    const inputSetSha256 = createHash("sha256")
      .update(ordered.map((e) => `${e.id}:${e.contentSha256}`).join("|"))
      .digest("hex");

    return {
      findings,
      comparisons: [],
      recommendations: [],
      conditionScore,
      summary,
      provenance: {
        provider: "stub",
        model: "stub-v1",
        inputSetSha256,
        completedAt: new Date().toISOString(),
      },
    };
  }
}

function promptFor(plan: AnalysisInput["plan"], checkpointId: string): string {
  for (const room of plan.rooms) {
    for (const cp of room.checkpoints) {
      if (cp.id === checkpointId) return cp.prompt;
    }
  }
  return checkpointId;
}
