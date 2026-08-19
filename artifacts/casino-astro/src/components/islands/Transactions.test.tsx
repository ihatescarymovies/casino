/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

/** DB-shaped rows returned by /api/wallet/history */
const MOCK_DB_TRANSACTIONS = [
  {
    id: 1,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "deposit",
    amount: 50000,
    balance_before: 0,
    balance_after: 50000,
    status: "completed",
    reference_id: null,
    description: "Credit Card Deposit",
    created_at: "2026-06-22T14:30:00Z",
  },
  {
    id: 2,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bet",
    amount: 2500,
    balance_before: 50000,
    balance_after: 47500,
    status: "completed",
    reference_id: "round-1",
    description: "Slots — Mega Fortune",
    created_at: "2026-06-21T18:45:00Z",
  },
  {
    id: 3,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "payout",
    amount: 12500,
    balance_before: 47500,
    balance_after: 60000,
    status: "completed",
    reference_id: "round-1",
    description: "Slots — Mega Fortune",
    created_at: "2026-06-21T19:02:00Z",
  },
  {
    id: 4,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "withdrawal",
    amount: 20000,
    balance_before: 60000,
    balance_after: 40000,
    status: "pending",
    reference_id: null,
    description: "Bank Transfer",
    created_at: "2026-06-20T10:15:00Z",
  },
  {
    id: 5,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bet",
    amount: 5000,
    balance_before: 40000,
    balance_after: 35000,
    status: "completed",
    reference_id: "round-2",
    description: "Blackjack — Table 7",
    created_at: "2026-06-19T22:30:00Z",
  },
  {
    id: 6,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "payout",
    amount: 7500,
    balance_before: 35000,
    balance_after: 42500,
    status: "completed",
    reference_id: "round-2",
    description: "Blackjack — Table 7",
    created_at: "2026-06-19T22:45:00Z",
  },
  {
    id: 7,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bonus",
    amount: 10000,
    balance_before: 42500,
    balance_after: 52500,
    status: "completed",
    reference_id: null,
    description: "Welcome Bonus",
    created_at: "2026-06-18T09:00:00Z",
  },
  {
    id: 8,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "deposit",
    amount: 25000,
    balance_before: 52500,
    balance_after: 77500,
    status: "completed",
    reference_id: null,
    description: "Crypto Deposit (BTC)",
    created_at: "2026-06-17T16:20:00Z",
  },
  {
    id: 9,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bet",
    amount: 10000,
    balance_before: 77500,
    balance_after: 67500,
    status: "failed",
    reference_id: "round-3",
    description: "Roulette — European",
    created_at: "2026-06-16T20:00:00Z",
  },
  {
    id: 10,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "payout",
    amount: 50000,
    balance_before: 67500,
    balance_after: 117500,
    status: "completed",
    reference_id: "round-4",
    description: "Progressive Jackpot — Divine Fortune",
    created_at: "2026-06-15T11:30:00Z",
  },
  {
    id: 11,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "withdrawal",
    amount: 15000,
    balance_before: 117500,
    balance_after: 102500,
    status: "completed",
    reference_id: null,
    description: "PayPal",
    created_at: "2026-06-14T14:00:00Z",
  },
  {
    id: 12,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bet",
    amount: 3000,
    balance_before: 102500,
    balance_after: 99500,
    status: "completed",
    reference_id: "round-5",
    description: "Poker — Texas Hold'em",
    created_at: "2026-06-13T21:15:00Z",
  },
  {
    id: 13,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "bonus",
    amount: 5000,
    balance_before: 99500,
    balance_after: 104500,
    status: "completed",
    reference_id: null,
    description: "Weekly Reload Bonus",
    created_at: "2026-06-12T08:45:00Z",
  },
  {
    id: 14,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "deposit",
    amount: 100000,
    balance_before: 104500,
    balance_after: 204500,
    status: "completed",
    reference_id: null,
    description: "Bank Wire",
    created_at: "2026-06-11T17:30:00Z",
  },
  {
    id: 15,
    wallet_id: 1,
    user_id: "test-user-1",
    type: "payout",
    amount: 2200,
    balance_before: 204500,
    balance_after: 206700,
    status: "completed",
    reference_id: "round-6",
    description: "Baccarat — VIP Room",
    created_at: "2026-06-10T13:00:00Z",
  },
];

describe("Transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_DB_TRANSACTIONS),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the Transaction History heading", async () => {
    render(<Transactions />);
    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });
  });

  it("shows filter tab buttons", async () => {
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });
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

  it("shows transaction descriptions in desktop and mobile views", async () => {
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Bank Transfer").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("shows status badges", async () => {
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Completed").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Pending").length).toBeGreaterThanOrEqual(1);
  });

  it("filters to deposits when Deposits tab is clicked", async () => {
    const user = userEvent.setup();
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Deposits" }));

    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Slots — Mega Fortune")).not.toBeInTheDocument();
  });

  it("filters to wins when Wins tab is clicked", async () => {
    const user = userEvent.setup();
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Wins" }));

    expect(
      screen.getAllByText("Progressive Jackpot — Divine Fortune").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Credit Card Deposit")).not.toBeInTheDocument();
  });

  it("shows all transactions when All tab is clicked after filtering", async () => {
    const user = userEvent.setup();
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Deposits" }));
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(
      screen.getAllByText("Credit Card Deposit").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Slots — Mega Fortune").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("shows Failed status badge", async () => {
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("Failed").length).toBeGreaterThanOrEqual(1);
  });

  it("displays Welcome Bonus in Bonuses filter", async () => {
    const user = userEvent.setup();
    render(<Transactions />);
    await waitFor(() => {
      expect(
        screen.queryByText("Loading transactions..."),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Bonuses" }));

    expect(screen.getAllByText("Welcome Bonus").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByText("Credit Card Deposit")).not.toBeInTheDocument();
  });
});
