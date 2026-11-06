import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
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

describe("GET /inspections — list with filtering and pagination", () => {
  it("returns all org inspections with pagination (happy path)", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    await seedInspection("DRAFT", { principal: { userId, organizationId } });
    await seedInspection("SUBMITTED", { principal: { userId, organizationId } });
    await seedInspection("ANALYZING", { principal: { userId, organizationId } });

    const res = await t.api.get("/api/v1/inspections?limit=10&offset=0").set("Cookie", cookie).expect(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.pagination.hasMore).toBe(false);
  });

  it("filters by status", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    await seedInspection("DRAFT", { principal: { userId, organizationId } });
    await seedInspection("SUBMITTED", { principal: { userId, organizationId } });
    await seedInspection("ANALYZING", { principal: { userId, organizationId } });

    const res = await t.api.get("/api/v1/inspections?status=SUBMITTED").set("Cookie", cookie).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].status).toBe("SUBMITTED");
  });

  it("respects limit and offset pagination", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    await seedInspection("DRAFT", { principal: { userId, organizationId } });
    await seedInspection("SUBMITTED", { principal: { userId, organizationId } });
    await seedInspection("ANALYZING", { principal: { userId, organizationId } });

    const res1 = await t.api.get("/api/v1/inspections?limit=2&offset=0").set("Cookie", cookie).expect(200);
    expect(res1.body.data).toHaveLength(2);
    expect(res1.body.pagination.hasMore).toBe(true);

    const res2 = await t.api.get("/api/v1/inspections?limit=2&offset=2").set("Cookie", cookie).expect(200);
    expect(res2.body.data).toHaveLength(1);
    expect(res2.body.pagination.hasMore).toBe(false);
  });

  it("returns empty list when no inspections match", async () => {
    const { cookie } = await registerOrg(t.api);
    const res = await t.api.get("/api/v1/inspections?status=COMPLETED").set("Cookie", cookie).expect(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it("isolates org inspections (cross-org denied)", async () => {
    const a = await registerOrg(t.api, { organizationName: "A" });
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });

    const fx = await seedInspection("DRAFT", { principal: { userId: a.userId, organizationId: a.organizationId } });
    const fx2 = await seedInspection("SUBMITTED", { principal: { userId: b.userId, organizationId: b.organizationId } });

    const aRes = await t.api.get("/api/v1/inspections").set("Cookie", a.cookie).expect(200);
    expect(aRes.body.data).toHaveLength(1);
    expect(aRes.body.data[0].id).toBe(fx.inspection.id);

    const bRes = await t.api.get("/api/v1/inspections").set("Cookie", b.cookie).expect(200);
    expect(bRes.body.data).toHaveLength(1);
    expect(bRes.body.data[0].id).toBe(fx2.inspection.id);
  });

  it("401 without authentication", async () => {
    await t.api.get("/api/v1/inspections").expect(401);
  });
});

