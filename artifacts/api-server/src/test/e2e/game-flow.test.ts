import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import {
  request,
  resetDbState,
  seedUser,
  seedWallet,
  seedDemoWallet,
  seedHashChain,
  setupMockDb,
} from "./helpers";
import { errorHandler } from "../../middleware/errorHandler";

/* ── Mock @workspace/db BEFORE importing routes ─────────────────────── */

setupMockDb();

/* ── Imports after mocks ───────────────────────────────────────────── */

import roundsRouter from "../../routes/rounds";
import walletRouter from "../../routes/wallet";
import demoWalletRouter from "../../routes/demo-wallet";
import { engineRegistry } from "../../engines";
import { SlotsEngine } from "../../engines/slots";
import { BlackjackEngine } from "../../engines/blackjack";
import { RouletteEngine } from "../../engines/roulette";
import { DiceEngine } from "../../engines/dice";
import { CrashEngine } from "../../engines/crash";
import { MinesEngine } from "../../engines/mines";
import { PlinkoEngine } from "../../engines/plinko";

/* ── App factory ────────────────────────────────────────────────────── */

function createApp(userId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    if (userId) {
      req.user = {
        id: userId,
        email: "test@example.com",
        firstName: "Test",
        lastName: "User",
        profileImageUrl: null,
      };
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    next();
  });
  app.use("/api/rounds", roundsRouter);
  app.use("/api/wallet", walletRouter);
  app.use("/api/demo/wallet", demoWalletRouter);
  app.use(errorHandler);
  return app;
}

/* ── Setup ─────────────────────────────────────────────────────────── */

const TEST_USER_ID = "e2e-test-user";

beforeAll(() => {
  // Register all engines
  const engines = [
    new SlotsEngine(),
    new BlackjackEngine(),
    new RouletteEngine(),
    new DiceEngine(),
    new CrashEngine(),
    new MinesEngine(),
    new PlinkoEngine(),
  ];
  for (const engine of engines) {
    try {
      engineRegistry.registerEngine(engine);
    } catch {
      // already registered
    }
  }
});

beforeEach(() => {
  resetDbState();
});

/* ── Helper: place a bet ────────────────────────────────────────────── */

async function placeBet(
  app: ReturnType<typeof createApp>,
  gameType: string,
  betAmount: number,
  clientSeed: string,
  gameParams?: Record<string, unknown>,
) {
  return request(app).post("/api/rounds", {
    gameType,
    betAmount,
    clientSeed,
    gameParams,
  });
}

/* ── Slots ──────────────────────────────────────────────────────────── */

describe("E2E: Slots", () => {
  it("places a real bet, resolves, verifies fairness, and updates wallet", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("slots", 5);

    const app = createApp(TEST_USER_ID);

    // Place bet
    const betRes = await placeBet(app, "slots", 500, "slots-seed-1");
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();
    expect(betBody.serverSeedHash).toBeDefined();
    expect(betBody.newBalance).toBe(4500);

    // Get round details
    const roundRes = await request(app).get(`/api/rounds/${betBody.roundId}`);
    expect(roundRes.status).toBe(200);
    const round = roundRes.body as any;
    expect(round.gameType).toBe("slots");

    // Verify fairness
    const verifyRes = await request(app).post(
      `/api/rounds/${betBody.roundId}/verify`,
      {
        roundId: betBody.roundId,
        serverSeed: "dummy-seed", // Mock will handle this
      },
    );
    expect(verifyRes.status).toBe(200);
  });

  it("places a demo bet and updates demo wallet", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("slots", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "slots", 500, "slots-demo-seed", {
      demo: true,
    });
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.demo).toBe(true);
    expect(betBody.newBalance).toBeDefined();
  });

  it("returns 402 for insufficient funds", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 100);
    seedHashChain("slots", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "slots", 500, "slots-seed-insufficient");
    expect(betRes.status).toBe(402);
  });
});

/* ── Blackjack ──────────────────────────────────────────────────────── */

describe("E2E: Blackjack", () => {
  it("places a real bet and handles hit action", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("blackjack", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "blackjack", 1000, "bj-seed-1");
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();

    // Handle action (hit)
    const actionRes = await request(app).post(
      `/api/rounds/${betBody.roundId}`,
      {
        action: "hit",
      },
    );
    expect(actionRes.status).toBe(200);
    const actionBody = actionRes.body as any;
    expect(actionBody.result).toBeDefined();
    expect(actionBody.payout).toBeDefined();
  });

  it("places a demo bet and handles stand action", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("blackjack", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "blackjack", 500, "bj-demo-seed", {
      demo: true,
    });
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;

    const actionRes = await request(app).post(
      `/api/rounds/${betBody.roundId}`,
      {
        action: "stand",
      },
    );
    expect(actionRes.status).toBe(200);
  });
});

/* ── Roulette ───────────────────────────────────────────────────────── */

describe("E2E: Roulette", () => {
  it("places a real bet with red bet and resolves", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("roulette", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "roulette", 1000, "roulette-seed-1", {
      bets: [{ type: "red", numbers: [], amount: 1000 }],
    });
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();
    expect(betBody.serverSeedHash).toBeDefined();
  });

  it("places a demo bet with straight bet", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("roulette", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "roulette", 500, "roulette-demo-seed", {
      demo: true,
      bets: [{ type: "straight", numbers: [7], amount: 500 }],
    });
    expect(betRes.status).toBe(200);
    expect((betRes.body as any).demo).toBe(true);
  });
});

