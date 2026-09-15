/**
 * Preview: runs the REAL Phase 1 pipeline end-to-end with fixture data and
 * writes the resulting PDF report to preview/ for manual inspection.
 * (Stub AI provider; sample landlord/tenant data; no UI yet — Stages 5-6.)
 *
 * Run from apps/jobs: node scripts/demo-report.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { S3Storage } from "@inspectai/storage";
import { defaultMoveOutPlan } from "@inspectai/domain";
import { StubConditionAnalysisProvider } from "../dist/provider/stub.js";
import { processAnalysisJob } from "../dist/analysis/analysis.worker.js";
import { processReportJob } from "../dist/report/report.worker.js";

const prisma = new PrismaClient();
const storage = new S3Storage({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  accessKeyId: process.env.S3_ACCESS_KEY ?? "inspectai",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "inspectai-secret",
});
const evidenceBucket = process.env.S3_EVIDENCE_BUCKET ?? "inspectai-evidence";
const reportsBucket = process.env.S3_REPORTS_BUCKET ?? "inspectai-reports";
const OK = { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true };

async function main() {
  // Clean slate for the demo
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "UploadTicket", "Evidence", "AiAnalysis", "Finding", "FindingReview", "InspectionReview", "Report", "Inspection", "TenantInvitation", "Tenancy", "Unit", "Property", "Session", "OrganizationMembership", "User", "Organization" CASCADE`,
  );

  // 1. Landlord + organisation + property + unit + tenancy
  const org = await prisma.organization.create({ data: { name: "Yende Properties" } });
  const user = await prisma.user.create({
    data: { email: "kutloano@yendeproperties.co.za", passwordHash: "x", fullName: "Kutloano Yende" },
  });
  await prisma.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  const property = await prisma.property.create({
    data: { organizationId: org.id, displayName: "24 Oak Street", addressLine1: "24 Oak Street", city: "Johannesburg", province: "Gauteng", postalCode: "2196" },
  });
  const unit = await prisma.unit.create({ data: { propertyId: property.id, organizationId: org.id, label: "Main House", bedrooms: 3, bathrooms: 2 } });
  const tenancy = await prisma.tenancy.create({ data: { unitId: unit.id, organizationId: org.id, startDate: new Date("2025-03-01") } });

  // 2. Inspection (MOVE_OUT) with the default plan snapshot
  const plan = defaultMoveOutPlan();
  const inspection = await prisma.inspection.create({
    data: { tenancyId: tenancy.id, organizationId: org.id, type: "MOVE_OUT", status: "ANALYZING", plan, submittedAt: new Date() },
  });

  // 3. Tenant evidence (committed, verified) — real objects in MinIO
  const mandatory = plan.rooms.flatMap((r) => r.checkpoints.filter((c) => c.mandatory));
  for (let i = 0; i < mandatory.length; i++) {
    const sha = `${String(i).padStart(2, "0")}${"a".repeat(62)}`;
    const key = `org/${org.id}/inspection/${inspection.id}/${mandatory[i].id}/ev-${i}.jpg`;
    await storage.putObject(evidenceBucket, key, Buffer.from(`demo-evidence-${i}`), "image/jpeg");
    await prisma.evidence.create({
      data: {
        inspectionId: inspection.id, checkpointId: mandatory[i].id, kind: "PHOTO", storageKey: key,
        contentSha256: sha, bytes: 1024,
        capturedAt: new Date(Date.parse("2026-09-12T10:00:00Z") + i * 1000),
        verification: OK, committedAt: new Date(),
      },
    });
  }
  console.log(`✓ ${mandatory.length} evidence items committed to private storage`);

  // 4. AI analysis (deterministic stub, schema-validated, advisory only)
  await processAnalysisJob({ prisma, provider: new StubConditionAnalysisProvider() }, { inspectionId: inspection.id });
  const analysis = await prisma.aiAnalysis.findFirstOrThrow({ where: { inspectionId: inspection.id }, include: { findings: true } });
  console.log(`✓ analysis ${analysis.status}: ${analysis.findings.length} advisory findings (provider=${(analysis.provenance).provider})`);

  // 5. Landlord review: accept / amend / reject
  const findings = await prisma.finding.findMany({ where: { analysisId: analysis.id }, orderBy: { id: "asc" } });
  await prisma.inspectionReview.create({
    data: {
      inspectionId: inspection.id, reviewedByUserId: user.id, overallNote: "Reviewed with tenant present.",
      findingReviews: {
        create: [
          { findingId: findings[0].id, decision: "ACCEPTED" },
          { findingId: findings[1].id, decision: "AMENDED", amendedObservation: "Landlord corrected: pre-existing crack, 15cm. Verified against move-in report." },
          { findingId: findings[2].id, decision: "REJECTED", landlordNote: "Not visible in person; stub false positive." },
          ...findings.slice(3).map((f) => ({ findingId: f.id, decision: "ACCEPTED" })),
        ],
      },
    },
  });
  console.log("✓ landlord review recorded (1 accepted, 1 amended, 1 rejected)");

  // 6. Report generation (accepted/amended only) + publication
  await prisma.inspection.update({ where: { id: inspection.id }, data: { status: "UNDER_REVIEW" } });
  await processReportJob({ prisma, storage, reportsBucket }, { inspectionId: inspection.id, requestedByUserId: user.id });

  const report = await prisma.report.findFirstOrThrow({ where: { inspectionId: inspection.id } });
  const pdf = await storage.getObjectBuffer(reportsBucket, report.pdfStorageKey);
  const outDir = resolve(import.meta.dirname, "../../../preview");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "InspectAI-Report-Preview.pdf");
  writeFileSync(outPath, pdf);
  console.log(`✓ report v${report.version} published → ${report.pdfStorageKey}`);
  console.log(`✓ PDF written to ${outPath} (${pdf.length} bytes)`);

  const inspection2 = await prisma.inspection.findUniqueOrThrow({ where: { id: inspection.id } });
  const auditCount = await prisma.auditEvent.count();
  console.log(`✓ inspection status: ${inspection2.status}; audit events: ${auditCount}`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