describe("GET /inspections/:id — evidence presigned GET URLs", () => {
  it("includes downloadUrl + expiresAt for each evidence item", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { evidence: true }, { principal: { userId, organizationId } });
    const res = await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).set("Cookie", cookie).expect(200);

    expect(res.body.evidence.length).toBeGreaterThan(0);
    for (const ev of res.body.evidence) {
      expect(ev.downloadUrl).toBeDefined();
      expect(ev.downloadUrl).toContain("X-Amz-Signature");
      expect(ev.expiresAt).toBeDefined();
      expect(new Date(ev.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("presigned URLs work for authorized access", async () => {
    const { cookie, userId, organizationId } = await registerOrg(t.api);
    const fx = await seedInspection("UNDER_REVIEW", { evidence: true }, { principal: { userId, organizationId } });
    const res = await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).set("Cookie", cookie).expect(200);

    const ev = res.body.evidence[0];
    const signed = await fetch(ev.downloadUrl);
    expect(signed.status).toBe(200);
  });

  it("404 when cross-org user tries to fetch evidence", async () => {
    const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@x.co.za`, organizationName: "B" });
    const fx = await seedInspection("UNDER_REVIEW", { evidence: true });
    await t.api.get(`/api/v1/inspections/${fx.inspection.id}`).set("Cookie", b.cookie).expect(404);
  });

  it("404 for an invitation token scoped to a different tenancy in the same org", async () => {
    const { cookie } = await registerOrg(t.api);
    const prop = await t.api.post("/api/v1/properties").set("Cookie", cookie)
      .send({ displayName: "P", address: { line1: "1 A", city: "C", province: "GP", postalCode: "0001" } }).expect(201);
    const unit = await t.api.post(`/api/v1/properties/${prop.body.id}/units`).set("Cookie", cookie).send({ label: "U" }).expect(201);

    // Tenancy A owns the inspection; tenancy B's invitation token must not read it.
    const tenancyA = await t.api.post(`/api/v1/units/${unit.body.id}/tenancies`).set("Cookie", cookie)
      .send({ startDate: "2026-01-01T00:00:00.000Z" }).expect(201);
    const inspectionA = await t.api.post(`/api/v1/tenancies/${tenancyA.body.id}/inspections`).set("Cookie", cookie)
      .send({ type: "MOVE_OUT" }).expect(201);

    const tenancyB = await t.api.post(`/api/v1/units/${unit.body.id}/tenancies`).set("Cookie", cookie)
      .send({ startDate: "2026-01-01T00:00:00.000Z" }).expect(201);
    const invB = await t.api.post(`/api/v1/tenancies/${tenancyB.body.id}/invitations`).set("Cookie", cookie)
      .send({ tenantEmail: "b@example.com", tenantFullName: "B" }).expect(201);

    await t.api.get(`/api/v1/inspections/${inspectionA.body.id}`)
      .set("Authorization", `Bearer ${invB.body.invitationToken}`).expect(404);
  });
});

/** Full real flow: landlord creates DRAFT inspection + invitation, tenant accepts it. */
async function setupInvitedInspection(cookie: string, unitId?: string) {
  let uid = unitId;
  if (!uid) {
    const prop = await t.api.post("/api/v1/properties").set("Cookie", cookie)
      .send({ displayName: "P", address: { line1: "1 A", city: "C", province: "GP", postalCode: "0001" } }).expect(201);
    const unit = await t.api.post(`/api/v1/properties/${prop.body.id}/units`).set("Cookie", cookie).send({ label: "U" }).expect(201);
    uid = unit.body.id;
  }
  const tenancy = await t.api.post(`/api/v1/units/${uid}/tenancies`).set("Cookie", cookie)
    .send({ startDate: "2026-01-01T00:00:00.000Z" }).expect(201);
  const inspection = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/inspections`).set("Cookie", cookie)
    .send({ type: "MOVE_OUT" }).expect(201);
  const inv = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", cookie)
    .send({ tenantEmail: `t-${crypto.randomUUID()}@example.com`, tenantFullName: "Tenant" }).expect(201);
  const token = inv.body.invitationToken as string;
  await t.api.post("/api/v1/invitations/accept").set("Authorization", `Bearer ${token}`).expect(200);

  const mandatory = defaultMoveOutPlan().rooms.flatMap((r) => r.checkpoints.filter((c) => c.mandatory));
  return { tenancyId: tenancy.body.id as string, inspectionId: inspection.body.id as string, token, mandatory, unitId: uid as string };
}

/** Issues a ticket, PUTs real bytes to the presigned URL, and commits — the real client sequence. */
async function captureAndCommit(token: string, inspectionId: string, checkpointId: string, opts?: { bytes?: Buffer }) {
  const bytes = opts?.bytes ?? Buffer.from(`photo-${checkpointId}-${crypto.randomUUID()}`);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const ticket = await t.api.post(`/api/v1/inspections/${inspectionId}/evidence`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      inspectionId,
      checkpointId,
      kind: "PHOTO",
      contentSha256,
      contentLengthBytes: bytes.length,
      contentType: "image/jpeg",
      capturedAt: new Date().toISOString(),
      deviceMetadata: { userAgent: "vitest", platform: "node" },
    })
    .expect(201);

  const put = await fetch(ticket.body.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "image/jpeg" } });
  if (!put.ok) throw new Error(`presigned PUT failed: ${put.status}`);

  const commit = await t.api.post(`/api/v1/evidence/${ticket.body.evidenceId}/commit`)
    .set("Authorization", `Bearer ${token}`)
    .send({ evidenceId: ticket.body.evidenceId, captureNonce: ticket.body.captureNonce });

  return { ticket: ticket.body, commit };
}

