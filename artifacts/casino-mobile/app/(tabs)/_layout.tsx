/**
 * Tab navigation layout — Home, Games, Promotions, Dashboard.
 *
 * Rendered inside the root layout's Stack navigator.
 */

import { Tabs } from "expo-router";

import { colors } from "@/lib/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: colors.surfaceRaised,
        },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          headerTitle: "Charter & Oak",
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: "Games",
          tabBarLabel: "Games",
        }}
      />
      <Tabs.Screen
        name="promotions"
        options={{
          title: "Promotions",
          tabBarLabel: "Promos",
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
        }}
      />
    </Tabs>
  );
}
