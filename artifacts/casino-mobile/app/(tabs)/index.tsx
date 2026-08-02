/**
 * Home screen — featured games, recent winners, and promotions.
 */

import { useListGames, useListWinners } from "@workspace/api-client-react";
import { router } from "expo-router";
import {
  FlatList,
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
import { formatCurrency, timeAgo } from "@/lib/format";

export default function HomeScreen() {
  const {
    data: games,
    isLoading: gamesLoading,
    error: gamesError,
  } = useListGames();
  const { data: winners } = useListWinners({ limit: 8 });

  if (gamesLoading && !games) return <LoadingSpinner />;
  if (gamesError) return <ErrorText message={gamesError.message} />;
  if (!games?.length) return <EmptyState message="No games available" />;

  const featuredGames = games.filter((g) => g.isFeatured).slice(0, 6);
  const recentWinners = winners ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Stats header */}
      <Card style={styles.statsCard}>
        <Text style={styles.statsTitle}>Welcome to</Text>
        <Text style={styles.statsBrand}>Charter & Oak</Text>
        <Text style={styles.statsSubtitle}>{games.length} games available</Text>
      </Card>

      {/* Featured games */}
      <Text style={styles.sectionTitle}>Featured Games</Text>
      <FlatList
        horizontal
        data={featuredGames}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
        renderItem={({ item }) => (
          <Card
            padded={false}
            onPress={() => router.push(`/game/${item.id}`)}
            style={styles.gameCard}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.gameImage} />
            <View style={styles.gameInfo}>
              <Text style={styles.gameName}>{item.name}</Text>
              <Pill variant="primary">{item.category}</Pill>
            </View>
          </Card>
        )}
      />

      {/* Recent winners */}
      {recentWinners.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Winners</Text>
          {recentWinners.map((winner) => (
            <Card key={winner.id} style={styles.winnerCard}>
              <View style={styles.winnerRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.winnerName}>{winner.playerName}</Text>
                  <Text style={styles.winnerGame}>{winner.gameName}</Text>
                </View>
                <View style={styles.winnerRight}>
                  <Text style={styles.winnerAmount}>
                    +{formatCurrency(winner.winAmount)}
                  </Text>
                  <Text style={styles.winnerTime}>
                    {timeAgo(winner.timestamp)}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
  },
  statsCard: {
    marginBottom: spacing.xl,
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  statsTitle: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  statsBrand: {
    fontSize: fontSize.hero,
    fontWeight: "700",
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  statsSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.md,
  },
  horizontalList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  gameCard: {
    width: 160,
  },
  gameImage: {
    width: 160,
    height: 120,
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
  winnerCard: {
    marginBottom: spacing.sm,
  },
  winnerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  winnerName: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.text,
  },
  winnerGame: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  winnerRight: {
    alignItems: "flex-end",
  },
  winnerAmount: {
    fontSize: fontSize.lg,
    fontWeight: "700" as const,
    color: colors.success,
  },
  winnerTime: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    marginTop: 2,
  },
});
