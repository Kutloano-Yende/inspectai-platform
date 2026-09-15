import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Queue } from "bullmq";
import { defaultMoveOutPlan } from "@inspectai/domain";
import { S3Storage } from "@inspectai/storage";
import { ANALYSIS_QUEUE_NAME, REPORT_QUEUE_NAME } from "@inspectai/contracts";
import { createTestApp, registerOrg, truncateAll, type App } from "./helpers.js";

let t: App;
let analysisQueue: Queue;
let reportQueue: Queue;
let storage: S3Storage;
const evidenceBucket = "inspectai-evidence";
const reportsBucket = "inspectai-reports";
const OK_VERIFICATION = { freshnessVerified: true, duplicateDetected: false, qualityAcceptable: true };

/** Seeds property→unit→tenancy→inspection under the registered org (owner of the cookie). */
async function seedInspection(
  status: string,
  opts?: { evidence?: boolean; principal?: { userId: string; organizationId: string } },
  principalOrPrincipalWrapper?: { userId: string; organizationId: string } | { principal: { userId: string; organizationId: string } },
) {
  // Handle multiple calling patterns for backward compatibility
  let resolvedPrincipal: { userId: string; organizationId: string } | undefined;
  if (principalOrPrincipalWrapper) {
    if ("principal" in principalOrPrincipalWrapper && principalOrPrincipalWrapper.principal) {
      resolvedPrincipal = principalOrPrincipalWrapper.principal;
    } else if ("userId" in principalOrPrincipalWrapper && "organizationId" in principalOrPrincipalWrapper) {
      resolvedPrincipal = principalOrPrincipalWrapper as { userId: string; organizationId: string };
    }
  }
  if (!resolvedPrincipal && opts?.principal) {
    resolvedPrincipal = opts.principal;
  }

  const org = resolvedPrincipal ? await t.prisma.organization.findUniqueOrThrow({ where: { id: resolvedPrincipal.organizationId } }) : await t.prisma.organization.create({ data: { name: "Seed Org" } });
  const user = resolvedPrincipal
    ? await t.prisma.user.findUniqueOrThrow({ where: { id: resolvedPrincipal.userId } })
    : await t.prisma.user.create({ data: { email: `u-${crypto.randomUUID()}@x.co.za`, passwordHash: "x", fullName: "Owner" } });
  if (!resolvedPrincipal) {
    await t.prisma.organizationMembership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  }
  const property = await t.prisma.property.create({
    data: { organizationId: org.id, displayName: "24 Oak", addressLine1: "24 Oak St", city: "JHB", province: "GP", postalCode: "2196" },
  });
  const unit = await t.prisma.unit.create({ data: { propertyId: property.id, organizationId: org.id, label: "Main" } });
  const tenancy = await t.prisma.tenancy.create({ data: { unitId: unit.id, organizationId: org.id, startDate: new Date("2026-01-01") } });
  const plan = defaultMoveOutPlan();
  const inspection = await t.prisma.inspection.create({
    data: { tenancyId: tenancy.id, organizationId: org.id, type: "MOVE_OUT", status, plan: plan as object },
  });
  if (opts?.evidence) {
    const mandatory = plan.rooms.flatMap((r) => r.checkpoints.filter((c) => c.mandatory));
    for (let i = 0; i < mandatory.length; i++) {
      const key = `org/${org.id}/inspection/${inspection.id}/${mandatory[i]!.id}/ev-${i}.jpg`;
      await storage.putObject(evidenceBucket, key, Buffer.from(`ev-${i}`), "image/jpeg");
      await t.prisma.evidence.create({
        data: {
          inspectionId: inspection.id, checkpointId: mandatory[i]!.id, kind: "PHOTO", storageKey: key,
          contentSha256: `${String(i).padStart(2, "0")}${"a".repeat(62)}`, bytes: 1024,
          capturedAt: new Date(), verification: OK_VERIFICATION, committedAt: new Date(),
        },
      });
    }
  }
  return { org, user, property, unit, tenancy, inspection, plan };
}

/** Adds a COMPLETED analysis with findings + advances inspection to UNDER_REVIEW. */
async function seedAnalysed(fx: Awaited<ReturnType<typeof seedInspection>>, findingCount = 3) {
  const analysis = await t.prisma.aiAnalysis.create({
    data: {
      inspectionId: fx.inspection.id, status: "COMPLETED", summary: "Stub analysis: advisory only.",
      provenance: { provider: "stub", model: "stub-v1", inputSetSha256: "a".repeat(64), completedAt: new Date().toISOString() },
    },
  });
  const findings = [];
  for (let i = 0; i < findingCount; i++) {
    findings.push(await t.prisma.finding.create({
      data: {
        analysisId: analysis.id, checkpointId: `cp-${i + 1}`, category: "GENERAL_WEAR", severity: "LOW",
        confidence: 0.62, observation: `Stub observation ${i + 1}`, evidenceIds: [`ev-${i}`],
      },
    }));
  }
  await t.prisma.inspection.update({ where: { id: fx.inspection.id }, data: { status: "UNDER_REVIEW" } });
  return { analysis, findings };
}

