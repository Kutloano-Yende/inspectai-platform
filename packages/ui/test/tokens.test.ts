import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { colors, radii, shadows } from "../src/tokens.js";

const css = readFileSync(fileURLToPath(new URL("../src/tokens.css", import.meta.url)), "utf8");

describe("token parity (tokens.ts ↔ tokens.css)", () => {
  const pairs: Array<[string, string]> = [
    ["--color-navy", colors.navy],
    ["--color-slate", colors.slate],
    ["--color-teal", colors.teal],
    ["--color-stone", colors.stone],
    ["--color-sand", colors.sand],
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
