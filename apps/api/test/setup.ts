import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
