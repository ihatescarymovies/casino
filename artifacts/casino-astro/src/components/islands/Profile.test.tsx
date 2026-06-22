/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Profile from "./Profile";

const mockLogin = vi.fn();
const mockLogout = vi.fn();

vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: () => ({
    user: {
      id: "test-user-1",
      email: "player@charteroak.com",
      firstName: "Jane",
      lastName: "Doe",
      profileImageUrl: null,
    },
    isAuthenticated: true,
    isLoading: false,
    login: mockLogin,
    logout: mockLogout,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the profile header with user name", () => {
    render(<Profile />);
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Gold Member badge", () => {
    render(<Profile />);
    expect(screen.getAllByText("Gold Member").length).toBeGreaterThanOrEqual(1);
  });

  it("displays email in the account overview", () => {
    render(<Profile />);
    const emails = screen.getAllByText("player@charteroak.com");
    expect(emails.length).toBeGreaterThanOrEqual(1);
  });

  it("shows Edit Profile button", () => {
    render(<Profile />);
    expect(screen.getByText("Edit Profile")).toBeInTheDocument();
  });

  it("shows Security section with Change button", () => {
    render(<Profile />);
    expect(screen.getAllByText("Security").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Change")).toBeInTheDocument();
  });

  it("shows Two-Factor Authentication toggle", () => {
    render(<Profile />);
    expect(screen.getByText("Two-Factor Authentication")).toBeInTheDocument();
  });

  it("shows Sound Effects toggle", () => {
    render(<Profile />);
    expect(screen.getByText("Sound Effects")).toBeInTheDocument();
  });

  it("shows Quick Spin Mode toggle", () => {
    render(<Profile />);
    expect(screen.getByText("Quick Spin Mode")).toBeInTheDocument();
  });

  it("shows Session Management section", () => {
    render(<Profile />);
    expect(screen.getByText("Session Management")).toBeInTheDocument();
    expect(screen.getByText("Log Out All Sessions")).toBeInTheDocument();
  });

  it("toggles Sound Effects switch on click", async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const switches = screen.getAllByRole("switch");
    const soundSwitch = switches.find((s) =>
      s.closest(".flex")?.textContent?.includes("Sound Effects"),
    );
    if (soundSwitch) {
      const wasChecked = soundSwitch.getAttribute("aria-checked") === "true";
      await user.click(soundSwitch);
      expect(soundSwitch.getAttribute("aria-checked")).toBe(
        String(!wasChecked),
      );
    }
  });

  it("shows Log Out button in header", () => {
    render(<Profile />);
    const logoutButtons = screen.getAllByText("Log Out");
    expect(logoutButtons.length).toBeGreaterThanOrEqual(1);
  });
});
