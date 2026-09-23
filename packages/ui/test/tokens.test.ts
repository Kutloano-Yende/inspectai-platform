import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { colors, radii, shadows } from "../src/tokens.js";

const css = readFileSync(fileURLToPath(new URL("../src/tokens.css", import.meta.url)), "utf8");

describe("token parity (tokens.ts ↔ tokens.css)", () => {
  const pairs: Array<[string, string]> = [
    ["--color-navy", colors.navy],
    ["--color-slate", colors.slate],
    ["--color-teal", colors.teal],
    ["--color-stone", colors.stone],
    ["--color-sand", colors.sand],
    ["--color-success-light", colors.successLight],
    ["--color-warning-light", colors.warningLight],
    ["--color-danger-light", colors.dangerLight],
    ["--color-info-light", colors.infoLight],
    ["--color-severity-low", colors.severity.low],
    ["--color-severity-medium", colors.severity.medium],
    ["--color-severity-high", colors.severity.high],
    ["--shadow-card", shadows.card],
    ["--radius-sm", radii.sm],
    ["--radius-lg", radii.lg],
  ];
  for (const [prop, value] of pairs) {
    it(`${prop} matches`, () => {
      expect(css).toContain(`${prop}: ${value}`);
    });
  }
});

describe("every CSS custom property referenced by apps/web is actually defined", () => {
  // Regression guard: apps/web's /app/* screens once referenced --color-primary, --spacing-md
  // etc. that were never defined anywhere, so the whole section rendered unstyled. This walks
  // every CSS module under apps/web/src and fails if it finds a var(--x) name tokens.css doesn't
  // define — the same class of bug can't silently recur.
  const webSrcDir = fileURLToPath(new URL("../../../apps/web/src", import.meta.url));

  function collectCssFiles(dir: string): string[] {
    let files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files = files.concat(collectCssFiles(full));
      } else if (entry.endsWith(".css")) {
        files.push(full);
      }
    }
    return files;
  }

  const definedTokens = new Set(
    Array.from(css.matchAll(/^\s*(--[a-zA-Z0-9-]+):/gm)).map((m) => m[1]!),
  );

  const usedTokens = new Set<string>();
  for (const file of collectCssFiles(webSrcDir)) {
    const contents = readFileSync(file, "utf8");
    for (const m of contents.matchAll(/--(?:color|spacing|radius|shadow|font)[a-zA-Z0-9-]*/g)) {
      usedTokens.add(m[0]);
    }
  }

  it("found a non-trivial number of tokens to check (sanity check the walk itself worked)", () => {
    expect(usedTokens.size).toBeGreaterThan(20);
  });

  for (const token of Array.from(usedTokens).sort()) {
    it(`${token} is defined in tokens.css`, () => {
      expect(definedTokens.has(token)).toBe(true);
    });
  }
});

describe("design rules (AGENTS.md)", () => {
  it("radii stay within 8–12px", () => {
    for (const r of Object.values(radii)) {
      expect(Number(r.replace("px", ""))).toBeGreaterThanOrEqual(8);
      expect(Number(r.replace("px", ""))).toBeLessThanOrEqual(12);
    }
  });

  it("core palette matches the specified brand colours", () => {
    expect(colors.navy).toBe("#17324D");
    expect(colors.slate).toBe("#334E68");
    expect(colors.teal).toBe("#287D76");
    expect(colors.stone).toBe("#F5F4F1");
    expect(colors.sand).toBe("#E9E5DC");
  });

  it("severity mapping is consistent with status colours", () => {
    expect(colors.severity.medium).toBe(colors.warning);
    expect(colors.severity.high).toBe(colors.danger);
  });
});
