import { PrismaClient } from "@prisma/client";
import { ANALYSIS_QUEUE_NAME, AnalysisJobPayload } from "@inspectai/contracts";
import { QueueEvents, Worker } from "bullmq";
import { StubConditionAnalysisProvider } from "./src/provider/stub.js";
import { processAnalysisJob } from "./src/analysis/analysis.worker.js";
import { createConnection } from "./src/main.js";
import { defaultMoveOutPlan } from "@inspectai/domain";

const prisma = new PrismaClient();
const connection = createConnection();

async function test() {
  // Setup
  const org = await prisma.organization.create({ data: { name: "Test" } });
  const user = await prisma.user.create({ data: { email: "test@test.com", passwordHash: "x", fullName: "Test" } });
  await prisma.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  const property = await prisma.property.create({ data: { organizationId: org.id, displayName: "P", addressLine1: "A", city: "C", province: "G", postalCode: "1" } });
  const unit = await prisma.unit.create({ data: { propertyId: property.id, organizationId: org.id, label: "U" } });
  const tenancy = await prisma.tenancy.create({ data: { unitId: unit.id, organizationId: org.id, startDate: new Date() } });
  const plan = defaultMoveOutPlan();
  const inspection = await prisma.inspection.create({ data: { tenancyId: tenancy.id, organizationId: org.id, type: "MOVE_OUT", status: "ANALYZING", plan: plan as object } });

  // Create evidence
  const evidence = await prisma.evidence.create({
    data: {
      inspectionId: inspection.id,
      checkpointId: "cp1",
      kind: "PHOTO",
      storageKey: "key",
      contentSha256: "a".repeat(64),
      bytes: 1000,
      capturedAt: new Date(),
      verification: { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true },
      committedAt: new Date(),
    },
  });

  console.log("Created inspection:", inspection.id, "with evidence:", evidence.id);

  // Create bad provider
  const badProvider = {
    name: "bad",
    async analyze() {
      const stub = new StubConditionAnalysisProvider();
      const out = await stub.analyze({ inspectionId: inspection.id, plan, evidence: [{ id: evidence.id, checkpointId: "cp1", kind: "PHOTO", contentSha256: "a".repeat(64), capturedAt: new Date().toISOString() }] });
      console.log("[test] Bad provider returning with confidence:", { ...out.findings[0]!, confidence: 42 });
      return { ...out, findings: [{ ...out.findings[0]!, confidence: 42 }] };
    },
  };

  // Run worker
  const queue = new Queue(ANALYSIS_QUEUE_NAME, { connection });
  const job = await queue.add("analyze", { inspectionId: inspection.id } as AnalysisJobPayload);

  console.log("Job added:", job.id);

  const worker = new Worker(ANALYSIS_QUEUE_NAME, async (j) => {
    console.log("[test] Worker processing job with data:", j.data);
    await processAnalysisJob({ prisma, provider: badProvider as any }, j.data as AnalysisJobPayload);
  }, { connection, concurrency: 1 });

  const queueEvents = new QueueEvents(ANALYSIS_QUEUE_NAME, { connection });

  try {
    await Promise.race([
      job.waitUntilFinished(queueEvents, 20_000),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20_000)),
    ]);
  } finally {
    await worker.close();
    await queueEvents.close();
  }

  // Check results
  const analysis = await prisma.aiAnalysis.findFirst({ where: { inspectionId: inspection.id } });
  console.log("\n[RESULT] Analysis status:", analysis?.status);
  console.log("[RESULT] Analysis ID:", analysis?.id);

  const auditEvents = await prisma.auditEvent.findMany({ where: { entityType: "AiAnalysis" } });
  console.log("[RESULT] Audit events:", auditEvents.map(e => e.action));

  // Cleanup
  await queue.close();
  await connection.quit();
  await prisma.$disconnect();
}

test().catch(console.error);
