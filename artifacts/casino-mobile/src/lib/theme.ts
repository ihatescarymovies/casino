/**
 * Design tokens for the Charter & Oak mobile app.
 *
 * Centralized color palette, spacing, typography, and border radii.
 * Styled to match the web app's dark casino theme.
 */

export const colors = {
  // Backgrounds
  bg: "#0a0a0b",
  surface: "#15151800",
  surfaceRaised: "#1c1c20",
  card: "#22222700",

  // Text
  text: "#f0f0f2",
  textMuted: "#909096",
  textFaint: "#5c5c63",

  // Brand
  primary: "#e8b339", // Gold
  primaryText: "#1a1300",
  secondary: "#4a90d9",

  // Status
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",

  // Borders
  border: "#2a2a30",
  borderHover: "#3a3a42",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const fontSize = {
  sm: 13,
  base: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 34,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
} as const;
