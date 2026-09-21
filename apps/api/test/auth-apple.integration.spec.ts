import { generateKeyPairSync } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, truncateAll, type App } from "./helpers.js";

let t: App;
const savedEnv = {
  APPLE_TEAM_ID: process.env.APPLE_TEAM_ID,
  APPLE_SERVICES_ID: process.env.APPLE_SERVICES_ID,
  APPLE_KEY_ID: process.env.APPLE_KEY_ID,
  APPLE_PRIVATE_KEY: process.env.APPLE_PRIVATE_KEY,
  APPLE_REDIRECT_URI: process.env.APPLE_REDIRECT_URI,
};

// A throwaway EC P-256 key so the real ES256 client-secret signing code runs end to end.
// This is not tied to any real Apple account — it only proves our signing is well-formed;
// Apple's servers still (correctly) reject it as an unrecognized client.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const testPrivateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

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
  process.env.APPLE_TEAM_ID = savedEnv.APPLE_TEAM_ID;
  process.env.APPLE_SERVICES_ID = savedEnv.APPLE_SERVICES_ID;
  process.env.APPLE_KEY_ID = savedEnv.APPLE_KEY_ID;
  process.env.APPLE_PRIVATE_KEY = savedEnv.APPLE_PRIVATE_KEY;
  process.env.APPLE_REDIRECT_URI = savedEnv.APPLE_REDIRECT_URI;
});

function setTestCredentials() {
  process.env.APPLE_TEAM_ID = "TESTTEAMID1";
  process.env.APPLE_SERVICES_ID = "com.example.test.services";
  process.env.APPLE_KEY_ID = "TESTKEYID01";
  process.env.APPLE_PRIVATE_KEY = testPrivateKeyPem.replace(/\n/g, "\\n");
  process.env.APPLE_REDIRECT_URI = "http://localhost:4000/api/v1/auth/apple/callback";
}

describe("GET /auth/apple", () => {
  it("returns 503 OAUTH_NOT_CONFIGURED when no Apple credentials are set", async () => {
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_SERVICES_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;
    delete process.env.APPLE_REDIRECT_URI;

    const res = await t.api.get("/api/v1/auth/apple").expect(503);
    expect(res.body.code).toBe("OAUTH_NOT_CONFIGURED");
  });

  it("redirects to Apple's consent screen (form_post) with a state cookie when configured", async () => {
    setTestCredentials();

    const res = await t.api.get("/api/v1/auth/apple").expect(302);
    const location = new URL(res.headers.location);
    expect(`${location.origin}${location.pathname}`).toBe("https://appleid.apple.com/auth/authorize");
    expect(location.searchParams.get("client_id")).toBe("com.example.test.services");
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/v1/auth/apple/callback");
    expect(location.searchParams.get("response_mode")).toBe("form_post");
    expect(location.searchParams.get("scope")).toBe("name email");
    expect(location.searchParams.get("state")).toBeTruthy();

    const setCookie = res.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    expect(cookies.some((c: string) => c.startsWith("inspectai_oauth_state="))).toBe(true);
  });
});

describe("POST /auth/apple/callback", () => {
  it("redirects to /login?error=oauth_failed when state is missing or mismatched", async () => {
    const res = await t.api
      .post("/api/v1/auth/apple/callback")
      .type("form")
      .send({ code: "abc", state: "bogus" })
      .expect(302);
    expect(res.headers.location).toBe("http://localhost:3000/login?error=oauth_failed");
  });

  it(
    "redirects to /login?error=oauth_failed when Apple rejects the authorization code",
    async () => {
      setTestCredentials();

      const start = await t.api.get("/api/v1/auth/apple").expect(302);
      const setCookie = start.headers["set-cookie"];
      const stateCookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
      const state = new URL(start.headers.location).searchParams.get("state")!;

      // Hits Apple's real token endpoint with a signed-but-unregistered client + bogus code —
      // a genuine rejection from Apple's servers, not a mock.
      const res = await t.api
        .post("/api/v1/auth/apple/callback")
        .set("Cookie", stateCookie)
        .type("form")
        .send({ code: "definitely-not-a-real-code", state })
        .expect(302);
      expect(res.headers.location).toBe("http://localhost:3000/login?error=oauth_failed");
    },
    15000,
  );
});
