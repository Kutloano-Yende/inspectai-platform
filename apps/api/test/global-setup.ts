import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadRootEnv, resolveTestDatabaseUrl } from "./test-db.js";

/** Creates the isolated test database if missing and brings it up to the latest migration. */
export default async function globalSetup(): Promise<void> {
  loadRootEnv();
  const devUrl = process.env.DATABASE_URL;
  const testUrl = resolveTestDatabaseUrl(devUrl);
  const testDb = new URL(testUrl).pathname.slice(1);
  if (!/^[A-Za-z0-9_]+$/.test(testDb)) throw new Error(`Unsupported test database name "${testDb}"`);

  // Connect to a database that already exists on the same server (the dev one, else "postgres").
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