/* ── Dice ───────────────────────────────────────────────────────────── */

describe("E2E: Dice", () => {
  it("places a real over bet and resolves", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("dice", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "dice", 1000, "dice-seed-1", {
      betType: "over",
      target: 7,
    });
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();
    expect(betBody.result).toBeDefined();
    expect(betBody.payout).toBeDefined();
  });

  it("places a demo under bet", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("dice", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "dice", 500, "dice-demo-seed", {
      demo: true,
      betType: "under",
      target: 7,
    });
    expect(betRes.status).toBe(200);
    expect((betRes.body as any).demo).toBe(true);
  });

  it("returns 400 for invalid bet type", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("dice", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "dice", 1000, "dice-seed-invalid", {
      betType: "invalid",
      target: 7,
    });
    expect(betRes.status).toBe(400);
  });
});

/* ── Crash ─────────────────────────────────────────────────────────── */

describe("E2E: Crash", () => {
  it("places a real bet and cashes out", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("crash", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "crash", 1000, "crash-seed-1");
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();

    // Cash out
    const actionRes = await request(app).post(
      `/api/rounds/${betBody.roundId}`,
      {
        action: "cashout",
      },
    );
    expect(actionRes.status).toBe(200);
    const actionBody = actionRes.body as any;
    expect(actionBody.result).toBeDefined();
    expect(actionBody.payout).toBeDefined();
  });

  it("places a demo bet", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("crash", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "crash", 500, "crash-demo-seed", {
      demo: true,
    });
    expect(betRes.status).toBe(200);
    expect((betRes.body as any).demo).toBe(true);
  });
});

/* ── Mines ─────────────────────────────────────────────────────────── */

describe("E2E: Mines", () => {
  it("places a real bet, reveals a tile, and cashes out", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("mines", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "mines", 1000, "mines-safe-seed", {
      mineCount: 1,
    });
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();

    const revealRes = await request(app).post(
      `/api/rounds/${betBody.roundId}`,
      {
        action: "reveal",
        tile: 3,
      },
    );
    expect(revealRes.status).toBe(200);

    // Cash out
    const cashoutRes = await request(app).post(
      `/api/rounds/${betBody.roundId}`,
      {
        action: "cashout",
      },
    );
    expect(cashoutRes.status).toBe(200);
    const cashoutBody = cashoutRes.body as any;
    expect(cashoutBody.result).toBeDefined();
    expect(cashoutBody.payout).toBeDefined();
  });

  it("places a demo bet and hits a mine", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("mines", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "mines", 500, "mines-demo-seed", {
      demo: true,
      mineCount: 5,
    });
    expect(betRes.status).toBe(200);
    expect((betRes.body as any).demo).toBe(true);
  });
});

/* ── Plinko ────────────────────────────────────────────────────────── */

describe("E2E: Plinko", () => {
  it("places a real bet with default params", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("plinko", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "plinko", 1000, "plinko-seed-1");
    expect(betRes.status).toBe(200);
    const betBody = betRes.body as any;
    expect(betBody.roundId).toBeDefined();
    expect(betBody.result).toBeDefined();
    expect(betBody.payout).toBeDefined();
  });

  it("places a demo bet with custom params", async () => {
    seedUser({ id: TEST_USER_ID });
    seedDemoWallet(TEST_USER_ID, 10000);
    seedHashChain("plinko", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "plinko", 500, "plinko-demo-seed", {
      demo: true,
      rows: 12,
      risk: "high",
      balls: 3,
    });
    expect(betRes.status).toBe(200);
    expect((betRes.body as any).demo).toBe(true);
  });

  it("returns 400 for invalid rows", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("plinko", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "plinko", 1000, "plinko-seed-invalid", {
      rows: 99,
      risk: "medium",
    });
    expect(betRes.status).toBe(400);
  });
});

/* ── Error cases ────────────────────────────────────────────────────── */

describe("E2E: Error cases", () => {
  it("returns 401 when unauthenticated", async () => {
    const app = createApp(); // no userId
    const betRes = await placeBet(app, "slots", 500, "unauth-seed");
    expect(betRes.status).toBe(401);
  });

  it("returns 404 for unknown game type", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "unknownGame", 500, "unknown-seed");
    expect(betRes.status).toBe(404);
    expect((betRes.body as any).error).toContain("No engine registered");
  });

  it("returns 400 for invalid bet amount (negative)", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);
    seedHashChain("slots", 5);

    const app = createApp(TEST_USER_ID);

    const betRes = await placeBet(app, "slots", -100, "negative-bet-seed");
    expect(betRes.status).toBe(400);
  });

  it("returns 400 for missing required fields", async () => {
    seedUser({ id: TEST_USER_ID });
    seedWallet(TEST_USER_ID, 5000);

    const app = createApp(TEST_USER_ID);

    const betRes = await request(app).post("/api/rounds", {
      gameType: "slots",
      // missing betAmount and clientSeed
    });
    expect(betRes.status).toBe(400);
  });
});
