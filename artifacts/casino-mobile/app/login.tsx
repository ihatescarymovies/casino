/**
 * Login screen — initiates the OAuth flow via the API server's
 * mobile token exchange endpoint.
 *
 * The web app uses session cookies, but the mobile app exchanges an
 * authorization code for a bearer token stored in SecureStorage.
 *
 * Full OAuth flow:
 * 1. Open a browser session to the API server's auth endpoint
 * 2. On callback, exchange the code for a token via useExchangeMobileAuthorizationCode
 * 3. Store the returned token in SecureStorage
 * 4. All subsequent API calls automatically include the bearer token
 */

import { useExchangeMobileAuthorizationCode } from "@workspace/api-client-react";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  View,
  StyleSheet,
  Linking,
} from "react-native";

import { setToken } from "@/lib/auth-storage";
import { API_BASE_URL } from "@/lib/config";
import { colors, fontSize, spacing } from "@/lib/theme";

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const exchangeMutation = useExchangeMobileAuthorizationCode();

  const handleLogin = async () => {
    setLoading(true);
    try {
      // Step 1: Open the browser to the API server's auth endpoint
      const authUrl = `${API_BASE_URL}/auth/mobile/authorize`;
      const supported = await Linking.canOpenURL(authUrl);
      if (!supported) {
        Alert.alert("Error", "Cannot open authentication page");
        return;
      }
      // In production: implement full PKCE flow with code_verifier + redirect
      // For scaffold: redirect to the auth endpoint and let the server guide
      await Linking.openURL(authUrl);
    } catch (err) {
      Alert.alert(
        "Login failed",
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Charter & Oak</Text>
        <Text style={styles.subtitle}>Sign in to play</Text>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Connecting..." : "Sign In"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.signUpLink}
          onPress={() => {
            Linking.openURL(`${API_BASE_URL}/auth/signup`);
          }}
        >
          <Text style={styles.signUpText}>Don't have an account? Sign up</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: spacing.xl,
    alignItems: "center",
  },
  title: {
    fontSize: fontSize.hero,
    fontWeight: "700" as const,
    color: colors.primary,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  button: {
    width: "100%",
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: fontSize.lg,
    fontWeight: "600" as const,
    color: colors.primaryText,
  },
  signUpLink: {
    marginTop: spacing.xl,
  },
  signUpText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
});
