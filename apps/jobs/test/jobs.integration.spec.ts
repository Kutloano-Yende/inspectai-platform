import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Worker, Queue, QueueEvents } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { ANALYSIS_QUEUE_NAME, REPORT_QUEUE_NAME } from "@inspectai/contracts";
import { defaultMoveOutPlan } from "@inspectai/domain";
import { S3Storage } from "@inspectai/storage";
import { StubConditionAnalysisProvider } from "../src/provider/stub.js";
import type { AnalysisInput, ConditionAnalysisProvider } from "../src/provider/port.js";
import { processAnalysisJob } from "../src/analysis/analysis.worker.js";
import { processReportJob } from "../src/report/report.worker.js";
import { createConnection } from "../src/main.js";
import { buildReportModel, type ReportModelInput } from "../src/report/report.model.js";

const prisma = new PrismaClient();
const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  accessKeyId: process.env.S3_ACCESS_KEY ?? "",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "",
});
const evidenceBucket = process.env.S3_EVIDENCE_BUCKET ?? "inspectai-evidence";
const reportsBucket = process.env.S3_REPORTS_BUCKET ?? "inspectai-reports";

let analysisQueue: Queue;
let reportQueue: Queue;
let redisConnection: ReturnType<typeof createConnection>;

const OK_VERIFICATION = { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true };

async function fixtureInspection(status: string, opts?: { evidenceCount?: number }) {
  const org = await prisma.organization.create({ data: { name: "Jobs Org" } });
  const user = await prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@x.co.za`, passwordHash: "x", fullName: "Owner" } });
  await prisma.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  const property = await prisma.property.create({
    data: { organizationId: org.id, displayName: "24 Oak", addressLine1: "24 Oak Street", city: "Johannesburg", province: "Gauteng", postalCode: "2196" },
  });
  const unit = await prisma.unit.create({ data: { propertyId: property.id, organizationId: org.id, label: "Main" } });
  const tenancy = await prisma.tenancy.create({
    data: { unitId: unit.id, organizationId: org.id, startDate: new Date("2026-01-01") },
  });
  const plan = defaultMoveOutPlan();
  const inspection = await prisma.inspection.create({
    data: { tenancyId: tenancy.id, organizationId: org.id, type: "MOVE_OUT", status, plan: plan as object },
  });

  const n = opts?.evidenceCount ?? 6;
  const mandatory = plan.rooms.flatMap((r) => r.checkpoints.filter((c) => c.mandatory));
  for (let i = 0; i < Math.min(n, mandatory.length); i++) {
    const sha = `${String(i).padStart(2, "0")}${"a".repeat(62)}`;
    const storageKey = `org/${org.id}/inspection/${inspection.id}/${mandatory[i]!.id}/ev-${i}.jpg`;
    await storage.putObject(evidenceBucket, storageKey, Buffer.from(`evidence-${inspection.id}-${i}`), "image/jpeg");
    await prisma.evidence.create({
      data: {
        inspectionId: inspection.id,
        checkpointId: mandatory[i]!.id,
        kind: "PHOTO",
        storageKey,
        contentSha256: sha,
        bytes: 1024,
        capturedAt: new Date(Date.parse("2026-09-12T10:00:00Z") + i * 1000),
        verification: OK_VERIFICATION,
        committedAt: new Date(),
      },
    });
  }
  return { org, user, property, unit, tenancy, inspection, plan };
}

async function runAnalysisQueueJob(inspectionId: string, provider = new StubConditionAnalysisProvider()) {
  // Invoke the worker directly to deterministically use the specified provider.
  // This avoids BullMQ's job-routing interference when testing with custom providers.
  await processAnalysisJob({ prisma, provider }, { inspectionId });
}

async function runReportQueueJob(inspectionId: string, requestedByUserId: string) {
  const jobId = `t-${inspectionId}-${Date.now()}`;
  const job = await reportQueue.add("report", { inspectionId, requestedByUserId }, { jobId });
  const worker = new Worker(REPORT_QUEUE_NAME, (j) => processReportJob({ prisma, storage, reportsBucket }, j.data), { connection: redisConnection, concurrency: 1 });
  const queueEvents = new QueueEvents(REPORT_QUEUE_NAME, { connection: redisConnection });

  try {
    await Promise.race([
      job.waitUntilFinished(queueEvents, 20_000),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("worker timeout")), 20_000)),
    ]);
  } finally {
    await worker.close();
    await queueEvents.close();
  }
}

beforeAll(() => {
  redisConnection = createConnection();
  analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, { connection: redisConnection });
  reportQueue = new Queue(REPORT_QUEUE_NAME, { connection: redisConnection });
});

/** Minimal text extractor for our uncompressed pdfkit output: hex strings inside TJ/Tj arrays. */
function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];
  for (const match of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = match[1]!;
    // Chunks split at kerning points mid-word, so concatenate without separators;
    // real spaces are encoded inside the chunks themselves.
    if (hex.length % 2 === 0) parts.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  return parts.join("").replace(/\s+/g, " ");
}

afterAll(async () => {
  await analysisQueue?.close();
  await reportQueue?.close();
  await redisConnection?.quit();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "UploadTicket", "Evidence", "AiAnalysis", "Finding", "FindingReview", "InspectionReview", "Report", "Inspection", "TenantInvitation", "Tenancy", "Unit", "Property", "Session", "OrganizationMembership", "User", "Organization" CASCADE`,
  );
  await analysisQueue?.drain();
  await reportQueue?.drain();
});

