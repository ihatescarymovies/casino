import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import { request } from "../test/helpers";
import walletRouter from "./wallet";

/* ── Mock wallet lib ────────────────────────────────────────────────── */

vi.mock("../lib/wallet", () => ({
  getBalance: vi.fn(),
  getTransactionHistory: vi.fn(),
}));

import * as wallet from "../lib/wallet";

/* ── App setup ──────────────────────────────────────────────────────── */

function createApp() {
  const app = express();
  app.use(express.json());
  // Mock auth — always authenticated
  app.use((req: any, _res: any, next: any) => {
    req.user = {
      id: "test-user-uuid",
      email: "test@test.com",
      firstName: "Test",
      lastName: "User",
      profileImageUrl: null,
    };
    req.isAuthenticated = () => true;
    next();
  });
  app.use("/api/wallet", walletRouter);
  return app;
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("GET /api/wallet", () => {
  it("returns balance", async () => {
    vi.mocked(wallet.getBalance).mockResolvedValue({
      balance: 5000,
      currency: "USD",
    });

    const app = createApp();
    const res = await request(app).get("/api/wallet");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: 5000, currency: "USD" });
  });

  it("returns 401 when unauthenticated", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.isAuthenticated = () => false;
      next();
    });
    app.use("/api/wallet", walletRouter);

    const res = await request(app).get("/api/wallet");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/wallet/history", () => {
  it("returns transactions", async () => {
    const mockTxs = [
      {
        id: 1,
        walletId: 1,
        userId: "test-user-uuid",
        type: "bet",
        amount: 500,
        balanceBefore: 5000,
        balanceAfter: 4500,
        status: "completed",
        referenceId: null,
        description: "Test",
        createdAt: "2025-01-01T00:00:00Z",
      },
    ];
    vi.mocked(wallet.getTransactionHistory).mockResolvedValue({
      transactions: mockTxs as any,
      total: 1,
      page: 1,
      limit: 20,
    });

    const app = createApp();
    const res = await request(app).get("/api/wallet/history");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect((res.body as any[])[0].type).toBe("bet");
  });
});
