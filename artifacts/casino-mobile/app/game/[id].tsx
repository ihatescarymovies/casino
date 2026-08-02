/**
 * Game detail screen — loads a single game and shows play info.
 *
 * In a full implementation this would render the game's React Native
 * component (or a WebView for web-based games). For the scaffold it
 * shows game metadata and a placeholder play area.
 */

import { useGetGame } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, Text, View, StyleSheet } from "react-native";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LoadingSpinner, ErrorText, EmptyState } from "@/components/Loading";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const gameId = Number(id);
  const {
    data: game,
    isLoading,
    error,
  } = useGetGame(gameId, {
    query: { enabled: !Number.isNaN(gameId) } as never,
  });

  if (isLoading) return <LoadingSpinner size="large" />;
  if (error) return <ErrorText message={error.message} />;
  if (!game) return <EmptyState message="Game not found" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {game.imageUrl && (
        <Image source={{ uri: game.imageUrl }} style={styles.heroImage} />
      )}
      <Text style={styles.title}>{game.name}</Text>
      <View style={styles.metaRow}>
        <Pill variant="primary">{game.category}</Pill>
        <Text style={styles.provider}>{game.provider}</Text>
      </View>

      {game.description && (
        <Text style={styles.description}>{game.description}</Text>
      )}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>RTP</Text>
          <Text style={styles.statValue}>{(game.rtp * 100).toFixed(1)}%</Text>
        </View>
        {game.minBet != null && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Min Bet</Text>
            <Text style={styles.statValue}>
              ${(game.minBet / 100).toFixed(2)}
            </Text>
          </View>
        )}
        {game.maxBet != null && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Max Bet</Text>
            <Text style={styles.statValue}>
              ${(game.maxBet / 100).toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {game.jackpotAmount != null && (
        <Card style={styles.jackpotCard}>
          <Text style={styles.jackpotLabel}>Jackpot</Text>
          <Text style={styles.jackpotAmount}>
            ${(game.jackpotAmount / 100).toFixed(2)}
          </Text>
        </Card>
      )}

      <Card style={styles.playArea}>
        <Text style={styles.playTitle}>Ready to play?</Text>
        <Text style={styles.playDesc}>
          Game component integration coming soon. This screen will render the
          native game component or load a WebView for web-based games.
        </Text>
      </Card>
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
    gap: spacing.md,
  },
  heroImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: "700" as const,
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  provider: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.text,
  },
  jackpotCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  jackpotLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  jackpotAmount: {
    fontSize: fontSize.xxl,
    fontWeight: "700" as const,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  playArea: {
    marginTop: spacing.sm,
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  playTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  playDesc: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});
