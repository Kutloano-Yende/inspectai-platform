import { Inject, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { CreateEvidenceUploadRequest, CommitEvidenceRequest, CreateInspectionRequest, SubmitReviewRequest } from "@inspectai/contracts";
import { AuditAction, assertTransition, checkSubmissionReadiness, defaultMoveOutPlan, isCaptureFresh, isDuplicateWithinInspection, isQualityAcceptable, InvalidTransitionError } from "@inspectai/domain";
import type { Prisma } from "@prisma/client";
import { ANALYSIS_QUEUE, REPORT_QUEUE } from "../queue/tokens.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { OrgAccessService, PORTFOLIO_ROLES } from "../org/org-access.service.js";
import { ConflictError, NotFoundError } from "../shared/errors.js";
import type { S3Storage } from "@inspectai/storage";
import type { Principal } from "../auth/principal.js";
import { STORAGE } from "../queue/tokens.js";
import { generateToken, sha256 } from "../shared/crypto.js";

const EVIDENCE_UPLOAD_TTL_MINUTES = 15;

@Injectable()
export class InspectionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OrgAccessService) private readonly org: OrgAccessService,
    @Inject(ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
    @Inject(REPORT_QUEUE) private readonly reportQueue: Queue,
    @Inject(STORAGE) private readonly storage: S3Storage,
  ) {}

  async createInspection(principal: Principal, tenancyId: string, dto: CreateInspectionRequest) {
    const tenancy = await this.prisma.tenancy.findUnique({ where: { id: tenancyId } });
    if (!tenancy) throw new NotFoundError("Tenancy not found");
    this.org.assertRole(principal, tenancy.organizationId, PORTFOLIO_ROLES);

    const row = await this.prisma.inspection.create({
      data: {
        tenancyId: tenancy.id,
        organizationId: tenancy.organizationId,
        type: dto.type,
        status: "DRAFT",
        plan: defaultMoveOutPlan() as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.record({
      organizationId: tenancy.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.InspectionCreated,
      entityType: "Inspection",
      entityId: row.id,
      metadata: { tenancyId: tenancy.id, type: dto.type },
    });
    return mapInspection(row);
  }

  async listInspections(
    principal: Principal,
    opts?: { status?: string | undefined; limit?: number; offset?: number },
  ) {
    const orgIds = (principal.memberships ?? []).map((m) => m.organizationId);
    const limit = Math.min(opts?.limit ?? 20, 100);
    const offset = opts?.offset ?? 0;

    const where: Prisma.InspectionWhereInput = {
      organizationId: { in: orgIds },
      ...(opts?.status ? { status: opts.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.inspection.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { tenancy: { include: { unit: { include: { property: true } } } }, analyses: { take: 1, orderBy: { id: "desc" } } },
        take: limit,
        skip: offset,
      }),
      this.prisma.inspection.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        tenancy: row.tenancy ? { id: row.tenancy.id } : null,
        property: row.tenancy?.unit?.property ? { id: row.tenancy.unit.property.id, address: row.tenancy.unit.property.displayName } : null,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        analysisStatus: row.analyses[0]?.status ?? "PENDING",
      })),
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    };
  }

  async getInspection(principal: Principal, id: string) {
    const row = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        evidence: true,
        analyses: { orderBy: { id: "desc" }, include: { findings: { include: { reviews: true } } } },
        review: { include: { findingReviews: true } },
        reports: { orderBy: { version: "desc" } },
      },
    });
    if (!row) throw new NotFoundError("Inspection not found");
    this.org.assertMembership(principal, row.organizationId);
    return await this.mapDetail(row);
  }

  async submitInspection(principal: Principal, id: string) {
    const row = await this.prisma.inspection.findUnique({ where: { id }, include: { evidence: true } });
    if (!row) throw new NotFoundError("Inspection not found");

    if (principal.type === "user") {
      this.org.assertRole(principal, row.organizationId, PORTFOLIO_ROLES);
    } else if (principal.type === "invitation") {
      if (principal.tenancyId !== row.tenancyId) {
        throw new ConflictError("INVALID_SCOPE", "Invitation not valid for this inspection");
      }
    }

    try {
      assertTransition(row.status as never, "SUBMITTED");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictError("INVALID_STATE", `Cannot submit inspection in ${row.status} state`);
      }
      throw err;
    }

    const committed = row.evidence.filter((e) => e.committedAt != null);
    const readiness = checkSubmissionReadiness(
      row.plan as never,
      committed.map((e) => ({
        checkpointId: e.checkpointId,
        committed: true,
        verification: e.verification as never,
      })),
    );

    if (!readiness.ok) {
      throw new ConflictError("MANDATORY_CHECKPOINTS_INCOMPLETE", "Not all mandatory checkpoints have verified evidence");
    }

    const updated = await this.prisma.inspection.update({
      where: { id: row.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });

    await this.audit.record({
      organizationId: row.organizationId,
      actorType: principal.type === "user" ? "USER" : "INVITATION_TOKEN",
      actorUserId: principal.type === "user" ? principal.userId ?? null : null,
      action: AuditAction.InspectionSubmitted,
      entityType: "Inspection",
      entityId: row.id,
    });

    return mapInspection(updated);
  }

  /** State-machine-enforced analysis trigger: only SUBMITTED inspections may be analysed. */
  async requestAnalysis(principal: Principal, id: string) {
    const row = await this.prisma.inspection.findUnique({ where: { id }, include: { evidence: true } });
    if (!row) throw new NotFoundError("Inspection not found");
    this.org.assertRole(principal, row.organizationId, PORTFOLIO_ROLES);

    try {
      assertTransition(row.status as never, "ANALYZING");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        throw new ConflictError("INVALID_STATE", `Cannot analyze inspection in ${row.status} state; must be SUBMITTED`);
      }
      throw err;
    }

    const committed = row.evidence.filter((e) => e.committedAt != null);
    const readiness = checkSubmissionReadiness(
      row.plan as never,
      committed.map((e) => ({
        checkpointId: e.checkpointId,
        committed: true,
        verification: e.verification as never,
      })),
    );
    if (!readiness.ok) {
      throw new ConflictError("MANDATORY_CHECKPOINTS_INCOMPLETE", "Committed evidence does not cover all mandatory checkpoints");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id: row.id }, data: { status: "ANALYZING" } });
      try {
        await this.analysisQueue.add("analyze", { inspectionId: row.id }, { jobId: `analyze-${row.id}-${Date.now()}` });
      } catch (err) {
        throw new Error(`queue unavailable: ${String(err)}`);
      }
    });
    // Non-transactional (Redis); emitted after the state change is durable.
    await this.audit.record({
      organizationId: row.organizationId,
      actorType: "USER",
      actorUserId: principal.userId ?? null,
      action: AuditAction.AnalysisRequested,
      entityType: "Inspection",
      entityId: row.id,
    });
    return { id: row.id, status: "ANALYZING" };
  }

  async submitReview(principal: Principal, id: string, dto: SubmitReviewRequest) {
    if (principal.type !== "user" || !principal.userId) {
      throw new ConflictError("INVALID_PRINCIPAL", "Review requires user authentication");
    }

    const row = await this.prisma.inspection.findUnique({
      where: { id },
      include: { analyses: { where: { status: "COMPLETED" }, include: { findings: true } } },
    });
    if (!row) throw new NotFoundError("Inspection not found");
    this.org.assertRole(principal, row.organizationId, PORTFOLIO_ROLES);

    if (row.status !== "UNDER_REVIEW") {
      throw new ConflictError("INVALID_STATE", `Review requires UNDER_REVIEW; inspection is ${row.status}`);
    }
    const findingIds = new Set(row.analyses.flatMap((a) => a.findings.map((f) => f.id)));
    for (const fr of dto.findingReviews) {
      if (!findingIds.has(fr.findingId)) throw new NotFoundError(`Finding ${fr.findingId} not found for this inspection`);
    }

    await this.prisma.$transaction(async (tx) => {
      const review = await tx.inspectionReview.create({
        data: {
          inspectionId: row.id,
          reviewedByUserId: principal.userId!,
          ...(dto.overallNote ? { overallNote: dto.overallNote } : {}),
          findingReviews: {
            create: dto.findingReviews.map((fr) => ({
              findingId: fr.findingId,
              decision: fr.decision,
              ...(fr.amendedObservation ? { amendedObservation: fr.amendedObservation } : {}),
              ...(fr.landlordNote ? { landlordNote: fr.landlordNote } : {}),
            })),
          },
        },
      });
      await this.audit.record({
        organizationId: row.organizationId,
        actorType: "USER",
        actorUserId: principal.userId ?? null,
        action: AuditAction.ReviewSubmitted,
        entityType: "InspectionReview",
        entityId: review.id,
        metadata: { inspectionId: row.id, decisions: dto.findingReviews.map((f) => f.decision) },
      });
      return review;
    });
    return { ok: true };
  }

  /** Publication is requested by an authorized human principal; the worker renders + records. */
  async requestReport(principal: Principal, id: string) {
    const row = await this.prisma.inspection.findUnique({ where: { id } });
    if (!row) throw new NotFoundError("Inspection not found");
    this.org.assertRole(principal, row.organizationId, PORTFOLIO_ROLES);

    if (row.status !== "UNDER_REVIEW") {
      throw new ConflictError("INVALID_STATE", `Report publication requires UNDER_REVIEW; inspection is ${row.status}`);
    }

    await this.reportQueue.add(
      "report",
      { inspectionId: row.id, requestedByUserId: principal.userId },
      { jobId: `report-${row.id}-${Date.now()}` },
    );
    return { queued: true as const, inspectionId: row.id };
  }

  async downloadReport(principal: Principal, reportId: string): Promise<{ url: string; expiresAt: string }> {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundError("Report not found");
    this.org.assertMembership(principal, report.organizationId);

    // Short-lived presigned GET, issued only after the authorization check above.
    const url = await this.storage.presignGet(process.env.S3_REPORTS_BUCKET ?? "inspectai-reports", report.pdfStorageKey, 60);
    return { url, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }

  async createEvidenceUploadTicket(principal: Principal, dto: CreateEvidenceUploadRequest) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id: dto.inspectionId },
      include: { tenancy: true },
    });
    if (!inspection) throw new NotFoundError("Inspection not found");

    if (inspection.status !== "IN_PROGRESS" && inspection.status !== "DRAFT") {
      throw new ConflictError("INVALID_STATE", "Evidence cannot be uploaded after submission");
    }

    if (principal.type === "user") {
      this.org.assertRole(principal, inspection.organizationId, PORTFOLIO_ROLES);
    } else if (principal.type === "invitation") {
      if (principal.tenancyId !== inspection.tenancyId || principal.organizationId !== inspection.organizationId) {
        throw new ConflictError("INVALID_SCOPE", "Invitation not valid for this inspection");
      }
    }

    const nonce = generateToken();
    const storageKey = `org/${inspection.organizationId}/inspection/${inspection.id}/${dto.checkpointId}/${generateToken().slice(0, 8)}.${this.getExtension(dto.contentType)}`;

    const evidence = await this.prisma.evidence.create({
      data: {
        inspectionId: inspection.id,
        checkpointId: dto.checkpointId,
        kind: dto.kind,
        storageKey,
        contentSha256: dto.contentSha256,
        bytes: dto.contentLengthBytes,
        capturedAt: new Date(dto.capturedAt),
        gps: (dto.gps || null) as unknown as Prisma.InputJsonValue,
        verification: { freshnessVerified: false, duplicateDetected: false, qualityAcceptable: false },
      },
    });

    const uploadUrl = await this.storage.presignPut(
      process.env.S3_EVIDENCE_BUCKET ?? "inspectai-evidence",
      storageKey,
      dto.contentType,
      EVIDENCE_UPLOAD_TTL_MINUTES * 60,
    );

    await this.audit.record({
      organizationId: inspection.organizationId,
      actorType: principal.type === "user" ? "USER" : "INVITATION_TOKEN",
      actorUserId: principal.type === "user" ? principal.userId ?? null : null,
      action: AuditAction.EvidenceUploadTicketIssued,
      entityType: "Evidence",
      entityId: evidence.id,
      metadata: { checkpointId: dto.checkpointId },
    });

    return {
      uploadUrl,
      storageKey,
      evidenceId: evidence.id,
      captureNonce: nonce,
      expiresAt: new Date(Date.now() + EVIDENCE_UPLOAD_TTL_MINUTES * 60_000).toISOString(),
    };
  }

  async commitEvidence(principal: Principal, dto: CommitEvidenceRequest) {
    const evidence = await this.prisma.evidence.findUnique({
      where: { id: dto.evidenceId },
      include: { inspection: true },
    });
    if (!evidence) throw new NotFoundError("Evidence not found");

    if (evidence.inspection.status === "SUBMITTED" || evidence.inspection.status === "ANALYZING" || evidence.inspection.status === "UNDER_REVIEW" || evidence.inspection.status === "COMPLETED") {
      throw new ConflictError("INVALID_STATE", "Evidence cannot be committed after inspection submission");
    }

    if (principal.type === "user") {
      this.org.assertRole(principal, evidence.inspection.organizationId, PORTFOLIO_ROLES);
    } else if (principal.type === "invitation") {
      if (principal.tenancyId !== evidence.inspection.tenancyId) {
        throw new ConflictError("INVALID_SCOPE", "Invitation not valid for this inspection");
      }
    }

    const now = new Date();
    const issuedAt = new Date(now.getTime() - EVIDENCE_UPLOAD_TTL_MINUTES * 60_000);

    const freshnessVerified = isCaptureFresh(evidence.capturedAt, issuedAt, now);
    const qualityAcceptable = isQualityAcceptable(); // No dimensions available client-side in commit

    const existingHashes = await this.prisma.evidence
      .findMany({
        where: { inspectionId: evidence.inspectionId, committedAt: { not: null } },
        select: { contentSha256: true },
      })
      .then((rows) => rows.map((r) => r.contentSha256));

    const duplicateDetected = isDuplicateWithinInspection(evidence.contentSha256, existingHashes);

    const verification = {
      freshnessVerified,
      duplicateDetected,
      qualityAcceptable,
    };

    const updated = await this.prisma.evidence.update({
      where: { id: evidence.id },
      data: {
        verification,
        committedAt: now,
      },
    });

    await this.audit.record({
      organizationId: evidence.inspection.organizationId,
      actorType: principal.type === "user" ? "USER" : "INVITATION_TOKEN",
      actorUserId: principal.type === "user" ? principal.userId ?? null : null,
      action: AuditAction.EvidenceCommitted,
      entityType: "Evidence",
      entityId: evidence.id,
      metadata: {
        checkpointId: evidence.checkpointId,
        verification,
      },
    });

    return mapEvidence(updated);
  }

  private getExtension(contentType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/quicktime": "mov",
    };
    return map[contentType] || "bin";
  }

  private async mapDetail(row: NonNullable<Awaited<ReturnType<InspectionService["getInspectionRow"]>>>) {
    const analysis = row.analyses[0] ?? null;
    const reviewByFinding = new Map((row.review?.findingReviews ?? []).map((r) => [r.findingId, r]));
    const evidenceBucket = process.env.S3_EVIDENCE_BUCKET ?? "inspectai-evidence";

    const evidenceWithUrls = await Promise.all(
      row.evidence.map(async (e) => ({
        ...mapEvidence(e),
        downloadUrl: await this.storage.presignGet(evidenceBucket, e.storageKey, 60),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }))
    );

    return {
      id: row.id,
      tenancyId: row.tenancyId,
      organizationId: row.organizationId,
      type: row.type,
      status: row.status,
      plan: row.plan,
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      evidence: evidenceWithUrls,
      analysis: analysis
        ? {
            id: analysis.id,
            status: analysis.status,
            summary: analysis.summary,
            conditionScore: analysis.conditionScore,
            provenance: analysis.provenance,
            findings: analysis.findings.map((f) => {
              const review = reviewByFinding.get(f.id);
              return {
                id: f.id,
                checkpointId: f.checkpointId ?? null,
                roomLabel: f.roomLabel ?? undefined,
                category: f.category,
                severity: f.severity,
                confidence: f.confidence,
                observation: f.observation,
                evidenceIds: f.evidenceIds,
                advisory: true as const,
                decision: review?.decision ?? null,
                amendedObservation: review?.amendedObservation ?? undefined,
                landlordNote: review?.landlordNote ?? undefined,
              };
            }),
          }
        : null,
      review: row.review
        ? { reviewedAt: row.review.reviewedAt, overallNote: row.review.overallNote, findingReviews: row.review.findingReviews }
        : null,
      reports: row.reports.map((r) => ({ id: r.id, version: r.version, publishedAt: r.publishedAt })),
    };
  }

  private getInspectionRow(id: string) {
    return this.prisma.inspection.findUnique({
      where: { id },
      include: {
        evidence: true,
        analyses: { orderBy: { id: "desc" }, include: { findings: true } },
        review: { include: { findingReviews: true } },
        reports: true,
      },
    });
  }
}

export function mapInspection(row: any) {
  return {
    id: row.id,
    tenancyId: row.tenancyId,
    organizationId: row.organizationId,
    type: row.type,
    status: row.status,
    plan: row.plan,
    submittedAt: row.submittedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

export function mapEvidence(row: any) {
  return {
    id: row.id,
    inspectionId: row.inspectionId,
    checkpointId: row.checkpointId,
    kind: row.kind,
    storageKey: row.storageKey,
    contentSha256: row.contentSha256,
    bytes: row.bytes,
    capturedAt: row.capturedAt,
    gps: row.gps,
    verification: row.verification,
    committedAt: row.committedAt,
  };
}
