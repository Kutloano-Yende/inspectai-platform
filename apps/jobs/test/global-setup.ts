import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

/** Loads the root .env (gitignored; copy from .env.example) into process.env without overriding real env vars. */
function loadRootEnv(): void {
  try {
    const envPath = resolve(import.meta.dirname, "../../../.env");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  } catch {
    // fall back to ambient environment
  }
}

/**
 * A different sibling database from apps/api's "*_test" — `pnpm -r test` runs both packages'
 * suites concurrently, and two suites truncating the same database at once deadlocks.
 * Set JOBS_TEST_DATABASE_URL to override; its database name must still end in "_test".
 */
function resolveTestDatabaseUrl(devUrl: string | undefined): string {
  const explicit = process.env.JOBS_TEST_DATABASE_URL;
  const url = new URL(explicit ?? devUrl ?? "");
  if (!explicit && !url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_jobs_test`;
  if (!url.pathname.slice(1).endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${url.pathname.slice(1)}": test database names must end in "_test".`);
  }
  return url.toString();
}

/** Creates the isolated test database if missing and brings it up to the latest migration. */
export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  const devUrl = process.env.DATABASE_URL;
  const testUrl = resolveTestDatabaseUrl(devUrl);
  const testDb = new URL(testUrl).pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(testDb)) throw new Error(`Unsupported test database name "${testDb}"`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = devUrl && new URL(devUrl).pathname !== `/${testDb}` ? new URL(devUrl).pathname : "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existing = await admin.$queryRaw<Array<{ datname: string }>>`SELECT datname FROM pg_database WHERE datname = ${testDb}`;
    if (existing.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${testDb}"`);
  } finally {
    await admin.$disconnect();
  }

  const repoRoot = resolve(import.meta.dirname, "../../..");
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema=prisma/schema.prisma"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "pipe",
  });
}
