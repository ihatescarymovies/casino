/**
 * Reusable Card component.
 * A surfaced container with padding and rounded corners.
 */

import { type ReactNode } from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

export function Card({ children, onPress, style, padded = true }: CardProps) {
  const cardStyle: ViewStyle = {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(padded ? { padding: spacing.lg } : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          style,
          pressed && { opacity: 0.85 },
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
