import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";

/**
 * Shared hook for React islands that require authentication.
 *
 * Encapsulates the two patterns previously duplicated in every protected island:
 *   1. useEffect redirect to login when the session is missing
 *   2. Loading / unauthenticated early-return guard
 *
 * Returns the full auth context so callers can still access `user`,
 * `logout`, etc. as needed.
 */
export function useRequireAuth() {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      auth.login();
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.login]);

  return auth;
}
