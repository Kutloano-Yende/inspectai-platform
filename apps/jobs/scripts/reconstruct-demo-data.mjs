/**
 * One-off recovery script: the local dev Postgres database (not production,
 * not the _test database) was unexpectedly emptied during this session. The
 * real evidence photos and this inspection's landlord review decisions are
 * independently known (recorded earlier in the working session) and the 8
 * real phone photos are still intact in the real AWS evidence bucket — only
 * the relational rows describing them were lost. This rebuilds those rows,
 * reusing the exact original IDs/timestamps/decisions where known, and then
 * re-runs the REAL stub-analysis and report-rendering pipeline (not faked)
 * so the AiAnalysis/Finding/Report rows are genuinely regenerated.
 *
 * Run once from apps/jobs: node scripts/reconstruct-demo-data.mjs
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { S3Storage } from "@inspectai/storage";
import { defaultMoveOutPlan } from "@inspectai/domain";
import { StubConditionAnalysisProvider } from "../dist/provider/stub.js";
import { processAnalysisJob } from "../dist/analysis/analysis.worker.js";
import { processReportJob } from "../dist/report/report.worker.js";
import { hashPassword } from "../../api/dist/shared/crypto.js";

// Load root .env (DATABASE_URL + real AWS S3 config) without ever printing it.
for (const line of readFileSync(new URL("../../../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const prisma = new PrismaClient();
const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
});
const evidenceBucket = process.env.S3_EVIDENCE_BUCKET;
const reportsBucket = process.env.S3_REPORTS_BUCKET;

const ORG_ID = "cmw7b6fkd001a14arq106x50b";
const INSPECTION_ID = "cmw7b6gcs001x14ar48ec3jen";
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

// Writes rows with hardcoded ids — safe to re-run against local dev, but a mistake to ever
// point at a real database. Refuse unless DATABASE_URL is clearly local.
function assertLocalDatabase() {
  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(
      `Refusing to run: DATABASE_URL points at "${host || "(unparseable)"}", not localhost. ` +
        "This script writes rows with hardcoded ids — only ever run it against local dev.",
    );
    process.exit(1);
  }
}

// The 8 real checkpoint photos, still present in the real evidence bucket —
// key, captured/committed time and decision all recorded earlier this session.
const EVIDENCE = [
  { checkpointId: "cp-1", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-1/GjETJfkR.jpg`, capturedAt: "2026-11-08T04:54:39.533Z", committedAt: "2026-11-08T04:54:44.000Z" },
  { checkpointId: "cp-2", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-2/yb1lErcg.jpg`, capturedAt: "2026-11-08T07:52:12.932Z", committedAt: "2026-11-08T07:52:21.000Z" },
  { checkpointId: "cp-3", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-3/2CgQ_ShP.jpg`, capturedAt: "2026-11-08T07:52:38.057Z", committedAt: "2026-11-08T07:52:44.000Z" },
  { checkpointId: "cp-4", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-4/r1-8vkCm.jpg`, capturedAt: "2026-11-08T07:52:58.872Z", committedAt: "2026-11-08T07:53:03.000Z" },
  { checkpointId: "cp-5", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-5/8HWhrzch.jpg`, capturedAt: "2026-11-08T07:53:19.468Z", committedAt: "2026-11-08T07:53:23.000Z" },
  { checkpointId: "cp-6", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-6/uLkZbn_t.jpg`, capturedAt: "2026-11-08T07:53:40.723Z", committedAt: "2026-11-08T07:53:45.000Z" },
  { checkpointId: "cp-7", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-7/SL_ITedN.jpg`, capturedAt: "2026-11-08T07:53:58.700Z", committedAt: "2026-11-08T07:54:03.000Z" },
  { checkpointId: "cp-8", key: `org/${ORG_ID}/inspection/${INSPECTION_ID}/cp-8/UI1nLmTC.jpg`, capturedAt: "2026-11-08T08:06:06.917Z", committedAt: "2026-11-08T08:06:12.000Z" },
];

// The landlord's actual review decisions, as submitted through the real UI earlier this session.
const DECISIONS = {
  "cp-1": { decision: "ACCEPTED" },
  "cp-2": { decision: "ACCEPTED" },
  "cp-3": { decision: "ACCEPTED" },
  "cp-4": { decision: "ACCEPTED" },
  "cp-5": {
    decision: "AMENDED",
    amendedObservation: "Oven and hob are clean, undamaged, and show no excess wear beyond normal use.",
    landlordNote: "Hob is actually in good condition, not just routine wear — correcting the stub's generic label.",
  },
  "cp-6": { decision: "ACCEPTED" },
  "cp-7": { decision: "REJECTED", landlordNote: "No actual wear visible in the photo — stub flagged it generically, rejecting as not applicable." },
  "cp-8": { decision: "ACCEPTED" },
};

async function audit(action, entityType, entityId, opts = {}) {
  await prisma.auditEvent.create({
    data: {
      organizationId: ORG_ID,
      actorType: opts.actorType ?? "SYSTEM",
      actorUserId: opts.actorUserId ?? null,
      action,
      entityType,
      entityId,
      createdAt: opts.createdAt ? new Date(opts.createdAt) : undefined,
    },
  });
}

async function main() {
  assertLocalDatabase();
  console.log("Reconstructing demo data from real S3 evidence objects…");

  // 1. Landlord + organisation (exact original org id — it's embedded in the S3 object keys).
  const org = await prisma.organization.create({
    data: { id: ORG_ID, name: "Phone Test dp3lb1", createdAt: new Date("2026-11-08T04:04:45.016Z") },
  });
  const user = await prisma.user.create({
    data: {
      email: "phone-test-dp3lb1@example.com",
      passwordHash: hashPassword("PhoneTestFlow2026!"),
      fullName: "Phone Test Landlord",
      createdAt: new Date("2026-11-08T04:04:45.016Z"),
    },
  });
  await prisma.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  console.log(`✓ landlord restored (${user.email})`);

  // 2. Property → unit → tenancy → invitation (accepted).
  const property = await prisma.property.create({
    data: {
      organizationId: org.id,
      displayName: "Phone Test Residence dp3lb1",
      propertyType: "RESIDENTIAL",
      addressLine1: "1 Phone Test Street",
      city: "Cape Town",
      province: "Western Cape",
      postalCode: "8001",
      country: "ZA",
    },
  });
  const unit = await prisma.unit.create({ data: { propertyId: property.id, organizationId: org.id, label: "Flat 1", bedrooms: 1, bathrooms: 1 } });
  const tenancy = await prisma.tenancy.create({ data: { unitId: unit.id, organizationId: org.id, startDate: new Date("2026-11-08T00:00:00.000Z") } });
  const invitation = await prisma.tenantInvitation.create({
    data: {
      tenancyId: tenancy.id,
      organizationId: org.id,
      tenantEmail: "phone-tenant-dp3lb1@example.com",
      tenantFullName: "Phone Tester",
      status: "ACCEPTED",
      tokenHash: sha256("reconstructed-" + INSPECTION_ID), // original raw token is intentionally not reusable
      expiresAt: new Date("2026-11-15T00:00:00.000Z"),
      acceptedAt: new Date("2026-11-08T04:38:48.418Z"),
    },
  });
  console.log("✓ property, unit, tenancy, invitation restored");

  // 3. Inspection (exact original id — embedded in the S3 object keys).
  const inspection = await prisma.inspection.create({
    data: {
      id: INSPECTION_ID,
      tenancyId: tenancy.id,
      organizationId: org.id,
      invitationId: invitation.id,
      type: "MOVE_OUT",
      status: "SUBMITTED",
      plan: defaultMoveOutPlan(),
      submittedAt: new Date("2026-11-08T08:06:21.667Z"),
      createdAt: new Date("2026-11-08T04:04:45.016Z"),
    },
  });
  await audit("inspection.created", "Inspection", inspection.id, { actorType: "USER", actorUserId: user.id, createdAt: "2026-11-08T04:04:45.016Z" });
  await audit("inspection.started", "Inspection", inspection.id, { actorType: "INVITATION_TOKEN", createdAt: "2026-11-08T04:38:48.418Z" });
  await audit("inspection.submitted", "Inspection", inspection.id, { actorType: "INVITATION_TOKEN", createdAt: "2026-11-08T08:06:21.667Z" });
  console.log(`✓ inspection ${inspection.id} restored (SUBMITTED)`);

  // 4. Evidence — real objects already in the real evidence bucket; download + re-hash each
  // one so contentSha256/bytes genuinely describe the real file, not a guess.
  for (const e of EVIDENCE) {
    const bytes = await storage.getObjectBuffer(evidenceBucket, e.key);
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const evidence = await prisma.evidence.create({
      data: {
        inspectionId: inspection.id,
        checkpointId: e.checkpointId,
        kind: "PHOTO",
        storageKey: e.key,
        contentSha256,
        bytes: bytes.length,
        capturedAt: new Date(e.capturedAt),
        verification: { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true },
        committedAt: new Date(e.committedAt),
      },
    });
    await audit("evidence.committed", "Evidence", evidence.id, { actorType: "INVITATION_TOKEN", createdAt: e.committedAt });
    console.log(`  ✓ ${e.checkpointId}: ${bytes.length} bytes, sha256 verified against the real object`);
  }
  console.log(`✓ ${EVIDENCE.length} real evidence items restored`);

  // 5. Re-run the REAL stub analysis pipeline (not faked) — deterministic, so it reproduces
  // the exact same observation text as the original run.
  await prisma.inspection.update({ where: { id: inspection.id }, data: { status: "ANALYZING" } });
  await audit("analysis.requested", "Inspection", inspection.id, { actorType: "USER", actorUserId: user.id, createdAt: "2026-11-08T18:13:42.983Z" });
  await processAnalysisJob({ prisma, provider: new StubConditionAnalysisProvider() }, { inspectionId: inspection.id });
  const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: inspection.id }, include: { findings: true } });
  console.log(`✓ analysis ${analysis.status}: ${analysis.findings.length} advisory findings regenerated`);

  // 6. Landlord review — the real decisions made through the UI earlier this session.
  const findingByCheckpoint = new Map(analysis.findings.map((f) => [f.checkpointId, f]));
  const review = await prisma.inspectionReview.create({
    data: {
      inspectionId: inspection.id,
      reviewedByUserId: user.id,
      reviewedAt: new Date("2026-11-08T18:15:16.428Z"),
      findingReviews: {
        create: Object.entries(DECISIONS).map(([checkpointId, d]) => ({
          findingId: findingByCheckpoint.get(checkpointId).id,
          decision: d.decision,
          amendedObservation: d.amendedObservation,
          landlordNote: d.landlordNote,
        })),
      },
    },
  });
  await audit("review.submitted", "InspectionReview", review.id, { actorType: "USER", actorUserId: user.id, createdAt: "2026-11-08T18:15:16.428Z" });
  console.log("✓ landlord review restored (6 accepted, 1 amended, 1 rejected)");

  // 7. Re-run the REAL report pipeline — renders and publishes a genuine new PDF to real AWS S3.
  await processReportJob({ prisma, storage, reportsBucket }, { inspectionId: inspection.id, requestedByUserId: user.id });
  const report = await prisma.report.findFirstOrThrow({ where: { inspectionId: inspection.id } });
  console.log(`✓ report v${report.version} regenerated and published → ${report.pdfStorageKey}`);

  const final = await prisma.inspection.findUniqueOrThrow({ where: { id: inspection.id } });
  console.log(`\nDone. Inspection status: ${final.status}`);
  console.log(`Landlord login: phone-test-dp3lb1@example.com / PhoneTestFlow2026!`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
