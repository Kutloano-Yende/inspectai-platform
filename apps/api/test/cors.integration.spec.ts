import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";

let app: INestApplication | undefined;
const savedCorsOrigins = process.env.CORS_ORIGINS;

afterEach(async () => {
  process.env.CORS_ORIGINS = savedCorsOrigins;
  await app?.close();
  app = undefined;
});

async function bootWithCors(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

describe("CORS_ORIGINS", () => {
  it("defaults to localhost:3000/3001 when unset", async () => {
    delete process.env.CORS_ORIGINS;
    const a = await bootWithCors();

    const allowed = await request(a.getHttpServer()).get("/api/v1/auth/me").set("Origin", "http://localhost:3000");
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3000");

    const disallowed = await request(a.getHttpServer()).get("/api/v1/auth/me").set("Origin", "https://evil.example.com");
    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("uses CORS_ORIGINS when set, rejecting the localhost defaults", async () => {
    process.env.CORS_ORIGINS = "https://app.example.com, https://staging.example.com";
    const a = await bootWithCors();

    const allowed = await request(a.getHttpServer()).get("/api/v1/auth/me").set("Origin", "https://app.example.com");
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");

    const alsoAllowed = await request(a.getHttpServer()).get("/api/v1/auth/me").set("Origin", "https://staging.example.com");
    expect(alsoAllowed.headers["access-control-allow-origin"]).toBe("https://staging.example.com");

    const disallowed = await request(a.getHttpServer()).get("/api/v1/auth/me").set("Origin", "http://localhost:3000");
    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
