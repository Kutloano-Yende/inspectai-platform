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
