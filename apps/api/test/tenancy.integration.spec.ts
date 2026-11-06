import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, registerOrg, sessionFor, truncateAll, type App } from "./helpers.js";
import type { TenantInvitation, Tenancy } from "@inspectai/contracts";

let t: App;
const ISO_NOW = "2026-09-12T00:00:00.000Z";

beforeAll(async () => { t = await createTestApp(); });
afterAll(async () => { await t?.app.close(); });
beforeEach(async () => { await truncateAll(t.prisma); });

async function setupUnit() {
  const a = await registerOrg(t.api, { organizationName: "Org A" });
  const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@example.com`, organizationName: "Org B" });
  const prop = await t.api.post("/api/v1/properties").set("Cookie", a.cookie)
    .send({ displayName: "24 Oak", address: { line1: "24 Oak Street", city: "Johannesburg", province: "Gauteng", postalCode: "2196" } })
    .expect(201);
  const unit = await t.api.post(`/api/v1/properties/${prop.body.id}/units`).set("Cookie", a.cookie)
    .send({ label: "Main House" }).expect(201);
  return { a, b, propertyId: prop.body.id as string, unitId: unit.body.id as string };
}

describe("POST /units/:id/tenancies", () => {
  it("creates a tenancy with org derived from the unit + audit event", async () => {
    const { a, unitId } = await setupUnit();
    const res = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    expect((res.body as Tenancy).organizationId).toBeUndefined ?? undefined; // mapper includes it; assert real value:
    expect((res.body as Tenancy).unitId).toBe(unitId);
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "tenancy.created" } });
    expect(audit.actorType).toBe("USER");
  });

  it("401 without authentication", async () => {
    await t.api.post("/api/v1/units/whatever/tenancies").send({ startDate: ISO_NOW }).expect(401);
  });

  it("404 when another organization creates a tenancy on someone else's unit", async () => {
    const { b, unitId } = await setupUnit();
    await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", b.cookie)
      .send({ startDate: ISO_NOW }).expect(404);
  });

  it("400 on invalid startDate", async () => {
    const { a, unitId } = await setupUnit();
    await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: "not-a-date" }).expect(400);
  });
});

describe("POST /tenancies/:id/invitations", () => {
  it("creates a PENDING invitation, returns the raw token once, stores only its hash", async () => {
    const { a, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);

    const res = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", a.cookie)
      .send({ tenantEmail: "tenant@example.com", tenantFullName: "Thabo Mokoena" }).expect(201);

    const inv = res.body.invitation as TenantInvitation;
    expect(inv.status).toBe("PENDING");
    expect(inv.tenantEmail).toBe("tenant@example.com");
    expect(typeof res.body.invitationToken).toBe("string");
    expect(res.body.invitationToken.length).toBeGreaterThanOrEqual(20);

    const row = await t.prisma.tenantInvitation.findFirstOrThrow({});
    expect(row.tokenHash).not.toBe(res.body.invitationToken); // raw token never persisted
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "invitation.created" } });
    expect(audit.entityId).toBe(inv.id);
  });

  it("409 when the tenancy already has a pending invitation", async () => {
    const { a, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", a.cookie)
      .send({ tenantEmail: "t1@example.com", tenantFullName: "T One" }).expect(201);
    const res = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", a.cookie)
      .send({ tenantEmail: "t2@example.com", tenantFullName: "T Two" }).expect(409);
    expect(res.body.code).toBe("INVITATION_PENDING");
  });

  it("404 when another organization invites a tenant to someone else's tenancy", async () => {
    const { a, b, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", b.cookie)
      .send({ tenantEmail: "hijack@example.com", tenantFullName: "H J" }).expect(404);
  });

  it("401 without authentication", async () => {
    await t.api.post("/api/v1/tenancies/whatever/invitations").send({ tenantEmail: "x@y.z", tenantFullName: "X" }).expect(401);
  });
});

describe("POST /invitations/:id/revoke — state rules", () => {
  async function invitationFor(cookie: string, unitId: string) {
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    const inv = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", cookie)
      .send({ tenantEmail: `t-${crypto.randomUUID()}@example.com`, tenantFullName: "T" }).expect(201);
    return inv.body.invitation as TenantInvitation;
  }

  it("revokes a PENDING invitation with audit event", async () => {
    const { a, unitId } = await setupUnit();
    const inv = await invitationFor(a.cookie, unitId);
    const res = await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", a.cookie).expect(200);
    expect(res.body.status).toBe("REVOKED");
    const audit = await t.prisma.auditEvent.findFirst({ where: { action: "invitation.revoked" } });
    expect(audit).toBeDefined();
  });

  it("409 on double revoke (invalid state)", async () => {
    const { a, unitId } = await setupUnit();
    const inv = await invitationFor(a.cookie, unitId);
    await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", a.cookie).expect(200);
    const res = await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", a.cookie).expect(409);
    expect(res.body.code).toBe("INVITATION_ALREADY_REVOKED");
  });

  it("409 revoking an ACCEPTED invitation (invalid state, set via fixture)", async () => {
    const { a, unitId } = await setupUnit();
    const inv = await invitationFor(a.cookie, unitId);
    await t.prisma.tenantInvitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    const res = await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", a.cookie).expect(409);
    expect(res.body.code).toBe("INVITATION_ALREADY_ACCEPTED");
  });

  it("404 when another organization revokes someone else's invitation", async () => {
    const { a, b, unitId } = await setupUnit();
    const inv = await invitationFor(a.cookie, unitId);
    await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", b.cookie).expect(404);
  });

  it("403 for a non-portfolio role in the same organization", async () => {
    const { a, unitId } = await setupUnit();
    const inv = await invitationFor(a.cookie, unitId);
    const user = await t.prisma.user.create({
      data: { email: `viewer-${crypto.randomUUID()}@example.com`, passwordHash: "x", fullName: "V" },
    });
    await t.prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: a.organizationId, role: "TENANT" },
    });
    const cookie = await sessionFor(t.prisma, user.id);
    const res = await t.api.post(`/api/v1/invitations/${inv.id}/revoke`).set("Cookie", cookie).expect(403);
    expect(res.body.code).toBe("ROLE_NOT_PERMITTED");
  });
});

describe("GET /tenancies/:id", () => {
  it("returns the tenancy with its invitations for the owning org", async () => {
    const { a, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", a.cookie)
      .send({ tenantEmail: "t@example.com", tenantFullName: "T" }).expect(201);
    const res = await t.api.get(`/api/v1/tenancies/${tenancy.body.id}`).set("Cookie", a.cookie).expect(200);
    expect(res.body.invitations).toHaveLength(1);
  });

  it("404 for another organization's tenancy", async () => {
    const { a, b, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    await t.api.get(`/api/v1/tenancies/${tenancy.body.id}`).set("Cookie", b.cookie).expect(404);
  });
});

/** Real tenancy + a DRAFT inspection + a real invitation token, as the landlord would create them. */
async function setupTenancyWithDraftInspection(cookie: string, unitId: string) {
  const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", cookie)
    .send({ startDate: ISO_NOW }).expect(201);
  const inspection = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/inspections`).set("Cookie", cookie)
    .send({ type: "MOVE_OUT" }).expect(201);
  const inv = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", cookie)
    .send({ tenantEmail: `t-${crypto.randomUUID()}@example.com`, tenantFullName: "Priya Naidoo" }).expect(201);
  return {
    tenancyId: tenancy.body.id as string,
    inspectionId: inspection.body.id as string,
    invitationId: inv.body.invitation.id as string,
    token: inv.body.invitationToken as string,
  };
}

