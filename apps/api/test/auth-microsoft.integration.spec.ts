import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, truncateAll, type App } from "./helpers.js";

let t: App;
const savedEnv = {
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
};

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t?.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
});

afterEach(() => {
  process.env.MICROSOFT_CLIENT_ID = savedEnv.MICROSOFT_CLIENT_ID;
  process.env.MICROSOFT_CLIENT_SECRET = savedEnv.MICROSOFT_CLIENT_SECRET;
  process.env.MICROSOFT_REDIRECT_URI = savedEnv.MICROSOFT_REDIRECT_URI;
});

describe("GET /auth/microsoft", () => {
  it("returns 503 OAUTH_NOT_CONFIGURED when no Microsoft credentials are set", async () => {
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_SECRET;
    delete process.env.MICROSOFT_REDIRECT_URI;

    const res = await t.api.get("/api/v1/auth/microsoft").expect(503);
    expect(res.body.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("redirects to Microsoft's consent screen with a state cookie when configured", async () => {
    process.env.MICROSOFT_CLIENT_ID = "test-client-id";
    process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
    process.env.MICROSOFT_REDIRECT_URI = "http://localhost:4000/api/v1/auth/microsoft/callback";

    const res = await t.api.get("/api/v1/auth/microsoft").expect(302);
    const location = new URL(res.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(location.searchParams.get("client_id")).toBe("test-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/v1/auth/microsoft/callback");
    expect(location.searchParams.get("scope")).toBe("openid email profile");
    expect(location.searchParams.get("state")).toBeTruthy();

    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c: string) => c.startsWith("inspectai_oauth_state="))).toBe(true);
  });
});

describe("GET /auth/microsoft/callback", () => {
  it("redirects to /login?error=oauth_failed when state is missing or mismatched", async () => {
    const res = await t.api.get("/api/v1/auth/microsoft/callback?code=abc&state=bogus").expect(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?error=oauth_failed");
  });

  it(
    "redirects to /login?error=oauth_failed when Microsoft rejects the authorization code",
    async () => {
      process.env.MICROSOFT_CLIENT_ID = "test-client-id";
      process.env.MICROSOFT_CLIENT_SECRET = "test-client-secret";
      process.env.MICROSOFT_REDIRECT_URI = "http://localhost:4000/api/v1/auth/microsoft/callback";

      const start = await t.api.get("/api/v1/auth/microsoft").expect(302);
      const setCookie = start.headers["set-cookie"];
      const stateCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
      const state = new URL(start.headers.location).searchParams.get("state")!;

      // Hits Microsoft's real token endpoint with a bogus code/credentials — a genuine rejection, not a mock.
      const res = await t.api
        .get(`/api/v1/auth/microsoft/callback?code=definitely-not-a-real-code&state=${state}`)
        .set("Cookie", stateCookie)
        .expect(302);
      expect(res.headers.location).toBe("http://localhost:3000/login?error=oauth_failed");
    },
    15000,
  );
});
