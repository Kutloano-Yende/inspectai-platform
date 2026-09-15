import type { PrismaClient } from "@prisma/client";
import { AuditAction, assertTransition } from "@inspectai/domain";
import { S3Storage } from "@inspectai/storage";
import { REPORTS_BUCKET_ENV } from "../config.js";
import { buildReportModel, type ReportModelInput } from "./report.model.js";
import { renderReportPdf } from "./pdf.js";
import type { ReportJobPayload } from "@inspectai/contracts";

export interface ReportWorkerDeps {
  prisma: PrismaClient;
  storage: S3Storage;
  reportsBucket: string;
}

/**
 * Report pipeline: renders the PDF from accepted/amended findings only, stores
 * it privately, and records an immutable versioned Report row. Publication was
 * authorised by the human principal in the job payload; the audit event carries
 * that actor. The AI pipeline has no path into this worker.
 */
export async function processReportJob(deps: ReportWorkerDeps, payload: ReportJobPayload): Promise<void> {
  const { prisma, storage } = deps;

  const inspection = await prisma.inspection.findUnique({
    where: { id: payload.inspectionId },
    include: {
      evidence: true,
      analyses: { orderBy: { id: "desc" }, include: { findings: true } },
      review: { include: { findingReviews: true, reviewedBy: true } },
      reports: { orderBy: { version: "desc" } },
      tenancy: { include: { unit: { include: { property: true } } } },
    },
  });
  const analysis = inspection?.analyses.find((a) => a.status === "COMPLETED") ?? inspection?.analyses[0] ?? null;
  if (!inspection) throw new Error(`Inspection ${payload.inspectionId} not found`);
  if (inspection.status !== "UNDER_REVIEW") {
    throw new Error(`Inspection ${payload.inspectionId} is ${inspection.status}; publication requires UNDER_REVIEW`);
  }

  const publisher = await prisma.user.findUniqueOrThrow({ where: { id: payload.requestedByUserId } });
  const unit = inspection.tenancy.unit;
  const property = unit.property;

  const modelInput: ReportModelInput = {
    inspection: {
      id: inspection.id,
      type: inspection.type,
      status: inspection.status,
      submittedAt: inspection.submittedAt,
      plan: inspection.plan,
    },
    property: { displayName: property.displayName, addressLine1: property.addressLine1, city: property.city, province: property.province },
    unit: { label: unit.label },
    findings: (analysis?.findings ?? []).map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      confidence: f.confidence,
      observation: f.observation,
      evidenceIds: f.evidenceIds,
    })),
    findingReviews: (inspection.review?.findingReviews ?? []).map((r) => ({
      findingId: r.findingId,
      decision: r.decision,
      amendedObservation: r.amendedObservation,
    })),
    analysis: analysis
      ? { summary: analysis.summary, provenance: analysis.provenance }
      : null,
    publishedBy: { fullName: publisher.fullName, email: publisher.email },
    publishedAt: new Date(),
    version: (inspection.reports[0]?.version ?? 0) + 1,
  };

  const model = buildReportModel(modelInput);
  const pdf = await renderReportPdf({
    property: model.property,
    unit: model.unit,
    inspection: { id: model.inspection.id, type: model.inspection.type, submittedAt: model.inspection.submittedAt },
    findings: model.findings,
    summary: model.summary,
    publishedBy: model.publishedBy,
    publishedAt: model.publishedAt,
    version: model.version,
  });

  const bucket = process.env[REPORTS_BUCKET_ENV] ?? deps.reportsBucket;
  const storageKey = `org/${inspection.organizationId}/inspection/${inspection.id}/report-v${model.version}.pdf`;
  await storage.putObject(bucket, storageKey, pdf, "application/pdf");

  // Report rows are created, never updated (immutability); (inspectionId, version) is unique.
  const report = await prisma.report.create({
    data: {
      inspectionId: inspection.id,
      organizationId: inspection.organizationId,
      version: model.version,
      publishedByUserId: payload.requestedByUserId,
      pdfStorageKey: storageKey,
    },
  });

  assertTransition(inspection.status as never, "COMPLETED");
  await prisma.inspection.update({
    where: { id: inspection.id },
    data: { status: "COMPLETED", completedAt: model.publishedAt },
  });

  await prisma.auditEvent.create({
    data: {
      organizationId: inspection.organizationId,
      actorType: "SYSTEM",
      action: AuditAction.ReportGenerated,
      entityType: "Report",
      entityId: report.id,
      metadata: { inspectionId: inspection.id, version: model.version, includedFindings: model.includedFindingIds.length, excludedFindings: model.excludedFindingIds.length },
    },
  });
  await prisma.auditEvent.create({
    data: {
      organizationId: inspection.organizationId,
      actorType: "USER",
      actorUserId: payload.requestedByUserId,
      action: AuditAction.ReportPublished,
      entityType: "Report",
      entityId: report.id,
      metadata: { inspectionId: inspection.id, version: model.version, storageKey },
    },
  });
}