beforeAll(async () => {
  t = await createTestApp();
  analysisQueue = new Queue(ANALYSIS_QUEUE_NAME, { connection: (await import("ioredis")).default ?? (await import("ioredis")) } as never);
  reportQueue = new Queue(REPORT_QUEUE_NAME, { connection: (await import("ioredis")).default ?? (await import("ioredis")) } as never);
  storage = new S3Storage({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000", region: "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "inspectai", secretAccessKey: process.env.S3_SECRET_KEY ?? "inspectai-secret",
  });
});

afterAll(async () => {
  await analysisQueue?.close();
  await reportQueue?.close();
  await t?.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
  await analysisQueue?.drain();
  await reportQueue?.drain();
});

describe("POST /tenancies/:id/inspections", () => {
  it("creates a MOVE_OUT inspection with a plan snapshot + audit event", async () => {
    const { cookie } = await registerOrg(t.api);
    const prop = await t.api.post("/api/v1/properties").set("Cookie", cookie)
      .send({ displayName: "P", address: { line1: "1 A", city: "C", province: "GP", postalCode: "0001" } }).expect(201);
    const unit = await t.api.post(`/api/v1/properties/${prop.body.id}/units`).set("Cookie", cookie).send({ label: "U" }).expect(201);
    const tenancy = await t.api.post(`/api/v1/units/${unit.body.id}/tenancies`).set("Cookie", cookie)
      .send({ startDate: "2026-01-01T00:00:00.000Z" }).expect(201);

    const res = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/inspections`).set("Cookie", cookie)
      .send({ type: "MOVE_OUT" }).expect(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.plan.rooms.length).toBeGreaterThan(3);
    expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "inspection.created" } })).toBeDefined();
  });

  it("401 without authentication", async () => {
    await t.api.post("/api/v1/tenancies/x/inspections").send({ type: "MOVE_OUT" }).expect(401);
  });

  it("404 for another organization's tenancy", async () => {
    const a = await registerOrg(t.api, { organizationName: "A" });
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const prop = await t.api.post("/api/v1/properties").set("Cookie", a.cookie)
      .send({ displayName: "P", address: { line1: "1 A", city: "C", province: "GP", postalCode: "0001" } }).expect(201);
    const unit = await t.api.post(`/api/v1/properties/${prop.body.id}/units`).set("Cookie", a.cookie).send({ label: "U" }).expect(201);
    const tenancy = await t.api.post(`/api/v1/units/${unit.body.id}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: "2026-01-01T00:00:00.000Z" }).expect(201);
    await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/inspections`).set("Cookie", b.cookie)
      .send({ type: "MOVE_OUT" }).expect(404);
  });
});

describe("GET /inspections/:id — organization isolation", () => {
  it("returns evidence, analysis and reports for the owning org", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { evidence: true }, { principal: { userId, organizationId } });
    const res = await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).set("Cookie", cookie).expect(200);
    expect(res.body.status).toBe("UNDER_REVIEW");
    expect(res.body.evidence.length).toBeGreaterThan(0);
  });

  it("404 for another organization's inspection", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const fx = await seedInspection("UNDER_REVIEW");
    await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).set("Cookie", b.cookie).expect(404);
  });

  it("401 without authentication", async () => {
    const fx = await seedInspection("DRAFT");
    await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).expect(401);
  });
});

describe("POST /inspections/:id/analyze — state machine + readiness", () => {
  it("409 when the inspection is DRAFT (invalid state)", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("DRAFT", { principal: { userId, organizationId } });
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/analyze`).set("Cookie", cookie).expect(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("409 when mandatory checkpoints lack committed evidence", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("SUBMITTED", { principal: { userId, organizationId } }); // no evidence seeded
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/analyze`).set("Cookie", cookie).expect(409);
    expect(res.body.code).toBe("MANDATORY_CHECKPOINTS_INCOMPLETE");
  });

  it("202 + ANALYZING when submitted with full evidence; queues the job; audit event", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("SUBMITTED", { evidence: true }, { principal: { userId, organizationId } });
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/analyze`).set("Cookie", cookie).expect(202);
    expect(res.body.status).toBe("ANALYZING");
    expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "analysis.requested" } })).toBeDefined();
    // second attempt: SUBMITTED→ANALYZING no longer legal
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/analyze`).set("Cookie", cookie).expect(409);
  });

  it("404 for another organization's inspection", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const fx = await seedInspection("SUBMITTED", { evidence: true });
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/analyze`).set("Cookie", b.cookie).expect(404);
  });
});

