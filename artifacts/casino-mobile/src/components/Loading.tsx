/**
 * Simple loading spinner / skeleton text components.
 */

import { ActivityIndicator, Text, View, StyleSheet } from "react-native";

import { colors, fontSize } from "@/lib/theme";

export function LoadingSpinner({
  size = "small",
}: {
  size?: "small" | "large";
}) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size={size} color={colors.primary} />
    </View>
  );
}

export function FullScreenLoader() {
  return (
    <View style={styles.fullScreen}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorText({ message }: { message: string }) {
  return <Text style={styles.errorText}>{message}</Text>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  fullScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  errorText: {
    color: colors.danger,
    fontSize: fontSize.base,
    textAlign: "center",
    padding: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    textAlign: "center",
  },
});
