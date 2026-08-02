/**
 * Root layout — sets up SafeArea, navigation theme, and app providers.
 *
 * Expo Router renders this layout around all child routes.
 */

import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppProviders } from "@/components/AppProviders";
import { colors } from "@/lib/theme";

// Custom dark navigation theme matching the casino brand
const CasinoDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.surfaceRaised,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function RootLayout() {
  return (
    <AppProviders>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.bg }}
        edges={["top"]}
      >
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surfaceRaised,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              fontWeight: "600",
            },
            contentStyle: {
              backgroundColor: colors.bg,
            },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, title: "Charter & Oak" }}
          />
          <Stack.Screen
            name="game/[id]"
            options={{ title: "Play", presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="promotion/[id]"
            options={{ title: "Promotion" }}
          />
        </Stack>
      </SafeAreaView>
    </AppProviders>
  );
}
