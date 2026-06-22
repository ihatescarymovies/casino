import { vi } from "vitest";

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

const defaultUser: AuthUser = {
  id: "test-user-1",
  email: "player@charteroak.com",
  firstName: "Jane",
  lastName: "Doe",
  profileImageUrl: null,
};

export function mockUseAuth(
  overrides: Partial<{
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
  }> = {},
) {
  const user = overrides.user ?? defaultUser;
  const isAuthenticated = overrides.isAuthenticated ?? user !== null;
  const isLoading = overrides.isLoading ?? false;

  vi.mock("@workspace/replit-auth-web", () => ({
    useAuth: () => ({
      user,
      isAuthenticated,
      isLoading,
      login: vi.fn(),
      logout: vi.fn(),
    }),
  }));
}

export { defaultUser };
