import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, registerOrg, sessionFor, truncateAll, testPassword, type App } from "./helpers.js";
import type { TenantInvitation, Tenancy, Unit, Property } from "@inspectai/contracts";

let t: App;

const propertyDto = (name: string) => ({
  displayName: name,
  propertyType: "RESIDENTIAL",
  address: { line1: "24 Oak Street", city: "Johannesburg", province: "Gauteng", postalCode: "2196", country: "ZA" },
});

beforeAll(async () => { t = await createTestApp(); });
afterAll(async () => { await t?.app.close(); });
beforeEach(async () => { await truncateAll(t.prisma); });

/** Registers two independent organizations; returns cookies + ids. */
async function twoOrgs() {
  const a = await registerOrg(t.api, { organizationName: "Org A" });
  const b = await registerOrg(t.api, { email: `b-${crypto.randomUUID()}@example.com`, organizationName: "Org B" });
  return { a, b };
}

describe("POST /properties", () => {
  it("creates a property with server-resolved organization and audit event", async () => {
    const { a } = await twoOrgs();
    const res = await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("24 Oak Street")).expect(201);
    const prop = res.body as Property;
    expect(prop.organizationId).toBe(a.organizationId); // derived from membership, not client input
    expect(prop.address.city).toBe("Johannesburg");

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "property.created" } });
    expect(audit.organizationId).toBe(a.organizationId);
  });

  it("401 without authentication", async () => {
    await t.api.post("/api/v1/properties").send(propertyDto("X")).expect(401);
  });

  it("400 on contract validation failure", async () => {
    const { a } = await twoOrgs();
    await t.api.post("/api/v1/properties").set("Cookie", a.cookie)
      .send({ displayName: "", address: { line1: "", city: "", province: "", postalCode: "" } }).expect(400);
  });

  it("403 for a member whose role is not a portfolio role", async () => {
    const { a } = await twoOrgs();
    // Direct fixture: a non-portfolio role (out-of-band worker account, not creatable via the API).
    const user = await t.prisma.user.create({
      data: { email: `contractor-${crypto.randomUUID()}@example.com`, passwordHash: "x", fullName: "C R" },
    });
    await t.prisma.organizationMembership.create({
      data: { userId: user.id, organizationId: a.organizationId, role: "CONTRACTOR" },
    });
    const cookie = await sessionFor(t.prisma, user.id);
    const res = await t.api.post("/api/v1/properties").set("Cookie", cookie).send(propertyDto("X")).expect(403);
    expect(res.body.code).toBe("ROLE_NOT_PERMITTED");
  });
});

describe("GET /properties", () => {
  it("lists only the principal's own organization's properties", async () => {
    const { a, b } = await twoOrgs();
    await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("Org A House")).expect(201);
    await t.api.post("/api/v1/properties").set("Cookie", b.cookie).send(propertyDto("Org B Flat")).expect(201);

    const resA = await t.api.get("/api/v1/properties").set("Cookie", a.cookie).expect(200);
    expect(resA.body).toHaveLength(1);
    expect((resA.body[0] as Property).displayName).toBe("Org A House");
  });

  it("401 without authentication", async () => {
    await t.api.get("/api/v1/properties").expect(401);
  });
});

describe("GET /properties/:id — organization isolation", () => {
  it("hides another organization's property behind 404", async () => {
    const { a, b } = await twoOrgs();
    const created = await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("Secret")).expect(201);
    const res = await t.api.get(`/api/v1/properties/${created.body.id}`).set("Cookie", b.cookie).expect(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("returns the property with its units for the owning org", async () => {
    const { a } = await twoOrgs();
    const created = await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("24 Oak")).expect(201);
    await t.api.post(`/api/v1/properties/${created.body.id}/units`).set("Cookie", a.cookie)
      .send({ label: "Unit 4B", bedrooms: 2, bathrooms: 1 }).expect(201);
    const res = await t.api.get(`/api/v1/properties/${created.body.id}`).set("Cookie", a.cookie).expect(200);
    expect((res.body.units as Unit[])).toHaveLength(1);
    expect(res.body.units[0].label).toBe("Unit 4B");
  });
});

describe("POST /properties/:id/units — organization isolation", () => {
  it("creates a unit with organization derived from the property", async () => {
    const { a } = await twoOrgs();
    const created = await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("24 Oak")).expect(201);
    const res = await t.api.post(`/api/v1/properties/${created.body.id}/units`).set("Cookie", a.cookie)
      .send({ label: "Garden Cottage" }).expect(201);
    expect((res.body as Unit).organizationId).toBe(a.organizationId);
  });

  it("404 when another organization adds a unit to someone else's property", async () => {
    const { a, b } = await twoOrgs();
    const created = await t.api.post("/api/v1/properties").set("Cookie", a.cookie).send(propertyDto("24 Oak")).expect(201);
    await t.api.post(`/api/v1/properties/${created.body.id}/units`).set("Cookie", b.cookie)
      .send({ label: "Hijacked Unit" }).expect(404);
  });

  it("404 for a nonexistent property", async () => {
    const { a } = await twoOrgs();
    await t.api.post("/api/v1/properties/doesnotexist/units").set("Cookie", a.cookie).send({ label: "X" }).expect(404);
  });
});

export type { Tenancy };
void testPassword;