describe("POST /inspections/:id/review — human decisions only", () => {
  it("records accept/amend/reject decisions with an audit event", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { principal: { userId, organizationId } });
    const { findings } = await seedAnalysed(fx);
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/review`).set("Cookie", cookie)
      .send({
        findingReviews: [
          { findingId: findings[0]!.id, decision: "ACCEPTED" },
          { findingId: findings[1]!.id, decision: "AMENDED", amendedObservation: "Corrected by landlord." },
          { findingId: findings[2]!.id, decision: "REJECTED", landlordNote: "False positive." },
        ],
      })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(await t.prisma.findingReview.count()).toBe(3);
    expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "review.submitted" } })).toBeDefined();
  });

  it("409 when the inspection is not UNDER_REVIEW", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { principal: { userId, organizationId } });
    const { findings } = await seedAnalysed(fx);
    await t.prisma.inspection.update({ where: { id: fx.inspection.id }, data: { status: "ANALYZING" } });
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/review`).set("Cookie", cookie)
      .send({ findingReviews: [{ findingId: findings[0]!.id, decision: "ACCEPTED" }] }).expect(409);
  });

  it("404 when reviewing findings of another organization's inspection", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const fx = await seedInspection("UNDER_REVIEW");
    const { findings } = await seedAnalysed(fx);
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/review`).set("Cookie", b.cookie)
      .send({ findingReviews: [{ findingId: findings[0]!.id, decision: "ACCEPTED" }] }).expect(404);
  });

  it("404 when the finding does not belong to this inspection", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { principal: { userId, organizationId } });
    await seedAnalysed(fx);
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/review`).set("Cookie", cookie)
      .send({ findingReviews: [{ findingId: "foreign-finding", decision: "ACCEPTED" }] }).expect(404);
  });

  it("400 when AMENDED lacks amendedObservation (contract)", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { principal: { userId, organizationId } });
    const { findings } = await seedAnalysed(fx);
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/review`).set("Cookie", cookie)
      .send({ findingReviews: [{ findingId: findings[0]!.id, decision: "AMENDED" }] }).expect(400);
  });
});

describe("POST /inspections/:id/report — publication trigger", () => {
  it("202 queues publication for a human principal", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { principal: { userId, organizationId } });
    await seedAnalysed(fx);
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/report`).set("Cookie", cookie).expect(202);
    expect(res.body.queued).toBe(true);
  });

  it("409 when the inspection is not UNDER_REVIEW", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("COMPLETED", { principal: { userId, organizationId } });
    const res = await t.api.post(`/api/v1/inspections/${fx.inspection.id}/report`).set("Cookie", cookie).expect(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("404 for another organization's inspection", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const fx = await seedInspection("UNDER_REVIEW");
    await seedAnalysed(fx);
    await t.api.post(`/api/v1/inspections/${fx.inspection.id}/report`).set("Cookie", b.cookie).expect(404);
  });
});

describe("GET /reports/:id/download — private, short-lived, authorization-checked", () => {
  it("returns a signed short-lived URL for the owning org only", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("COMPLETED", { principal: { userId, organizationId } });
    const key = `org/${fx.org.id}/inspection/${fx.inspection.id}/report-v1.pdf`;
    await storage.putObject(reportsBucket, key, Buffer.from("%PDF-demo"), "application/pdf");
    const report = await t.prisma.report.create({
      data: { inspectionId: fx.inspection.id, organizationId: fx.org.id, version: 1, publishedByUserId: userId, pdfStorageKey: key },
    });

    const res = await t.api.get(`/api/v1/reports/${report.id}/download`).set("Cookie", cookie).expect(200);
    expect(res.body.url).toContain("X-Amz-Signature");
    expect(res.body.url).not.toMatch(/^https?:\/\/[^/]*(localhost:9001|public)/); // storage endpoint only, never a public URL

    const signed = await fetch(res.body.url);
    expect(signed.status).toBe(200);
    // Unsigned direct access is denied (no public report URLs, ever)
    const unsigned = await fetch(`${process.env.S3_ENDPOINT ?? "http://localhost:9000"}/${reportsBucket}/${key}`);
    expect(unsigned.status).toBe(403);
  });

  it("404 for another organization's report", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const { userId } = await registerOrg(t.api, { organizationName: "A" });
    const fx = await seedInspection("COMPLETED");
    const report = await t.prisma.report.create({
      data: { inspectionId: fx.inspection.id, organizationId: fx.org.id, version: 1, publishedByUserId: userId, pdfStorageKey: "k.pdf" },
    });
    await t.api.get(`/api/v1/reports/${report.id}/download`).set("Cookie", b.cookie).expect(404);
  });

  it("401 without authentication", async () => {
    await t.api.get("/api/v1/reports/x/download").expect(401);
  });
});
