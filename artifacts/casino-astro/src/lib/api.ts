import { API_BASE_URL } from "@/lib/config";

/**
 * Server-side fetch wrapper (used in Astro pages during SSR).
 * Prepends API_BASE_URL since server needs the full origin.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T | null> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(3000),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      console.warn(`[apiFetch] HTTP ${response.status} for ${url}`);
      return null;
    }

    const data = (await response.json()) as T;
    return data;
  } catch (error) {
    console.warn(`[apiFetch] Error fetching ${url}:`, error);
    return null;
  }
}

/**
 * Client-side fetch wrapper (used in React islands in the browser).
 * Uses relative paths (the Astro middleware proxies /api/* to the backend).
 * Includes credentials for session cookies and a 10s timeout.
 */
export async function clientFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(path, {
      ...options,
      credentials: "include",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      console.warn(`[clientFetch] HTTP ${response.status} for ${path}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.warn(`[clientFetch] Error fetching ${path}:`, error);
    return null;
  }
}
