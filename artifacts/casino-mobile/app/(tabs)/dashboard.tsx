/**
 * Dashboard screen — player wallet balance, recent transactions, and quick cashier link.
 *
 * Requires authentication (bearer token from secure storage).
 */

import { useGetWallet, useGetWalletHistory } from "@workspace/api-client-react";
import { router } from "expo-router";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
} from "react-native";

import { Card } from "@/components/Card";
import { Pill } from "@/components/Pill";
import { LoadingSpinner, ErrorText, EmptyState } from "@/components/Loading";
import { colors, fontSize, spacing } from "@/lib/theme";
import { formatCurrency, formatDate } from "@/lib/format";

export default function DashboardScreen() {
  const {
    data: wallet,
    isLoading: walletLoading,
    error: walletError,
  } = useGetWallet();
  const { data: transactions, isLoading: txLoading } = useGetWalletHistory({
    limit: 10,
  });

  if (walletLoading && !wallet) return <LoadingSpinner />;
  if (walletError) {
    return (
      <View style={styles.center}>
        <ErrorText message="Please log in to view your dashboard" />
        <Pressable
          style={styles.loginButton}
          onPress={() => router.push("/login")}
        >
          <Text style={styles.loginButtonText}>Log In</Text>
        </Pressable>
      </View>
    );
  }

  const balance = wallet?.balance ?? 0;
  const recentTxs = transactions ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Balance card */}
      <Card style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Wallet Balance</Text>
        <Text style={styles.balanceAmount}>{formatCurrency(balance)}</Text>
        <View style={styles.balanceActions}>
          <Pressable
            style={styles.actionButton}
            onPress={() => router.push("/cashier")}
          >
            <Text style={styles.actionText}>Deposit</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, styles.withdrawButton]}
            onPress={() => router.push("/cashier?action=withdraw")}
          >
            <Text style={[styles.actionText, styles.withdrawText]}>
              Withdraw
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* Recent transactions */}
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      {txLoading && !transactions ? (
        <LoadingSpinner />
      ) : recentTxs.length === 0 ? (
        <EmptyState message="No transactions yet" />
      ) : (
        <FlatList
          data={recentTxs}
          keyExtractor={(item) => String(item.id)}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Card style={styles.txCard}>
              <View style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txType}>{item.type}</Text>
                  <Text style={styles.txDate}>
                    {formatDate(item.createdAt)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    item.amount >= 0 ? styles.txPositive : styles.txNegative,
                  ]}
                >
                  {item.amount >= 0 ? "+" : ""}
                  {formatCurrency(item.amount)}
                </Text>
              </View>
              {item.status && (
                <Pill
                  variant={
                    item.status === "completed"
                      ? "success"
                      : item.status === "pending"
                        ? "warning"
                        : "danger"
                  }
                >
                  {item.status}
                </Pill>
              )}
            </Card>
          )}
        />
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    padding: spacing.xl,
  },
  balanceCard: {
    marginBottom: spacing.xl,
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  balanceLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  balanceAmount: {
    fontSize: fontSize.hero,
    fontWeight: "700" as const,
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  balanceActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  withdrawButton: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  actionText: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.primaryText,
  },
  withdrawText: {
    color: colors.primary,
  },
  loginButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  loginButtonText: {
    fontSize: fontSize.base,
    fontWeight: "600" as const,
    color: colors.primaryText,
  },
  sectionTitle: {
    fontSize: fontSize.xl,
    fontWeight: "600" as const,
    color: colors.text,
    marginBottom: spacing.md,
  },
  txCard: {
    marginBottom: spacing.sm,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  txType: {
    fontSize: fontSize.base,
    fontWeight: "500" as const,
    color: colors.text,
    textTransform: "capitalize",
  },
  txDate: {
    fontSize: fontSize.sm,
    color: colors.textFaint,
    marginTop: 2,
  },
  txAmount: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
  },
  txPositive: {
    color: colors.success,
  },
  txNegative: {
    color: colors.danger,
  },
});
