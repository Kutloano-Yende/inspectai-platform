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
    ["--color-blue", colors.blue],
    ["--color-blue-dark", colors.blueDark],
    ["--color-blue-light", colors.blueLight],
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
  // every CSS file under apps/web/src and fails if a var(--x) reference has no declaration in
  // tokens.css or in the web app's own CSS (e.g. the coss ui variable mapping).
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

  const webCss = collectCssFiles(webSrcDir).map((file) => readFileSync(file, "utf8"));
  const declared = (source: string) => Array.from(source.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)).map((m) => m[1]!);
  const definedTokens = new Set([css, ...webCss].flatMap(declared));

  // Landing/auth pages scope their own palette (--blue, --navy...) on a wrapper class, so only
  // the shared token families are checked.
  const usedTokens = new Set<string>();
  for (const contents of webCss) {
    for (const m of contents.matchAll(/var\(\s*(--(?:color|spacing|radius|shadow|font)[a-zA-Z0-9-]*)/g)) {
      usedTokens.add(m[1]!);
    }
  }

  it("found a non-trivial number of tokens to check (sanity check the walk itself worked)", () => {
    expect(usedTokens.size).toBeGreaterThan(20);
  });

  for (const token of Array.from(usedTokens).sort()) {
    it(`${token} is declared`, () => {
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
    expect(colors.navy).toBe("#0F2742");
    expect(colors.slate).toBe("#334E68");
    expect(colors.blue).toBe("#006EAD");
    expect(colors.stone).toBe("#F8FAFC");
    expect(colors.sand).toBe("#EEF3F8");
  });

  it("severity mapping is consistent with status colours", () => {
    expect(colors.severity.medium).toBe(colors.warning);
    expect(colors.severity.high).toBe(colors.danger);
  });
});
