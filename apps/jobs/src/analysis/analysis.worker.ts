import type { PrismaClient, Prisma } from "@prisma/client";
import { AnalysisResult } from "@inspectai/contracts";
import { assertTransition, AuditAction } from "@inspectai/domain";
import { type ConditionAnalysisProvider, withTimeout } from "../provider/port.js";
import { Id, type AnalysisJobPayload } from "@inspectai/contracts";

export interface AnalysisWorkerDeps {
  prisma: PrismaClient;
  provider: ConditionAnalysisProvider;
}

/**
 * Analysis pipeline. The worker loads inspection + committed evidence directly
 * from the database (server-side; no client input participates beyond the
 * queue payload, which carries only an inspection id).
 *
 * Failure/invalid-output behaviour: the inspection is moved to UNDER_REVIEW with
 * a FAILED analysis row — it degrades to manual review and never blocks or fakes
 * the workflow. No partial findings are persisted.
 */
export function processAnalysisJob(deps: AnalysisWorkerDeps, payload: AnalysisJobPayload): Promise<void> {
  return runAnalysis(deps, payload).catch(async (err) => {
    console.error(`analysis failed for inspection ${payload.inspectionId}:`, err);
    await markFailed(deps, payload, err instanceof Error ? err.message : "unknown error");
  });
}

async function runAnalysis(deps: AnalysisWorkerDeps, payload: AnalysisJobPayload): Promise<void> {
  const { prisma, provider } = deps;

  const inspection = await prisma.inspection.findUnique({
    where: { id: payload.inspectionId },
    include: { evidence: true },
  });
  if (!inspection) throw new Error(`Inspection ${payload.inspectionId} not found`);
  if (inspection.status !== "ANALYZING") return; // state changed (e.g. cancelled) — skip gracefully

  const committed = inspection.evidence
    .filter((e) => e.committedAt != null)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const analysis = await prisma.aiAnalysis.create({
    data: {
      inspectionId: inspection.id,
      status: "RUNNING",
    },
  });
  await audit(deps, inspection.organizationId, null, AuditAction.AnalysisStarted, "AiAnalysis", analysis.id, { inspectionId: inspection.id });

  const input = {
    inspectionId: inspection.id,
    plan: inspection.plan as unknown as Parameters<typeof provider.analyze>[0]["plan"],
    evidence: committed.map((e) => ({
      id: e.id,
      checkpointId: e.checkpointId,
      kind: e.kind,
      contentSha256: e.contentSha256,
      capturedAt: e.capturedAt.toISOString(),
    })),
  };

  let output;
  try {
    output = await withTimeout(provider.analyze(input));
  } catch (err) {
    await markFailed(deps, payload, err instanceof Error ? err.message : "provider failed", analysis.id);
    return;
  }

  // Validate against the shared contract BEFORE any persistence. On failure,
  // nothing partial is stored — degrade to manual review.
  const candidate: AnalysisResult = {
    ...output,
    analysisId: Id.parse(analysis.id),
    inspectionId: Id.parse(inspection.id),
    status: "COMPLETED",
  };
  const parsed = AnalysisResult.safeParse(candidate);
  if (!parsed.success) {
    const errorMsg = `provider output failed contract validation: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`;
    await markFailed(deps, payload, errorMsg, analysis.id);
    return;
  }
  const valid = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.aiAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "COMPLETED",
        conditionScore: valid.conditionScore as unknown as Prisma.InputJsonValue,
        summary: valid.summary,
        provenance: {
          provider: valid.provenance.provider,
          model: valid.provenance.model,
          inputSetSha256: valid.provenance.inputSetSha256,
          completedAt: valid.provenance.completedAt,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    for (const f of valid.findings) {
      const checkpointRoom = (inspection.plan as { rooms?: Array<{ label: string; checkpoints: Array<{ id: string }> }> }).rooms
        ?.find((r) => r.checkpoints.some((cp) => cp.id === f.checkpointId));
      await tx.finding.create({
        data: {
          analysisId: analysis.id,
          ...(f.checkpointId ? { checkpointId: f.checkpointId } : {}),
          ...(checkpointRoom ? { roomLabel: checkpointRoom.label } : {}),
          category: f.category,
          severity: f.severity,
          confidence: f.confidence,
          observation: f.observation,
          evidenceIds: f.evidenceIds as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  assertTransition(inspection.status as never, "UNDER_REVIEW");
  await prisma.inspection.update({ where: { id: inspection.id }, data: { status: "UNDER_REVIEW" } });

  await audit(deps, inspection.organizationId, null, AuditAction.AnalysisCompleted, "AiAnalysis", analysis.id, {
    inspectionId: inspection.id,
    findings: valid.findings.length,
    provider: valid.provenance.provider,
    model: valid.provenance.model,
  });
}

async function markFailed(deps: AnalysisWorkerDeps, payload: AnalysisJobPayload, reason: string, existingAnalysisId?: string): Promise<void> {
  const { prisma } = deps;
  const inspection = await prisma.inspection.findUnique({ where: { id: payload.inspectionId } });
  if (!inspection) return;

  const analysisId = existingAnalysisId ?? (await prisma.aiAnalysis.findFirst({ where: { inspectionId: inspection.id, status: "RUNNING" } }))?.id;
  if (analysisId) {
    await prisma.aiAnalysis.update({ where: { id: analysisId }, data: { status: "FAILED" } });
  }

  // Degrade to manual review: ANALYZING → UNDER_REVIEW is a legal transition,
  // and the inspection remains fully available for human review.
  if (inspection.status === "ANALYZING") {
    await prisma.inspection.update({ where: { id: inspection.id }, data: { status: "UNDER_REVIEW" } });
  }
  await audit(deps, inspection.organizationId, null, AuditAction.AnalysisFailed, "AiAnalysis", analysisId ?? inspection.id, {
    inspectionId: inspection.id,
    reason,
  });
}

async function audit(
  deps: AnalysisWorkerDeps,
  organizationId: string,
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await deps.prisma.auditEvent.create({
    data: {
      organizationId,
      actorType: "SYSTEM",
      action,
      entityType,
      entityId,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}
