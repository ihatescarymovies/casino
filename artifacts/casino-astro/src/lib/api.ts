import { API_BASE_URL } from "@/lib/config";

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
