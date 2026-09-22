import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { ConflictError } from "../src/shared/errors.js";
import { createTestApp, registerOrg, truncateAll, type App } from "./helpers.js";

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
  it("creates a new organization + user on first sign-in", async () => {
    const e = email("google-new");
    const result = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-1", email: e, fullName: "Ada Lovelace" });
    expect(result.isNewAccount).toBe(true);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.googleId).toBe("google-sub-1");
    expect(user.email).toBe(e);

    const membership = await t.prisma.organizationMembership.findFirstOrThrow({ where: { userId: user.id } });
    expect(membership.role).toBe("OWNER");
  });

  it("signs in the same user on a repeat Google sign-in (matched by googleId)", async () => {
    const e = email("google-repeat");
    const first = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-2", email: e, fullName: "Ada Lovelace" });
    const second = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-2", email: e, fullName: "Ada Lovelace" });

    expect(second.isNewAccount).toBe(false);
    expect(second.userId).toBe(first.userId);
  });

  it("links Google to an existing password account with the same email", async () => {
    const e = email("google-link");
    const { userId } = await registerOrg(t.api, { email: e });

    const result = await auth.loginOrRegisterWithGoogle({ googleId: "google-sub-3", email: e, fullName: "Ignored" });
    expect(result.isNewAccount).toBe(false);
    expect(result.userId).toBe(userId);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBe("google-sub-3");
    expect(user.passwordHash).not.toBeNull(); // original password account untouched
  });
});

describe("loginOrRegisterWithApple", () => {
  it("creates a new organization + user on first sign-in", async () => {
    const e = email("apple-new");
    const result = await auth.loginOrRegisterWithApple({ appleId: "apple-sub-1", email: e, fullName: "Grace Hopper" });
    expect(result.isNewAccount).toBe(true);

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
  it("creates a new organization + user on first sign-in (no email conflict)", async () => {
    const e = email("microsoft-new");
    const result = await auth.loginOrRegisterWithMicrosoft({ microsoftId: "ms-sub-1", email: e, fullName: "Katherine Johnson" });
    expect(result.isNewAccount).toBe(true);

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
