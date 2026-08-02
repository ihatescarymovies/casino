/**
 * Promotion detail screen — shows full promotion details.
 */

import { useGetPromotion } from "@workspace/api-client-react";
import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, Text, View, StyleSheet } from "react-native";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LoadingSpinner, ErrorText, EmptyState } from "@/components/Loading";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function PromotionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const promoId = Number(id);
  const {
    data: promo,
    isLoading,
    error,
  } = useGetPromotion(promoId, {
    query: { enabled: !Number.isNaN(promoId) } as never,
  });

  if (isLoading) return <LoadingSpinner size="large" />;
  if (error) return <ErrorText message={error.message} />;
  if (!promo) return <EmptyState message="Promotion not found" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {promo.imageUrl && (
        <Image source={{ uri: promo.imageUrl }} style={styles.heroImage} />
      )}
      <Text style={styles.title}>{promo.title}</Text>
      <View style={styles.metaRow}>
        {promo.type && <Pill variant="primary">{promo.type}</Pill>}
      </View>
      <Text style={styles.description}>{promo.description}</Text>

      {promo.wagerRequirement != null && (
        <Card style={styles.bonusCard}>
          <Text style={styles.bonusLabel}>Wager Requirement</Text>
          <Text style={styles.bonusValue}>{promo.wagerRequirement}x</Text>
        </Card>
      )}

      <Card style={styles.dateCard}>
        <Text style={styles.dateLabel}>Bonus</Text>
        <Text style={styles.dateValue}>{promo.bonusAmount}</Text>
      </Card>

      <Card style={styles.dateCard}>
        <Text style={styles.dateLabel}>Expires</Text>
        <Text style={styles.dateValue}>
          {new Date(promo.expiresAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
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
    height: 200,
    borderRadius: 14,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: "700" as const,
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  description: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    lineHeight: 22,
  },
  bonusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bonusLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  bonusValue: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.primary,
  },
  dateCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  dateValue: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.primary,
  },
});
