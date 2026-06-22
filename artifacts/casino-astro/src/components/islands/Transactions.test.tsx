/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Transactions from "./Transactions";

const mockLogin = vi.fn();

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
    logout: vi.fn(),
  }),
}));

describe("Transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Transaction History heading", () => {
    render(<Transactions />);
    expect(screen.getByText("Transaction History")).toBeInTheDocument();
  });

  it("shows filter tab buttons", () => {
    render(<Transactions />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deposits" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Withdrawals" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wins" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bonuses" })).toBeInTheDocument();
  });

  it("shows transaction descriptions in desktop and mobile views", () => {
    render(<Transactions />);
    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bank Transfer").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("shows status badges", () => {
    render(<Transactions />);
    expect(screen.getAllByText("Completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
  });

  it("filters to deposits when Deposits tab is clicked", async () => {
    const user = userEvent.setup();
    render(<Transactions />);

    await user.click(screen.getByRole("button", { name: "Deposits" }));

    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Slots — Mega Fortune")).not.toBeInTheDocument();
  });

  it("filters to wins when Wins tab is clicked", async () => {
    const user = userEvent.setup();
    render(<Transactions />);

    await user.click(screen.getByRole("button", { name: "Wins" }));

    expect(
      screen.getAllByText("Progressive Jackpot — Divine Fortune").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Credit Card Deposit")).not.toBeInTheDocument();
  });

  it("shows all transactions when All tab is clicked after filtering", async () => {
    const user = userEvent.setup();
    render(<Transactions />);

    await user.click(screen.getByRole("button", { name: "Deposits" }));
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Slots — Mega Fortune").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows Failed status badge", () => {
    render(<Transactions />);
    expect(screen.getAllByText("Failed").length).toBeGreaterThanOrEqual(1);
  });

  it("displays Welcome Bonus in Bonuses filter", async () => {
    const user = userEvent.setup();
    render(<Transactions />);

    await user.click(screen.getByRole("button", { name: "Bonuses" }));

    expect(screen.getAllByText("Welcome Bonus").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByText("Credit Card Deposit")).not.toBeInTheDocument();
  });
});
