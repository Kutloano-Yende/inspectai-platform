import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { ConflictError } from "../src/shared/errors.js";
import { createTestApp, registerOrg, sessionFor, truncateAll, type App } from "./helpers.js";

let t: App;
let auth: AuthService;
const email = (n: string) => `${n}-${crypto.randomUUID()}@example.com`;

beforeAll(async () => {
  t = await createTestApp();
  auth = t.app.get(AuthService);
});

afterAll(async () => {
  await t?.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
});

describe("loginOrRegisterWithGoogle", () => {
  it("creates a user with no organization on first sign-in (organization is named separately)", async () => {
    const e = email("google-new");
    const result = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-1", email: e, fullName: "Ada Lovelace" });
    expect(result.isNewAccount).toBe(true);
    expect(result.needsOrganization).toBe(true);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.googleId).toBe("google-sub-1");
    expect(user.email).toBe(e);

    const membership = await t.prisma.organizationMembership.findFirst({ where: { userId: user.id } });
    expect(membership).toBeNull();
  });

  it("signs in the same user on a repeat Google sign-in (matched by googleId)", async () => {
    const e = email("google-repeat");
    const first = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-2", email: e, fullName: "Ada Lovelace" });
    const second = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-2", email: e, fullName: "Ada Lovelace" });

    expect(second.isNewAccount).toBe(false);
    expect(second.needsOrganization).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it("links Google to an existing password account with the same email", async () => {
    const e = email("google-link");
    const { userId } = await registerOrg(t.api, { email: e });

    const result = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-3", email: e, fullName: "Ignored" });
    expect(result.isNewAccount).toBe(false);
    expect(result.needsOrganization).toBe(false);
    expect(result.userId).toBe(userId);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBe("google-sub-3");
    expect(user.passwordHash).not.toBeNull(); // original password account untouched
  });
});

describe("loginOrRegisterWithApple", () => {
  it("creates a user with no organization on first sign-in", async () => {
    const e = email("apple-new");
    const result = await auth.loginOrRegisterWithApple({ appleId: "apple-sub-1", email: e, fullName: "Grace Hopper" });
    expect(result.isNewAccount).toBe(true);
    expect(result.needsOrganization).toBe(true);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.appleId).toBe("apple-sub-1");
  });

  it("links Apple to an existing account created via Google (same email, different provider)", async () => {
    const e = email("apple-cross-link");
    const googleResult = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-4", email: e, fullName: "Grace Hopper" });

    const appleResult = await auth.loginOrRegisterWithApple({ appleId: "apple-sub-2", email: e, fullName: "Ignored" });
    expect(appleResult.userId).toBe(googleResult.userId);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: googleResult.userId } });
    expect(user.googleId).toBe("google-sub-4");
    expect(user.appleId).toBe("apple-sub-2");
  });
});

describe("loginOrRegisterWithMicrosoft", () => {
  it("creates a user with no organization on first sign-in (no email conflict)", async () => {
    const e = email("microsoft-new");
    const result = await auth.loginOrRegisterWithMicrosoft({ microsoftId: "ms-sub-1", email: e, fullName: "Katherine Johnson" });
    expect(result.isNewAccount).toBe(true);
    expect(result.needsOrganization).toBe(true);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.microsoftId).toBe("ms-sub-1");
  });

  it("signs in the same user on a repeat Microsoft sign-in (matched by microsoftId)", async () => {
    const e = email("microsoft-repeat");
    const first = await auth.loginOrRegisterWithMicrosoft({ microsoftId: "ms-sub-2", email: e, fullName: "Katherine Johnson" });
    const second = await auth.loginOrRegisterWithMicrosoft({ microsoftId: "ms-sub-2", email: e, fullName: "Katherine Johnson" });

    expect(second.isNewAccount).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it(
    "refuses to auto-link when the email matches an existing account (Microsoft's email claim isn't verified)",
    async () => {
      const e = email("microsoft-no-link");
      const { userId } = await registerOrg(t.api, { email: e });

      await expect(auth.loginOrRegisterWithMicrosoft({ microsoftId: "ms-sub-3", email: e, fullName: "Attacker-controlled name" })).rejects.toThrow(
        ConflictError,
      );

      // The original account must be completely untouched — no microsoftId linked.
      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.microsoftId).toBeNull();
    },
  );
});

describe("completeOrganization", () => {
  it("names the organization for a user created without one via OAuth", async () => {
    const e = email("complete-org-new");
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-5", email: e, fullName: "Rosalind Franklin" });

    const result = await auth.completeOrganization(userId, { organizationName: "Franklin Rentals" });
    expect(result.organization.name).toBe("Franklin Rentals");

    const membership = await t.prisma.organizationMembership.findFirstOrThrow({ where: { userId } });
    expect(membership.organizationId).toBe(result.organization.id);
    expect(membership.role).toBe("OWNER");
  });

  it("refuses if the user already belongs to an organization (via register())", async () => {
    const { userId } = await registerOrg(t.api, { email: email("complete-org-existing") });

    await expect(auth.completeOrganization(userId, { organizationName: "Second Org" })).rejects.toThrow(ConflictError);

    // No second organization was created.
    const memberships = await t.prisma.organizationMembership.findMany({ where: { userId } });
    expect(memberships).toHaveLength(1);
  });

  it("refuses a second call for a user who already completed onboarding", async () => {
    const e = email("complete-org-twice");
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-6", email: e, fullName: "Rosalind Franklin" });
    await auth.completeOrganization(userId, { organizationName: "First Org" });

    await expect(auth.completeOrganization(userId, { organizationName: "Second Org" })).rejects.toThrow(ConflictError);

    const memberships = await t.prisma.organizationMembership.findMany({ where: { userId } });
    expect(memberships).toHaveLength(1);
    const organization = await t.prisma.organization.findUniqueOrThrow({ where: { id: memberships[0]!.organizationId } });
    expect(organization.name).toBe("First Org");
  });
});

describe("POST /auth/complete-organization", () => {
  it("returns 401 with no session", async () => {
    await t.api.post("/api/v1/auth/complete-organization").send({ organizationName: "No Session Org" }).expect(401);
  });

  it("creates the organization over real HTTP for an org-less OAuth user, visible via GET /auth/me", async () => {
    const e = email("http-complete-org");
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-7", email: e, fullName: "Marie Curie" });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api
      .post("/api/v1/auth/complete-organization")
      .set("Cookie", cookie)
      .send({ organizationName: "Curie Labs" })
      .expect(200);
    expect(res.body.organization.name).toBe("Curie Labs");

    const me = await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.organizations).toHaveLength(1);
    expect(me.body.organizations[0].name).toBe("Curie Labs");
    expect(me.body.organizations[0].role).toBe("OWNER");
  });

  it("rejects a blank organization name via the same Zod validation register() uses", async () => {
    const e = email("http-complete-org-invalid");
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-8", email: e, fullName: "Marie Curie" });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api.post("/api/v1/auth/complete-organization").set("Cookie", cookie).send({ organizationName: "" }).expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });

  it("returns 409 over real HTTP when the user already has an organization", async () => {
    const { userId } = await registerOrg(t.api, { email: email("http-complete-org-conflict") });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api
      .post("/api/v1/auth/complete-organization")
      .set("Cookie", cookie)
      .send({ organizationName: "Second Org" })
      .expect(409);
    expect(res.body.code).toBe("ORGANIZATION_ALREADY_EXISTS");
  });
});
