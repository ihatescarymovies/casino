/**
 * Pill / badge component for small status labels.
 */

import { type ReactNode } from "react";

import { View, Text, StyleSheet } from "react-native";

import { colors, fontSize, radius, spacing } from "@/lib/theme";

interface PillProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "primary";
}

const variantColors: Record<string, string> = {
  default: colors.textMuted,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  primary: colors.primary,
};

export function Pill({ children, variant = "default" }: PillProps) {
  const color = variantColors[variant] ?? colors.textMuted;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: `${color}1A`, borderColor: `${color}55` },
      ]}
    >
      <Text style={[styles.text, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
});
