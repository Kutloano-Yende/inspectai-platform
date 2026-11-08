import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Loads the root .env (gitignored; copy from .env.example) into process.env without overriding real env vars. */
export function loadRootEnv(): void {
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
 * Tests never touch the development database: they run against a sibling database on the same
 * server (default: the dev database name + "_test"), because specs truncate every table.
 * Set TEST_DATABASE_URL to override; its database name must still end in "_test".
 */
export function resolveTestDatabaseUrl(devUrl: string | undefined): string {
  const explicit = process.env.TEST_DATABASE_URL;
  const url = new URL(explicit ?? devUrl ?? "");
  if (!explicit && !url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  if (!url.pathname.slice(1).endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${url.pathname.slice(1)}": test database names must end in "_test".`);
  }
  return url.toString();
}

/**
 * Tests never touch real AWS S3 either: they run against the local MinIO container from
 * docker-compose.yml (same credentials/buckets as `minio-init`), regardless of what the root
 * .env points the dev server at. Must be called before loadRootEnv(), which only fills gaps.
 * Set TEST_S3_ENDPOINT (and friends) to point at a different local S3-compatible target.
 */
export function setTestS3Env(): void {
  process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? "http://localhost:9000";
  process.env.S3_REGION = process.env.TEST_S3_REGION ?? "us-east-1";
  process.env.S3_ACCESS_KEY = process.env.TEST_S3_ACCESS_KEY ?? "inspectai";
  process.env.S3_SECRET_KEY = process.env.TEST_S3_SECRET_KEY ?? "inspectai-secret";
  process.env.S3_EVIDENCE_BUCKET = process.env.TEST_S3_EVIDENCE_BUCKET ?? "inspectai-evidence";
  process.env.S3_REPORTS_BUCKET = process.env.TEST_S3_REPORTS_BUCKET ?? "inspectai-reports";
}
