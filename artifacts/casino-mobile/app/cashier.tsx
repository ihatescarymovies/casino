/**
 * Cashier screen — deposit and withdraw flow.
 *
 * Requires authentication. The API spec does not yet have dedicated
 * deposit/withdrawal mutation hooks, so this screen provides the
 * full UI with a fetch-based submission that calls the payments
 * endpoint directly. When the spec gains mutation hooks, this can
 * be switched to the generated React Query mutations.
 */

import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  TextInput,
  Text,
  View,
  StyleSheet,
  Alert,
} from "react-native";

import { Card } from "@/components/Card";
import { colors, fontSize, spacing } from "@/lib/theme";
import { cashier as cashierConfig, API_BASE_URL } from "@/lib/config";
import { formatCurrency } from "@/lib/format";
import { getToken } from "@/lib/auth-storage";

type Mode = "deposit" | "withdraw";

export default function CashierScreen() {
  const params = useLocalSearchParams<{ action?: string }>();
  const [mode, setMode] = useState<Mode>(
    params.action === "withdraw" ? "withdraw" : "deposit",
  );
  const [amountCents, setAmountCents] = useState<number>(5000);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (params.action === "withdraw") setMode("withdraw");
  }, [params.action]);

  const handleSubmit = async () => {
    if (amountCents < cashierConfig.minAmountCents) {
      Alert.alert(
        "Amount too low",
        `Minimum is ${formatCurrency(cashierConfig.minAmountCents)}`,
      );
      return;
    }
    if (amountCents > cashierConfig.maxAmountCents) {
      Alert.alert(
        "Amount too high",
        `Maximum is ${formatCurrency(cashierConfig.maxAmountCents)}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert("Authentication required", "Please log in first.");
        router.push("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/payments/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amountCents }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }

      Alert.alert(
        "Success",
        `${mode === "deposit" ? "Deposit" : "Withdrawal"} submitted!`,
      );
      router.back();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Something went wrong",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Mode toggle */}
      <View style={styles.toggleContainer}>
        {(["deposit", "withdraw"] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.toggle, mode === m && styles.toggleActive]}
            onPress={() => setMode(m)}
          >
            <Text
              style={[styles.toggleText, mode === m && styles.toggleTextActive]}
            >
              {m === "deposit" ? "Deposit" : "Withdraw"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount display */}
      <Card style={styles.amountCard}>
        <Text style={styles.amountLabel}>Amount</Text>
        <Text style={styles.amountValue}>{formatCurrency(amountCents)}</Text>
      </Card>

      {/* Preset amounts */}
      <Text style={styles.sectionTitle}>Quick Select</Text>
      <View style={styles.presetsGrid}>
        {cashierConfig.presetAmounts.map((preset) => (
          <Pressable
            key={preset}
            style={[
              styles.presetButton,
              amountCents === preset && styles.presetActive,
            ]}
            onPress={() => setAmountCents(preset)}
          >
            <Text
              style={[
                styles.presetText,
                amountCents === preset && styles.presetTextActive,
              ]}
            >
              {formatCurrency(preset)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Custom amount input */}
      <Text style={styles.sectionTitle}>Custom Amount (in cents)</Text>
      <TextInput
        style={styles.input}
        value={String(amountCents)}
        onChangeText={(val) => {
          const parsed = parseInt(val, 10);
          setAmountCents(isNaN(parsed) ? 0 : parsed);
        }}
        keyboardType="numeric"
        placeholder="Enter amount in cents"
        placeholderTextColor={colors.textFaint}
      />

      {/* Submit */}
      <Pressable
        style={[styles.submitButton, submitting && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitText}>
          {submitting
            ? "Processing..."
            : `${mode === "deposit" ? "Deposit" : "Withdraw"} ${formatCurrency(amountCents)}`}
        </Text>
      </Pressable>
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
    gap: spacing.lg,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    padding: 4,
  },
  toggle: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: "500" as const,
  },
  toggleTextActive: {
    color: colors.primaryText,
    fontWeight: "600" as const,
  },
  amountCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  amountLabel: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  amountValue: {
    fontSize: fontSize.hero,
    fontWeight: "700" as const,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.text,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  presetButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}1A`,
  },
  presetText: {
    fontSize: fontSize.base,
    color: colors.text,
  },
  presetTextActive: {
    color: colors.primary,
    fontWeight: "600" as const,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.primaryText,
  },
});