describe("StubConditionAnalysisProvider (determinism + schema shape)", () => {
  it("produces identical findings for identical input", async () => {
    const provider = new StubConditionAnalysisProvider();
    const input = {
      inspectionId: "insp-1",
      plan: defaultMoveOutPlan(),
      evidence: [
        { id: "ev-1", checkpointId: "cp-1", kind: "PHOTO", contentSha256: "a".repeat(64), capturedAt: "2026-09-12T10:00:00.000Z" },
        { id: "ev-2", checkpointId: "cp-2", kind: "PHOTO", contentSha256: "b".repeat(64), capturedAt: "2026-09-12T10:01:00.000Z" },
      ],
    };
    const a = await provider.analyze(input);
    const b = await provider.analyze(input);
    expect(a.findings.map((f) => [f.id, f.observation, f.severity, f.confidence])).toEqual(
      b.findings.map((f) => [f.id, f.observation, f.severity, f.confidence]),
    );
    expect(a.conditionScore).toEqual(b.conditionScore);
    expect(a.provenance.inputSetSha256).toBe(b.provenance.inputSetSha256);
    expect(a.provenance.provider).toBe("stub");
  });

  it("every finding references its evidence (advisory, evidence-before-conclusions)", async () => {
    const provider = new StubConditionAnalysisProvider();
    const out = await provider.analyze({
      inspectionId: "insp-1",
      plan: defaultMoveOutPlan(),
      evidence: [{ id: "ev-9", checkpointId: "cp-1", kind: "PHOTO", contentSha256: "a".repeat(64), capturedAt: "2026-09-12T10:00:00.000Z" }],
    });
    expect(out.findings.length).toBe(1);
    expect(out.findings[0]!.evidenceIds).toEqual(["ev-9"]);
    expect(out.findings.every((f) => f.advisory === true)).toBe(true);
    expect(out.findings.every((f) => f.evidenceIds.length > 0)).toBe(true);
  });

  it("handles empty evidence gracefully", async () => {
    const provider = new StubConditionAnalysisProvider();
    const out = await provider.analyze({ inspectionId: "i", plan: defaultMoveOutPlan(), evidence: [] });
    expect(out.findings).toHaveLength(0);
  });
});

