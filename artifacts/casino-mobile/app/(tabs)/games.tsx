/**
 * Games screen — scrollable list of all games with category filter.
 */

import { useListGames } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
  Image,
} from "react-native";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LoadingSpinner, ErrorText, EmptyState } from "@/components/Loading";
import { colors, fontSize, spacing } from "@/lib/theme";

const CATEGORIES = [
  "all",
  "slots",
  "table",
  "live-dealer",
  "crash",
  "dice",
  "mines",
  "plinko",
  "roulette",
  "blackjack",
];

export default function GamesScreen() {
  const [category, setCategory] = useState<string>("all");
  const { data, isLoading, error } = useListGames(
    category === "all" ? undefined : { category },
  );

  const games = useMemo(() => data ?? [], [data]);

  if (isLoading && !data) return <LoadingSpinner />;
  if (error) return <ErrorText message={error.message} />;

  return (
    <View style={styles.container}>
      {/* Category filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.chip, category === cat && styles.chipActive]}
            onPress={() => setCategory(cat)}
          >
            <Text
              style={[
                styles.chipText,
                category === cat && styles.chipTextActive,
              ]}
            >
              {cat === "all"
                ? "All"
                : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Games list */}
      {games.length === 0 ? (
        <EmptyState message="No games in this category" />
      ) : (
        <FlatList
          data={games}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={styles.gamesGrid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => (
            <Card
              padded={false}
              onPress={() => router.push(`/game/${item.id}`)}
              style={styles.gameCard}
            >
              <Image source={{ uri: item.imageUrl }} style={styles.gameImage} />
              <View style={styles.gameInfo}>
                <Text style={styles.gameName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Pill variant="primary">{item.category}</Pill>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textTransform: "capitalize",
  },
  chipTextActive: {
    color: colors.primaryText,
    fontWeight: "600",
  },
  gamesGrid: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  gridRow: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  gameCard: {
    flex: 1,
    maxWidth: "48%",
  },
  gameImage: {
    width: "100%",
    height: 110,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: colors.surface,
  },
  gameInfo: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  gameName: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.text,
  },
});
