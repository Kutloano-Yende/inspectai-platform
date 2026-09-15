import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { generateToken, sha256 } from "../src/shared/crypto.js";

export type Api = ReturnType<typeof request>;
export type App = { app: INestApplication; prisma: PrismaService; api: Api };

export async function createTestApp(): Promise<App> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, api: request(app.getHttpServer()) };
}

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "AuditEvent", "UploadTicket", "Evidence", "AiAnalysis", "Finding", "FindingReview", "InspectionReview", "Report", "Inspection", "TenantInvitation", "Tenancy", "Unit", "Property", "Session", "OrganizationMembership", "User", "Organization" CASCADE`,
  );
}

const PASSWORD = "Str0ngPassphrase!";

export async function registerOrg(
  api: Api,
  opts?: { email?: string; organizationName?: string },
): Promise<{ cookie: string; userId: string; organizationId: string }> {
  const email = opts?.email ?? `landlord-${crypto.randomUUID()}@example.com`;
  const res = await api
    .post("/api/v1/auth/register")
    .send({
      organizationName: opts?.organizationName ?? "Yende Properties",
      fullName: "Kutloano Yende",
      email,
      password: PASSWORD,
    })
    .expect(201);
  return {
    cookie: extractCookie(res),
    userId: res.body.user.id,
    organizationId: res.body.organization.id,
  };
}

export function extractCookie(res: request.Response): string {
  const setCookie = res.headers["set-cookie"];
  if (Array.isArray(setCookie)) return (setCookie as string[])[0]!.split(";")[0]!;
  return String(setCookie).split(";")[0]!;
}

/** Creates a session directly in the DB for a user (role-test fixtures). */
export async function sessionFor(prisma: PrismaService, userId: string): Promise<string> {
  const token = generateToken();
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return `inspectai_session=${token}`;
}

export const testPassword = PASSWORD;
