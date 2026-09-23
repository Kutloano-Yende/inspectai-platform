import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service.js";
import { ConflictError } from "../src/shared/errors.js";
import { createTestApp, registerOrg, sessionFor, truncateAll, type App } from "./helpers.js";

let t: App;
let auth: AuthService;
const email = (n: string) => `${n}-${crypto.randomUUID()}@example.com`;
const savedEnv = { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI };

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

afterEach(() => {
  process.env.GOOGLE_CLIENT_ID = savedEnv.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = savedEnv.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_REDIRECT_URI = savedEnv.GOOGLE_REDIRECT_URI;
});

describe("AuthService.resolveSessionUserId", () => {
  it("returns the userId for a valid session token", async () => {
    const { userId } = await registerOrg(t.api, { email: email("resolve-valid") });
    const cookie = await sessionFor(t.prisma, userId);
    const token = cookie.split("=")[1]!;

    expect(await auth.resolveSessionUserId(token)).toBe(userId);
  });

  it("returns undefined for an unknown token", async () => {
    expect(await auth.resolveSessionUserId("not-a-real-token")).toBeUndefined();
  });
});

describe("AuthService.linkProviderForUser", () => {
  it("links a new provider to an already-authenticated user", async () => {
    const { userId } = await registerOrg(t.api, { email: email("link-new") });

    await auth.linkProviderForUser(userId, "googleId", "google-link-sub-1");

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBe("google-link-sub-1");
  });

  it("is a harmless no-op when the same user links the same provider twice", async () => {
    const { userId } = await registerOrg(t.api, { email: email("link-twice") });
    await auth.linkProviderForUser(userId, "googleId", "google-link-sub-2");

    await expect(auth.linkProviderForUser(userId, "googleId", "google-link-sub-2")).resolves.toBeUndefined();

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBe("google-link-sub-2");
  });

  it("refuses to link a provider identity already claimed by a different user", async () => {
    const { userId: victimId } = await registerOrg(t.api, { email: email("link-victim") });
    await auth.linkProviderForUser(victimId, "googleId", "google-link-sub-3");

    const { userId: attackerId } = await registerOrg(t.api, { email: email("link-attacker") });
    await expect(auth.linkProviderForUser(attackerId, "googleId", "google-link-sub-3")).rejects.toThrow(ConflictError);

    // Neither account changed.
    const victim = await t.prisma.user.findUniqueOrThrow({ where: { id: victimId } });
    const attacker = await t.prisma.user.findUniqueOrThrow({ where: { id: attackerId } });
    expect(victim.googleId).toBe("google-link-sub-3");
    expect(attacker.googleId).toBeNull();
  });
});

describe("AuthService.unlinkProvider", () => {
  it("removes a linked provider when another auth method remains", async () => {
    const { userId } = await registerOrg(t.api, { email: email("unlink-ok") });
    await auth.linkProviderForUser(userId, "googleId", "google-unlink-sub-1");

    await auth.unlinkProvider(userId, "googleId");

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBeNull();
    expect(user.passwordHash).not.toBeNull();
  });

  it("refuses to remove the only remaining auth method", async () => {
    const e = email("unlink-last");
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-unlink-sub-2", email: e, fullName: "Only Method" });

    await expect(auth.unlinkProvider(userId, "googleId")).rejects.toThrow(ConflictError);

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.googleId).toBe("google-unlink-sub-2");
  });
});

describe("GET /auth/me reflects linked providers and password status", () => {
  it("shows hasPassword true and all providers unlinked for an email-registered user", async () => {
    const { userId } = await registerOrg(t.api, { email: email("me-password-only") });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(res.body.user.hasPassword).toBe(true);
    expect(res.body.user.googleLinked).toBe(false);
    expect(res.body.user.appleLinked).toBe(false);
    expect(res.body.user.microsoftLinked).toBe(false);
  });

  it("shows hasPassword false and the provider linked for an OAuth-only user", async () => {
    const { userId } = await auth.loginOrRegisterWithGoogle({ googleId: "google-me-sub-1", email: email("me-oauth-only"), fullName: "OAuth Only" });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(res.body.user.hasPassword).toBe(false);
    expect(res.body.user.googleLinked).toBe(true);
  });
});

describe("DELETE /auth/providers/:provider", () => {
  it("returns 401 with no session", async () => {
    await t.api.delete("/api/v1/auth/providers/google").expect(401);
  });

  it("returns 400 for an unknown provider slug", async () => {
    const { userId } = await registerOrg(t.api, { email: email("unlink-http-unknown") });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api.delete("/api/v1/auth/providers/facebook").set("Cookie", cookie).expect(400);
    expect(res.body.code).toBe("UNKNOWN_PROVIDER");
  });

  it("removes a linked provider over real HTTP, reflected in GET /auth/me", async () => {
    const { userId } = await registerOrg(t.api, { email: email("unlink-http-ok") });
    await auth.linkProviderForUser(userId, "googleId", "google-unlink-http-1");
    const cookie = await sessionFor(t.prisma, userId);

    await t.api.delete("/api/v1/auth/providers/google").set("Cookie", cookie).expect(200);

    const me = await t.api.get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    expect(me.body.user.googleLinked).toBe(false);
  });

  it("returns 409 LAST_AUTH_METHOD when it's the only way to sign in", async () => {
    const { userId } = await auth.loginOrRegisterWithGoogle({
      googleId: "google-unlink-http-2",
      email: email("unlink-http-last"),
      fullName: "Only Method",
    });
    const cookie = await sessionFor(t.prisma, userId);

    const res = await t.api.delete("/api/v1/auth/providers/google").set("Cookie", cookie).expect(409);
    expect(res.body.code).toBe("LAST_AUTH_METHOD");
  });
});

describe("GET /auth/google/callback in link mode (already-authenticated session present)", () => {
  it("routes failures to /app/settings?link_error=... instead of /login, when a session cookie is present", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:4000/api/v1/auth/google/callback";

    const { userId } = await registerOrg(t.api, { email: email("link-mode-callback") });
    const sessionCookie = await sessionFor(t.prisma, userId);

    const start = await t.api.get("/api/v1/auth/google").set("Cookie", sessionCookie).expect(302);
    const setCookie = start.headers["set-cookie"];
    const stateCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
    const state = new URL(start.headers.location).searchParams.get("state")!;

    // Real rejection from Google (bogus code) — proves the callback still correctly identified
    // this as a link attempt (via the already-present session cookie) and routed accordingly.
    const res = await t.api
      .get(`/api/v1/auth/google/callback?code=definitely-not-a-real-code&state=${state}`)
      .set("Cookie", [stateCookie, sessionCookie])
      .expect(302);
    expect(res.headers.location).toContain("/app/settings?link_error=");
    expect(res.headers.location).not.toContain("/login");
  }, 15000);

  it("routes failures to /login as usual when no session cookie is present", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:4000/api/v1/auth/google/callback";

    const start = await t.api.get("/api/v1/auth/google").expect(302);
    const setCookie = start.headers["set-cookie"];
    const stateCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
    const state = new URL(start.headers.location).searchParams.get("state")!;

    const res = await t.api
      .get(`/api/v1/auth/google/callback?code=definitely-not-a-real-code&state=${state}`)
      .set("Cookie", stateCookie)
      .expect(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?error=oauth_failed");
  }, 15000);
});
