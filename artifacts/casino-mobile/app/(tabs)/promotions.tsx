/**
 * Promotions screen — active casino promotions.
 */

import { useListPromotions } from "@workspace/api-client-react";
import { router } from "expo-router";
import { FlatList, Text, StyleSheet, Image, View } from "react-native";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LoadingSpinner, ErrorText, EmptyState } from "@/components/Loading";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function PromotionsScreen() {
  const { data, isLoading, error } = useListPromotions();

  if (isLoading && !data) return <LoadingSpinner />;
  if (error) return <ErrorText message={error.message} />;
  if (!data?.length) return <EmptyState message="No active promotions" />;

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Card
          padded={false}
          onPress={() => router.push(`/promotion/${item.id}`)}
          style={styles.promoCard}
        >
          {item.imageUrl && (
            <Image source={{ uri: item.imageUrl }} style={styles.promoImage} />
          )}
          <View style={styles.promoInfo}>
            <Text style={styles.promoTitle}>{item.title}</Text>
            {item.description && (
              <Text style={styles.promoDesc} numberOfLines={2}>
                {item.description}
              </Text>
            )}
            <View style={styles.promoMeta}>
              {item.type && <Pill variant="primary">{item.type}</Pill>}
              <Text style={styles.promoDate}>
                Ends {new Date(item.expiresAt).toLocaleDateString()}
              </Text>
            </View>
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  promoCard: {
    overflow: "hidden",
  },
  promoImage: {
    width: "100%",
    height: 140,
    backgroundColor: colors.surface,
  },
  promoInfo: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  promoTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.text,
  },
  promoDesc: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    lineHeight: 20,
  },
  promoMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  promoDate: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
  },
});
