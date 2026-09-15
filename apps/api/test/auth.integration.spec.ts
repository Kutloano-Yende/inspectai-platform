import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, extractCookie, registerOrg, truncateAll, type App } from "./helpers.js";

let t: App;
const email = (n: string) => `${n}-${crypto.randomUUID()}@example.com`;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t?.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
});

describe("POST /auth/register", () => {
  it("creates organization, OWNER membership, session cookie and audit event", async () => {
    const res = await t.api
      .post("/api/v1/auth/register")
      .send({ organizationName: "Acme Rentals", fullName: "Sarah Johnson", email: email("a"), password: "Str0ngPassphrase!" })
      .expect(201);

    expect(res.body.organization.name).toBe("Acme Rentals");
    expect(res.headers["set-cookie"]).toBeDefined();

    const membership = await t.prisma.organizationMembership.findFirstOrThrow({
      where: { userId: res.body.user.id },
    });
    expect(membership.role).toBe("OWNER");
    expect(membership.organizationId).toBe(res.body.organization.id);

    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: "user.registered_org" } });
    expect(audit.actorUserId).toBe(res.body.user.id);
  });

  it("rejects duplicate email with 409", async () => {
    const e = email("dup");
    await registerOrg(t.api, { email: e });
    const res = await t.api
      .post("/api/v1/auth/register")
      .send({ organizationName: "Other Org", fullName: "X Y", email: e, password: "Str0ngPassphrase!" })
      .expect(409);
    expect(res.body.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("rejects weak password and bad email via contracts validation (400)", async () => {
    const res = await t.api
      .post("/api/v1/auth/register")
      .send({ organizationName: "Acme", fullName: "A B", email: "not-an-email", password: "short" })
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("rejects unauthenticated-looking malformed body (400)", async () => {
    await t.api.post("/api/v1/auth/register").send({}).expect(400);
  });
});

describe("POST /auth/login", () => {
  it("returns a session cookie for valid credentials", async () => {
    const e = email("login");
    await registerOrg(t.api, { email: e });
    const res = await t.api
      .post("/api/v1/auth/login")
      .send({ email: e, password: "Str0ngPassphrase!" })
      .expect(200);
    expect(extractCookie(res)).toContain("inspectai_session=");
  });

  it("returns 401 INVALID_CREDENTIALS for wrong password (no user enumeration)", async () => {
    const e = email("wrongpw");
    await registerOrg(t.api, { email: e });
    const res = await t.api.post("/api/v1/auth/login").send({ email: e, password: "WrongPassword123" }).expect(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 401 for unknown email with the same code", async () => {
    const res = await t.api.post("/api/v1/auth/login").send({ email: email("ghost"), password: "WhateverLong1!" }).expect(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /auth/me", () => {
  it("401 without a session", async () => {
    const res = await t.api.get("/api/v1/auth/me").expect(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
  });

  it("401 with an invalid session cookie", async () => {
    await t.api.get("/api/v1/auth/me").set("Cookie", "inspectai_session=forged-token").expect(401);
  });

  it("returns the user and organization roles", async () => {
    const { cookie } = await registerOrg(t.api);
    const res = await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(res.body.user.email).toBeDefined();
    expect(res.body.organizations).toHaveLength(1);
    expect(res.body.organizations[0].role).toBe("OWNER");
  });
});

describe("POST /auth/logout", () => {
  it("invalidates the session", async () => {
    const { cookie } = await registerOrg(t.api);
    await t.api.post("/api/v1/auth/logout").set("Cookie", cookie).expect(200);
    await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(401);
  });
});
