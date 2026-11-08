import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Tests never touch real AWS S3: pin to the local MinIO container from docker-compose.yml
// (same credentials/buckets as `minio-init`) before the root .env load below can fill these
// from whatever the dev server is actually pointed at.
process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? "http://localhost:9000";
process.env.S3_REGION = process.env.TEST_S3_REGION ?? "us-east-1";
process.env.S3_ACCESS_KEY = process.env.TEST_S3_ACCESS_KEY ?? "inspectai";
process.env.S3_SECRET_KEY = process.env.TEST_S3_SECRET_KEY ?? "inspectai-secret";
process.env.S3_EVIDENCE_BUCKET = process.env.TEST_S3_EVIDENCE_BUCKET ?? "inspectai-evidence";
process.env.S3_REPORTS_BUCKET = process.env.TEST_S3_REPORTS_BUCKET ?? "inspectai-reports";

// Load root .env (gitignored; copy from .env.example) if present.
try {
  const envPath = resolve(import.meta.dirname, "../../../.env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
} catch {
  // fall back to ambient environment
}

// Tests never touch the dev database either: this spec's `beforeEach` truncates every core
// table, so it must run against its own sibling database — a *different* one from
// apps/api's "*_test" database, since `pnpm -r test` runs both packages' suites concurrently
// and two suites truncating the same database at once deadlocks. Set JOBS_TEST_DATABASE_URL
// to override; its database name must still end in "_test".
{
  const explicit = process.env.JOBS_TEST_DATABASE_URL;
  const url = new URL(explicit ?? process.env.DATABASE_URL ?? "");
  if (!explicit && !url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_jobs_test`;
  if (!url.pathname.slice(1).endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${url.pathname.slice(1)}": test database names must end in "_test".`);
  }
  process.env.DATABASE_URL = url.toString();
}
