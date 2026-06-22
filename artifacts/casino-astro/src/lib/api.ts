/**
 * Server-side fetch helper for Astro frontmatter SSR data fetching.
 * Calls the Express API at http://localhost:3000
 */

const API_BASE_URL = "http://localhost:3000";

export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T | null> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
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
