/**
 * InspectAI design tokens — single source of truth (ARCHITECTURE.md §11, AGENTS.md).
 * These values must not be redefined in apps. Visual language: calm, professional,
 * premium property/insurance aesthetic. No purple gradients, glow, glassmorphism.
 */

export const colors = {
  /* Core palette */
  navy: "#17324D", // Primary Navy — headings, primary actions, landlord surfaces
  slate: "#334E68", // Deep Slate — secondary text, subdued UI
  teal: "#287D76", // Muted Teal — accents, evidence-verified states, links
  stone: "#F5F4F1", // Warm Stone — page backgrounds
  sand: "#E9E5DC", // Soft Sand — section fills, subtle emphasis
  white: "#FFFFFF", // Cards, elevated surfaces

  /* Derived neutrals (tints of navy/slate for borders and text) */
  ink: "#1A2A3A", // darkest text
  border: "#D8D4CC", // subtle hairline borders
  borderStrong: "#B9B4A9",
  mutedText: "#6B7A8C",

  /* Status — use sparingly and consistently (AGENTS.md design rules) */
  success: "#2E7D52",
  warning: "#B26B00",
  danger: "#A63A3A",
  info: "#2F5D8A",

  /* Light tints of the status colours above, for badge/banner backgrounds. */
  successLight: "#E3F0E8",
  warningLight: "#FBF0E1",
  dangerLight: "#F7E9E9",
  infoLight: "#E6ECF3",

  /* Semantic aliases for inspection domain */
  severity: {
    low: "#6B7A8C", // LOW — neutral slate, not a status colour
    medium: "#B26B00", // MEDIUM — warning
    high: "#A63A3A", // HIGH — danger
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
  card: "0 1px 2px rgba(23, 50, 77, 0.06), 0 1px 3px rgba(23, 50, 77, 0.08)",
  overlay: "0 4px 16px rgba(23, 50, 77, 0.12)",
} as const;

export const zIndices = { base: 0, raised: 10, sticky: 100, overlay: 1000 } as const;

export type Colors = typeof colors;
export type Radii = typeof radii;
export type Spacing = typeof spacing;