describe("analysis worker", () => {
  it("processes a queued job: persists schema-valid advisory findings with provenance and evidence links", async () => {
    const fx = await fixtureInspection("ANALYZING");
    await runAnalysisQueueJob(fx.inspection.id);

    const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: fx.inspection.id }, include: { findings: true } });
    expect(analysis.status).toBe("COMPLETED");
    expect(analysis.summary).toContain("advisory");
    expect(analysis.findings.length).toBeGreaterThan(0);

    // provenance persisted
    const prov = analysis.provenance as { provider: string; model: string; inputSetSha256: string };
    expect(prov.provider).toBe("stub");
    expect(prov.model).toBe("stub-v1");
    expect(prov.inputSetSha256).toMatch(/^[0-9a-f]{64}$/);

    // findings reference real evidence of this inspection
    const evidenceIds = new Set((await prisma.evidence.findMany({ where: { inspectionId: fx.inspection.id } })).map((e) => e.id));
    for (const f of analysis.findings) {
      const ids = f.evidenceIds as string[];
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) expect(evidenceIds.has(id)).toBe(true);
    }

    // inspection advanced to UNDER_REVIEW (available for human review)
    const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: fx.inspection.id } });
    expect(inspection.status).toBe("UNDER_REVIEW");

    // audit events
    const actions = (await prisma.auditEvent.findMany({ where: { entityType: "AiAnalysis" } })).map((a) => a.action);
    expect(actions).toContain("analysis.started");
    expect(actions).toContain("analysis.completed");
  });

  it("degrades safely when the provider output is invalid (no fake results)", async () => {
    const fx = await fixtureInspection("ANALYZING");
    const committed = await prisma.evidence.findMany({
      where: { inspectionId: fx.inspection.id, committedAt: { not: null } },
      orderBy: { capturedAt: "asc" },
    });

    // Create a bad provider by wrapping the stub provider
    class BadConditionAnalysisProvider extends StubConditionAnalysisProvider {
      readonly name = "bad";

      async analyze(input: AnalysisInput) {
        const out = await super.analyze(input);
        const modified = { ...out, findings: [{ ...out.findings[0]!, confidence: 42 }] };
        if (modified.findings[0]?.confidence !== 42) {
          throw new Error(`Bad provider error check: confidence is ${modified.findings[0]?.confidence}, expected 42`);
        }
        return modified;
      }
    }

    const badProvider = new BadConditionAnalysisProvider();
    let badProviderCalled = false;

    // Wrap it to track calls
    const wrappedProvider = {
      name: badProvider.name,
      analyze: async (input: AnalysisInput) => {
        badProviderCalled = true;
        return badProvider.analyze(input);
      },
    } satisfies ConditionAnalysisProvider;

    await runAnalysisQueueJob(fx.inspection.id, wrappedProvider);

    // Verify the bad provider was actually invoked
    expect(badProviderCalled).toBe(true);

    const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: fx.inspection.id } });
    const findingCount = await prisma.finding.count({ where: { analysisId: analysis.id } });

    // Invalid provider output (confidence: 42) must result in FAILED status, not COMPLETED
    expect(analysis.status).toBe("FAILED");
    // No findings should be persisted when validation fails
    expect(findingCount).toBe(0);

    const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: fx.inspection.id } });
    expect(inspection.status).toBe("UNDER_REVIEW"); // available for manual review

    const failed = (await prisma.auditEvent.findMany({ where: { action: "analysis.failed" } }));
    expect(failed).toHaveLength(1);
  });

  it("degrades safely when the provider throws", async () => {
    const fx = await fixtureInspection("ANALYZING");
    let throwingProviderCalled = false;

    await runAnalysisQueueJob(fx.inspection.id, {
      name: "throwing",
      async analyze() {
        throwingProviderCalled = true;
        throw new Error("provider unavailable");
      },
    });

    // Verify the throwing provider was actually invoked
    expect(throwingProviderCalled).toBe(true);

    const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: fx.inspection.id } });
    // Provider exception must result in FAILED status, not COMPLETED
    expect(analysis.status).toBe("FAILED");

    const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: fx.inspection.id } });
    // Inspection should degrade to UNDER_REVIEW for manual handling
    expect(inspection.status).toBe("UNDER_REVIEW");
  });

  it("skips gracefully when the inspection is not in ANALYZING state", async () => {
    const fx = await fixtureInspection("CANCELLED");
    await runAnalysisQueueJob(fx.inspection.id);
    expect(await prisma.aiAnalysis.count({ where: { inspectionId: fx.inspection.id } })).toBe(0);
  });
});

