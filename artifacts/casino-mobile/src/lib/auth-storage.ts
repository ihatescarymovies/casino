/**
 * Secure storage wrapper for auth tokens using expo-secure-store.
 *
 * On iOS, values are stored in the Keychain.
 * On Android, values are encrypted and stored in SharedPreferences.
 */

import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "auth_token";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Token may not exist yet — safe to ignore
  }
}
