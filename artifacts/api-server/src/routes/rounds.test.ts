import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import { request } from "../test/helpers";

/* ── Mock @workspace/db ─────────────────────────────────────────────── */
/* This must be before any imports that bring in @workspace/db.          */
const mockRound = {
  id: 42,
  userId: "test-user-uuid",
  gameType: "slots",
  betAmount: 500,
  payout: 0,
  result: "pending",
  serverSeedHash: "abc123hash",
  clientSeed: "test-client-seed",
  nonce: 0,
  verified: false,
  createdAt: new Date().toISOString(),
};

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([mockRound])),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(() => Promise.resolve([mockRound])),
            })),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  gameRoundsTable: {},
  hashChainsTable: {},
}));

/* ── Mock engine libs ───────────────────────────────────────────────── */

vi.mock("../lib/wallet", () => ({
  getBalance: vi.fn(() => Promise.resolve({ balance: 5000, currency: "USD" })),
  placeBet: vi.fn(),
  creditPayout: vi.fn(),
  getTransactionHistory: vi.fn(),
}));

vi.mock("../lib/hash-chain", () => ({
  getNextHash: vi.fn(),
  verifyRound: vi.fn(),
}));

vi.mock("../lib/sse", () => ({
  sseManager: {
    broadcast: vi.fn(),
  },
}));

/* ── Imports after mocks ────────────────────────────────────────────── */

import roundsRouter from "./rounds";
import { engineRegistry } from "../engines";
import type { GameEngine } from "../lib/game-engine";
import { errorHandler } from "../middleware/errorHandler";

/* ── Mock engine ────────────────────────────────────────────────────── */

const mockEngine: GameEngine = {
  gameType: "slots",
  config: { minBet: 100, maxBet: 10000, rtp: 0.96, rules: {} },
  async placeBet() {
    return {
      roundId: 42,
      gameType: "slots",
      betAmount: 500,
      clientSeed: "test-client-seed",
      serverSeedHash: "abc123hash",
      nonce: 0,
      state: "bet_placed" as any,
      result: "pending" as any,
      payout: 0,
    };
  },
  async handleAction() {
    return {
      result: "win" as any,
      payout: 1000,
    };
  },
};

/* ── Helpers ────────────────────────────────────────────────────────── */

function createApp(
  authResult: "authenticated" | "unauthenticated" = "authenticated",
) {
  const app = express();
  app.use(express.json());
  if (authResult === "authenticated") {
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
  } else {
    app.use((req: any, _res: any, next: any) => {
      req.isAuthenticated = () => false;
      next();
    });
  }
  app.use("/api/rounds", roundsRouter);
  app.use(errorHandler);
  return app;
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("POST /api/rounds", () => {
  beforeAll(() => {
    // Register mock engine
    try {
      engineRegistry.registerEngine(mockEngine);
    } catch {
      // already registered
    }
  });

  it("creates a round and returns round data", async () => {
    const app = createApp("authenticated");
    const res = await request(app).post("/api/rounds", {
      gameType: "slots",
      betAmount: 500,
      clientSeed: "test-client-seed",
    });

    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.roundId).toBeDefined();
    expect(body.serverSeedHash).toBe("abc123hash");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createApp("unauthenticated");
    const res = await request(app).post("/api/rounds", {
      gameType: "slots",
      betAmount: 500,
      clientSeed: "test-seed",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    const app = createApp("authenticated");
    const res = await request(app).post("/api/rounds", {
      gameType: "slots",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unregistered gameType", async () => {
    const app = createApp("authenticated");
    const res = await request(app).post("/api/rounds", {
      gameType: "nonexistent",
      betAmount: 500,
      clientSeed: "test-seed",
    });
    expect(res.status).toBe(404);
    const body = res.body as any;
    expect(body.error).toContain("No engine registered");
  });
});

describe("GET /api/rounds", () => {
  it("returns list of rounds", async () => {
    const app = createApp("authenticated");
    const res = await request(app).get("/api/rounds");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = createApp("unauthenticated");
    const res = await request(app).get("/api/rounds");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/rounds/:id", () => {
  it("returns 400 for invalid round ID", async () => {
    const app = createApp("authenticated");
    const res = await request(app).get("/api/rounds/abc");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/rounds/:id/verify", () => {
  it("returns 400 when body is missing required fields", async () => {
    const app = createApp("authenticated");
    const res = await request(app).post("/api/rounds/42/verify", {});
    expect(res.status).toBe(400);
  });
});