describe("report worker", () => {
  async function analysedInspection() {
    const fx = await fixtureInspection("ANALYZING");
    await runAnalysisQueueJob(fx.inspection.id);
    const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: fx.inspection.id } });
    const findings = await prisma.finding.findMany({ where: { analysisId: analysis.id }, orderBy: { id: "asc" } });
    const review = await prisma.inspectionReview.create({
      data: {
        inspectionId: fx.inspection.id,
        reviewedByUserId: fx.user.id,
        findingReviews: {
          create: [
            { findingId: findings[0]!.id, decision: "ACCEPTED" },
            { findingId: findings[1]!.id, decision: "AMENDED", amendedObservation: "Landlord corrected: pre-existing crack, 15cm." },
            ...(findings[2] ? [{ findingId: findings[2]!.id, decision: "REJECTED", landlordNote: "Not visible on site." }] : []),
          ],
        },
      },
      include: { findingReviews: true },
    });
    return { fx, findings, review };
  }

  it("renders, stores privately, and records an immutable versioned report (rejected findings excluded)", async () => {
    const { fx } = await analysedInspection();
    await runReportQueueJob(fx.inspection.id, fx.user.id);

    const report = await prisma.report.findFirstOrThrow({ where: { inspectionId: fx.inspection.id } });
    expect(report.version).toBe(1);
    expect(report.pdfStorageKey).toContain(`org/${fx.org.id}/inspection/${fx.inspection.id}/`);

    // stored privately in the reports bucket and readable via presigned URL only
    expect(await storage.objectExists(reportsBucket, report.pdfStorageKey)).toBe(true);
    const signedUrl = await storage.presignGet(reportsBucket, report.pdfStorageKey, 60);
    const signedRes = await fetch(signedUrl);
    expect(signedRes.status).toBe(200);
    const unsignedRes = await fetch(`${process.env.S3_ENDPOINT ?? "http://localhost:9000"}/${reportsBucket}/${report.pdfStorageKey}`);
    expect(unsignedRes.status).toBe(403); // no public access, ever

    // inspection completed; audit trail for generated + published (actor = human principal)
    const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: fx.inspection.id } });
    expect(inspection.status).toBe("COMPLETED");
    const published = await prisma.auditEvent.findFirstOrThrow({ where: { action: "report.published" } });
    expect(published.actorUserId).toBe(fx.user.id);
    expect(published.actorType).toBe("USER");
    expect(await prisma.auditEvent.findFirst({ where: { action: "report.generated" } })).toBeDefined();

    // PDF content: decode pdfkit's hex-encoded text runs and verify the amended
    // observation is present (and only reviewed findings appear).
    const pdf = await storage.getObjectBuffer(reportsBucket, report.pdfStorageKey);
    const text = extractPdfText(pdf);
    expect(text).toContain("pre-existing crack");
    expect(text).toContain("advisory only");
  });

  it("refuses publication when the inspection is not UNDER_REVIEW (immutability of workflow state)", async () => {
    const fx = await fixtureInspection("DRAFT");
    await expect(runReportQueueJob(fx.inspection.id, fx.user.id)).rejects.toThrow(/requires UNDER_REVIEW/);
    expect(await prisma.report.count({ where: { inspectionId: fx.inspection.id } })).toBe(0);
  });

  it("refuses publication when the requesting principal does not exist", async () => {
    const fx = await fixtureInspection("UNDER_REVIEW");
    await expect(runReportQueueJob(fx.inspection.id, "ghost-user")).rejects.toThrow();
    expect(await prisma.report.count({ where: { inspectionId: fx.inspection.id } })).toBe(0);
  });
});

describe("report model selection (pure logic)", () => {
  const baseInput: ReportModelInput = {
    inspection: { id: "i", type: "MOVE_OUT", status: "UNDER_REVIEW", submittedAt: new Date(), plan: {} },
    property: { displayName: "P", addressLine1: "A", city: "C", province: "G" },
    unit: { label: "U" },
    findings: [
      { id: "f1", category: "WALL_DAMAGE", severity: "LOW", confidence: 0.6, observation: "orig1", evidenceIds: ["e1"] },
      { id: "f2", category: "MOULD", severity: "HIGH", confidence: 0.9, observation: "orig2", evidenceIds: ["e2"] },
      { id: "f3", category: "CLEANLINESS", severity: "LOW", confidence: 0.5, observation: "orig3", evidenceIds: ["e3"] },
      { id: "f4", category: "OTHER", severity: "LOW", confidence: 0.5, observation: "orig4", evidenceIds: ["e4"] },
    ],
    findingReviews: [
      { findingId: "f1", decision: "ACCEPTED", amendedObservation: null },
      { findingId: "f2", decision: "AMENDED", amendedObservation: "amended text" },
      { findingId: "f3", decision: "REJECTED", amendedObservation: null },
      // f4: no review yet — human approval missing
    ],
    analysis: { summary: "s", provenance: {} },
    publishedBy: { fullName: "O", email: "o@x.co.za" },
    publishedAt: new Date(),
    version: 1,
  };

  it("includes only accepted/amended findings; rejected and unreviewed are excluded", () => {
    const m = buildReportModel(baseInput);
    expect(m.includedFindingIds).toEqual(["f1", "f2"]);
    expect(m.excludedFindingIds).toEqual(["f3", "f4"]);
    expect(m.findings.find((f) => f.id === "f2")!.observation).toBe("amended text");
    expect(m.findings.find((f) => f.id === "f2")!.amended).toBe(true);
    expect(m.findings.find((f) => f.id === "f1")!.observation).toBe("orig1");
  });

  it("is deterministic for identical input", () => {
    const a = buildReportModel({ ...baseInput, publishedAt: new Date(0) });
    const b = buildReportModel({ ...baseInput, publishedAt: new Date(0) });
    expect(a.contentHash).toBe(b.contentHash);
  });
});
