/**
 * App initialization — called once on startup.
 *
 * Wires the generated API client to use the mobile base URL and
 * the secure auth token getter so all `useXxx` hooks "just work".
 */

import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { API_BASE_URL } from "./config";
import { getToken } from "./auth-storage";

let initialized = false;

export function initApi(): void {
  if (initialized) return;
  initialized = true;

  // Route all relative API calls to the backend server
  setBaseUrl(API_BASE_URL);

  // Attach bearer token from secure storage to every request
  setAuthTokenGetter(async () => {
    return await getToken();
  });
}