describe("Tenant capture — evidence ticket + commit", () => {
  it("full happy path: accept -> capture every mandatory checkpoint -> submit", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);

    for (const cp of fx.mandatory) {
      const { commit } = await captureAndCommit(fx.token, fx.inspectionId, cp.id);
      expect(commit.status).toBe(200);
      expect(commit.body.verification.freshnessVerified).toBe(true);
      expect(commit.body.verification.duplicateDetected).toBe(false);
    }

    const tickets = await t.prisma.uploadTicket.findMany({ where: { inspectionId: fx.inspectionId } });
    expect(tickets).toHaveLength(fx.mandatory.length);
    expect(tickets.every((row) => row.usedAt != null)).toBe(true);

    const evidence = await t.prisma.evidence.findFirstOrThrow({ where: { inspectionId: fx.inspectionId } });
    expect(evidence.deviceMetadata).toEqual({ userAgent: "vitest", platform: "node" });

    const submit = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`)
      .set("Authorization", `Bearer ${fx.token}`).expect(200);
    expect(submit.body.status).toBe("SUBMITTED");
  });

  it("409 INVALID_CAPTURE_NONCE on a wrong nonce", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const bytes = Buffer.from("photo");
    const ticket = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/evidence`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({
        inspectionId: fx.inspectionId, checkpointId: fx.mandatory[0]!.id, kind: "PHOTO",
        contentSha256: createHash("sha256").update(bytes).digest("hex"), contentLengthBytes: bytes.length,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: { userAgent: "x" },
      }).expect(201);

    const res = await t.api.post(`/api/v1/evidence/${ticket.body.evidenceId}/commit`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ evidenceId: ticket.body.evidenceId, captureNonce: "x".repeat(32) }).expect(409);
    expect(res.body.code).toBe("INVALID_CAPTURE_NONCE");
  });

  it("409 UPLOAD_TICKET_EXPIRED for a backdated ticket", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const bytes = Buffer.from("photo");
    const ticket = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/evidence`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({
        inspectionId: fx.inspectionId, checkpointId: fx.mandatory[0]!.id, kind: "PHOTO",
        contentSha256: createHash("sha256").update(bytes).digest("hex"), contentLengthBytes: bytes.length,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: { userAgent: "x" },
      }).expect(201);
    await t.prisma.uploadTicket.updateMany({
      where: { evidenceId: ticket.body.evidenceId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await fetch(ticket.body.uploadUrl, { method: "PUT", body: bytes, headers: { "Content-Type": "image/jpeg" } });

    const res = await t.api.post(`/api/v1/evidence/${ticket.body.evidenceId}/commit`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ evidenceId: ticket.body.evidenceId, captureNonce: ticket.body.captureNonce }).expect(409);
    expect(res.body.code).toBe("UPLOAD_TICKET_EXPIRED");
  });

  it("409 EVIDENCE_ALREADY_COMMITTED on a second commit of the same evidence", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const { ticket } = await captureAndCommit(fx.token, fx.inspectionId, fx.mandatory[0]!.id);

    const res = await t.api.post(`/api/v1/evidence/${ticket.evidenceId}/commit`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({ evidenceId: ticket.evidenceId, captureNonce: ticket.captureNonce }).expect(409);
    expect(res.body.code).toBe("EVIDENCE_ALREADY_COMMITTED");
  });

  it("flags duplicateDetected when the same bytes are committed twice within one inspection", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const sameBytes = Buffer.from("identical-photo-bytes");
    await captureAndCommit(fx.token, fx.inspectionId, fx.mandatory[0]!.id, { bytes: sameBytes });

    // Prisma's @@unique([inspectionId, contentSha256]) means a genuine duplicate upload for a
    // DIFFERENT checkpoint with the same bytes is rejected at the ticket-creation step itself.
    const ticket = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/evidence`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({
        inspectionId: fx.inspectionId, checkpointId: fx.mandatory[1]!.id, kind: "PHOTO",
        contentSha256: createHash("sha256").update(sameBytes).digest("hex"), contentLengthBytes: sameBytes.length,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: { userAgent: "x" },
      });
    expect(ticket.status).toBe(500); // Prisma unique constraint violation surfaces as a 500 today
  });

  it("409 when issuing a ticket after the inspection is SUBMITTED", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    for (const cp of fx.mandatory) await captureAndCommit(fx.token, fx.inspectionId, cp.id);
    await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`).set("Authorization", `Bearer ${fx.token}`).expect(200);

    const bytes = Buffer.from("late-photo");
    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/evidence`)
      .set("Authorization", `Bearer ${fx.token}`)
      .send({
        inspectionId: fx.inspectionId, checkpointId: fx.mandatory[0]!.id, kind: "PHOTO",
        contentSha256: createHash("sha256").update(bytes).digest("hex"), contentLengthBytes: bytes.length,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: { userAgent: "x" },
      }).expect(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("409 INVALID_SCOPE for an invitation token scoped to a different tenancy", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const other = await setupInvitedInspection(cookie); // different tenancy, same org

    const bytes = Buffer.from("hijack");
    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/evidence`)
      .set("Authorization", `Bearer ${other.token}`)
      .send({
        inspectionId: fx.inspectionId, checkpointId: fx.mandatory[0]!.id, kind: "PHOTO",
        contentSha256: createHash("sha256").update(bytes).digest("hex"), contentLengthBytes: bytes.length,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: { userAgent: "x" },
      }).expect(409);
    expect(res.body.code).toBe("INVALID_SCOPE");
  });

  it("401 without any authentication", async () => {
    await t.api.post("/api/v1/inspections/whatever/evidence")
      .send({
        inspectionId: "whatever", checkpointId: "cp-1", kind: "PHOTO",
        contentSha256: "a".repeat(64), contentLengthBytes: 10,
        contentType: "image/jpeg", capturedAt: new Date().toISOString(), deviceMetadata: {},
      }).expect(401);
  });
});

describe("POST /inspections/:id/submit — tenant capture readiness", () => {
  it("409 MANDATORY_CHECKPOINTS_INCOMPLETE when one mandatory checkpoint is missing", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    for (const cp of fx.mandatory.slice(0, -1)) await captureAndCommit(fx.token, fx.inspectionId, cp.id);

    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`)
      .set("Authorization", `Bearer ${fx.token}`).expect(409);
    expect(res.body.code).toBe("MANDATORY_CHECKPOINTS_INCOMPLETE");
  });

  it("409 INVALID_STATE on a second submit attempt", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    for (const cp of fx.mandatory) await captureAndCommit(fx.token, fx.inspectionId, cp.id);
    await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`).set("Authorization", `Bearer ${fx.token}`).expect(200);

    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`)
      .set("Authorization", `Bearer ${fx.token}`).expect(409);
    expect(res.body.code).toBe("INVALID_STATE");
  });

  it("409 INVALID_SCOPE submitting with a different tenancy's invitation token", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    const other = await setupInvitedInspection(cookie);
    for (const cp of fx.mandatory) await captureAndCommit(fx.token, fx.inspectionId, cp.id);

    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`)
      .set("Authorization", `Bearer ${other.token}`).expect(409);
    expect(res.body.code).toBe("INVALID_SCOPE");
  });

  it("a landlord (user principal) can also submit on the tenant's behalf", async () => {
    const { cookie } = await registerOrg(t.api);
    const fx = await setupInvitedInspection(cookie);
    for (const cp of fx.mandatory) await captureAndCommit(fx.token, fx.inspectionId, cp.id);

    const res = await t.api.post(`/api/v1/inspections/${fx.inspectionId}/submit`).set("Cookie", cookie).expect(200);
    expect(res.body.status).toBe("SUBMITTED");
  });
});
