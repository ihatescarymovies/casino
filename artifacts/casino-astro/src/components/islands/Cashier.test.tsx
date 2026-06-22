/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Cashier from "./Cashier";

// Mock @workspace/replit-auth-web
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

// Mock fetch for deposit API
const mockFetch = vi.fn();
beforeEach(() => {
  globalThis.fetch = mockFetch;
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}), // No redirect URL → success state
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Cashier", () => {
  it("renders the method selection step", () => {
    render(<Cashier />);
    expect(screen.getByText("Cashier")).toBeInTheDocument();
    expect(screen.getByText("Choose Deposit Method")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Deposit via Credit / Debit Card"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Deposit via Cryptocurrency"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Deposit via Bank Transfer"),
    ).toBeInTheDocument();
  });

  it("shows progress indicator with 3 steps", () => {
    render(<Cashier />);
    expect(screen.getByText("Method")).toBeInTheDocument();
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("navigates to amount step when a method is clicked", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));

    expect(screen.getByText("Select Amount")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
  });

  it("allows selecting a preset amount", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    // Go to amount step
    await user.click(screen.getByLabelText("Deposit via Cryptocurrency"));
    // Click $100 preset
    await user.click(screen.getByText("$100"));

    // Continue button should be enabled
    const continueBtn = screen.getByText("Continue");
    expect(continueBtn).toBeEnabled();
  });

  it("allows entering a custom amount", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Bank Transfer"));

    const input = screen.getByPlaceholderText("0.00");
    await user.type(input, "75");

    const continueBtn = screen.getByText("Continue");
    expect(continueBtn).toBeEnabled();
  });

  it("disables Continue when no amount is selected", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));

    const continueBtn = screen.getByText("Continue");
    expect(continueBtn).toBeDisabled();
  });

  it("navigates to confirm step and shows summary", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    // Select method
    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));
    // Select $250 preset
    await user.click(screen.getByText("$250"));
    // Continue
    await user.click(screen.getByText("Continue"));

    expect(
      screen.getByRole("heading", { name: "Confirm Deposit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Credit / Debit Card")).toBeInTheDocument();
    expect(screen.getByText("$250")).toBeInTheDocument();
  });

  it("goes back from amount to method step", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));
    expect(screen.getByText("Select Amount")).toBeInTheDocument();

    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Choose Deposit Method")).toBeInTheDocument();
  });

  it("goes back from confirm to amount step", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Cryptocurrency"));
    await user.click(screen.getByText("$500"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByRole("heading", { name: "Confirm Deposit" }),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Back"));
    expect(screen.getByText("Select Amount")).toBeInTheDocument();
  });

  it("shows success state after deposit", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    // Complete the flow
    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));
    await user.click(screen.getByText("$100"));
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByRole("button", { name: "Confirm Deposit" }));

    await waitFor(() => {
      expect(screen.getByText("Deposit Submitted")).toBeInTheDocument();
    });
    expect(screen.getByText("Make Another Deposit")).toBeInTheDocument();
  });

  it("resets to method step after making another deposit", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    // Complete the flow
    await user.click(screen.getByLabelText("Deposit via Bank Transfer"));
    await user.click(screen.getByText("$50"));
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByRole("button", { name: "Confirm Deposit" }));

    await waitFor(() => {
      expect(screen.getByText("Deposit Submitted")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Make Another Deposit"));
    expect(screen.getByText("Choose Deposit Method")).toBeInTheDocument();
  });

  it("shows network error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));
    await user.click(screen.getByText("$100"));
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByRole("button", { name: "Confirm Deposit" }));

    await waitFor(() => {
      expect(
        screen.getByText("Network error. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("shows minimum deposit error for amounts under $5", async () => {
    const user = userEvent.setup();
    render(<Cashier />);

    await user.click(screen.getByLabelText("Deposit via Credit / Debit Card"));

    // Enter a small custom amount ($3 = 300 cents)
    const input = screen.getByPlaceholderText("0.00");
    await user.type(input, "3");

    // The Continue button should be disabled (amount 300 < 500)
    const continueBtn = screen.getByText("Continue");
    expect(continueBtn).toBeDisabled();
  });
});
