/**
 * InspectAI design tokens — single source of truth (ARCHITECTURE.md §11, AGENTS.md).
 * These values must not be redefined in apps. Visual language: calm, professional,
 * premium property/insurance aesthetic. No purple gradients, glow, glassmorphism.
 */

export const colors = {
  /* Core palette — matches the public landing/auth screens so the whole product reads as one. */
  navy: "#0F2742", // Deep Navy — headings, landlord surfaces
  slate: "#334E68", // Deep Slate — secondary text, subdued UI
  blue: "#006EAD", // Primary Blue — primary actions, links, accents
  blueDark: "#00537F", // hover/active state of blue
  blueLight: "#EAF5FB", // tint of blue for selected/soft backgrounds
  stone: "#F8FAFC", // Page backgrounds
  sand: "#EEF3F8", // Section fills, subtle emphasis
  white: "#FFFFFF", // Cards, elevated surfaces

  /* Derived neutrals (tints of navy/slate for borders and text) */
  ink: "#172B4D", // darkest text
  border: "#E2E8F0", // subtle hairline borders
  borderStrong: "#CBD5E1",
  mutedText: "#64748B",

  /* Status — use sparingly and consistently (AGENTS.md design rules) */
  success: "#168A70",
  warning: "#B26B00",
  danger: "#B3423F",
  info: "#006EAD",

  /* Light tints of the status colours above, for badge/banner backgrounds. */
  successLight: "#E3F6F1",
  warningLight: "#FBF0E1",
  dangerLight: "#FDF3F3",
  infoLight: "#EAF5FB",

  /* Semantic aliases for inspection domain */
  severity: {
    low: "#64748B", // LOW — neutral slate, not a status colour
    medium: "#B26B00", // MEDIUM — warning
    high: "#B3423F", // HIGH — danger
  },
} as const;

export const radii = {
  sm: "8px",
  md: "10px",
  lg: "12px",
} as const; // 8–12px only — no excessive rounding

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "24px",
  6: "32px",
  7: "48px",
  8: "64px",
} as const;

export const typography = {
  fontFamily: {
    sans: "'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif",
    /** Evidence/document voice — reports, findings, quotes. */
    serif: "'Source Serif 4', Georgia, serif",
  },
  fontSize: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "22px",
    "2xl": "28px",
    "3xl": "36px",
  },
  lineHeight: { tight: 1.2, normal: 1.5, relaxed: 1.7 },
} as const;

export const shadows = {
  /** Subtle only — one elevation level for cards, one for overlays. */
  card: "0 1px 2px rgba(15, 39, 66, 0.06), 0 1px 3px rgba(15, 39, 66, 0.08)",
  overlay: "0 4px 16px rgba(15, 39, 66, 0.12)",
} as const;

export const zIndices = { base: 0, raised: 10, sticky: 100, overlay: 1000 } as const;

export type Colors = typeof colors;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