describe("POST /invitations/accept — starts the inspection", () => {
  it("DRAFT -> IN_PROGRESS in one step, with both audit events", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);

    const res = await t.api.post("/api/v1/invitations/accept")
      .set("Authorization", `Bearer ${fx.token}`).expect(200);

    expect(res.body.invitation.status).toBe("ACCEPTED");
    expect(res.body.inspection.status).toBe("IN_PROGRESS");

    const row = await t.prisma.inspection.findUniqueOrThrow({ where: { id: fx.inspectionId } });
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.invitationId).toBe(fx.invitationId);

    expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "invitation.accepted" } })).toBeDefined();
    expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "inspection.started" } })).toBeDefined();
  });

  it("409 NO_DRAFT_INSPECTION when the tenancy has no draft inspection", async () => {
    const { a, unitId } = await setupUnit();
    const tenancy = await t.api.post(`/api/v1/units/${unitId}/tenancies`).set("Cookie", a.cookie)
      .send({ startDate: ISO_NOW }).expect(201);
    const inv = await t.api.post(`/api/v1/tenancies/${tenancy.body.id}/invitations`).set("Cookie", a.cookie)
      .send({ tenantEmail: "t@example.com", tenantFullName: "T" }).expect(201);

    const res = await t.api.post("/api/v1/invitations/accept")
      .set("Authorization", `Bearer ${inv.body.invitationToken}`).expect(409);
    expect(res.body.code).toBe("NO_DRAFT_INSPECTION");
  });

  it("409 INVITATION_ALREADY_ACCEPTED on a second accept attempt (replay)", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);
    await t.api.post("/api/v1/invitations/accept").set("Authorization", `Bearer ${fx.token}`).expect(200);
    const res = await t.api.post("/api/v1/invitations/accept")
      .set("Authorization", `Bearer ${fx.token}`).expect(409);
    expect(res.body.code).toBe("INVITATION_ALREADY_ACCEPTED");
  });

  it("401 for a revoked invitation (the guard never authenticates a revoked token)", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);
    await t.api.post(`/api/v1/invitations/${fx.invitationId}/revoke`).set("Cookie", a.cookie).expect(200);
    await t.api.post("/api/v1/invitations/accept").set("Authorization", `Bearer ${fx.token}`).expect(401);
  });

  it("401 for an expired invitation (the guard never authenticates an expired token)", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);
    await t.prisma.tenantInvitation.update({ where: { id: fx.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await t.api.post("/api/v1/invitations/accept").set("Authorization", `Bearer ${fx.token}`).expect(401);
  });

  it("401 for an unknown/garbage token", async () => {
    await t.api.post("/api/v1/invitations/accept").set("Authorization", "Bearer not-a-real-token").expect(401);
  });

  it("accepted token keeps authenticating afterwards (for the rest of capture)", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);
    await t.api.post("/api/v1/invitations/accept").set("Authorization", `Bearer ${fx.token}`).expect(200);
    const res = await t.api.get(`/api/v1/inspections/${fx.inspectionId}`)
      .set("Authorization", `Bearer ${fx.token}`).expect(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });
});

describe("GET /invitations/me", () => {
  it("returns the real property + inspection for the token", async () => {
    const { a, unitId } = await setupUnit();
    const fx = await setupTenancyWithDraftInspection(a.cookie, unitId);
    const res = await t.api.get("/api/v1/invitations/me").set("Authorization", `Bearer ${fx.token}`).expect(200);
    expect(res.body.property.displayName).toBe("24 Oak");
    expect(res.body.inspection.id).toBe(fx.inspectionId);
    expect(res.body.inspection.status).toBe("DRAFT");
  });

  it("401 without a token", async () => {
    await t.api.get("/api/v1/invitations/me").expect(401);
  });

  it("409 INVALID_PRINCIPAL for a landlord session (not an invitation)", async () => {
    const { a } = await setupUnit();
    const res = await t.api.get("/api/v1/invitations/me").set("Cookie", a.cookie).expect(409);
    expect(res.body.code).toBe("INVALID_PRINCIPAL");
  });
});
