import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import express from "express";
import { request } from "./helpers";

/* ── Mock @workspace/db BEFORE importing routes ─────────────────────── */

const paymentSessions = vi.hoisted(() => ({ current: [] as any[] }));

/* ── Mock payramClient ──────────────────────────────────────────────── */

const payramMocks = vi.hoisted(() => ({
  initiatePayment: vi.fn(async (args: any) => ({
    reference_id: `ref-${args.customerId}-${args.amountInUSD}`,
    url: `https://payram.test/payments?reference_id=ref-${args.customerId}-${args.amountInUSD}`,
    host: "https://payram.test",
  })),
}));

vi.mock("../../lib/payramClient", () => ({
  getPayramClient: vi.fn(() => ({
    payments: {
      initiatePayment: payramMocks.initiatePayment,
      getPaymentRequest: vi.fn(),
    },
  })),
}));

/* ── Mock webhookHandlers ───────────────────────────────────────────── */

const webhookMocks = vi.hoisted(() => ({
  verifyWebhookApiKey: vi.fn(() => true),
  processPayramWebhook: vi.fn(async () => undefined),
}));

vi.mock("../../lib/webhookHandlers", () => ({
  WebhookHandlers: {
    verifyWebhookApiKey: webhookMocks.verifyWebhookApiKey,
    processPayramWebhook: webhookMocks.processPayramWebhook,
  },
}));

/* ── Imports after mocks ───────────────────────────────────────────── */

import paymentsRouter from "../../routes/payments";
import { errorHandler } from "../../middleware/errorHandler";
import { db } from "@workspace/db";

beforeAll(async () => {
  const mockedDb = db as any;
  mockedDb.execute = vi.fn(async (sqlTag: any) => {
    const chunks = sqlTag?.queryChunks ?? [];
    let sqlText = "";
    const params: any[] = [];
    for (const chunk of chunks) {
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        sqlText += chunk.value.join("?");
      } else {
        sqlText += "?";
        params.push(chunk);
      }
    }
    const upper = sqlText.toUpperCase();
    if (upper.includes("INSERT INTO PAYMENT_SESSIONS")) {
      const row = {
        reference_id: params[0],
        invoice_id: params[1],
        user_id: params[2] ?? null,
        amount_usd: params[3],
        status: "open",
        created_at: new Date(),
        updated_at: new Date(),
      };
      if (
        !paymentSessions.current.find(
          (r: any) => r.reference_id === row.reference_id,
        )
      ) {
        paymentSessions.current.push(row);
      }
      return { rows: [] };
    }
    if (upper.includes("SELECT") && upper.includes("PAYMENT_SESSIONS")) {
      if (upper.includes("ORDER BY") && upper.includes("DESC")) {
        const userId = params[0];
        return {
          rows: paymentSessions.current
            .filter((r: any) => r.user_id === userId)
            .sort(
              (a: any, b: any) =>
                b.created_at.getTime() - a.created_at.getTime(),
            )
            .slice(0, 20)
            .map((r: any) => ({
              reference_id: r.reference_id,
              amount_usd: r.amount_usd,
              status: r.status,
              filled_amount: r.filled_amount ?? null,
              filled_currency: r.filled_currency ?? null,
              created_at: r.created_at,
            })),
        };
      }
      const refId = params[0];
      const userId = params[1];
      const row = paymentSessions.current.find(
        (r: any) =>
          r.reference_id === refId &&
          (r.user_id === userId || r.user_id === null),
      );
      return {
        rows: row
          ? [
              {
                reference_id: row.reference_id,
                status: row.status,
                filled_amount: row.filled_amount ?? null,
                filled_currency: row.filled_currency ?? null,
                amount_usd: row.amount_usd,
                updated_at: row.updated_at,
              },
            ]
          : [],
      };
    }
    return { rows: [] };
  });
});

/* ── App factory ────────────────────────────────────────────────────── */

function createApp(userId?: string, role?: string) {
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
        role: role ?? "user",
      };
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    next();
  });
  app.use("/api/payments", paymentsRouter);
  app.use(errorHandler);
  return app;
}

/* ── Tests ─────────────────────────────────────────────────────────── */

describe("GET /api/payments/deposit-packages", () => {
  it("returns 200 with 6 packages including min-deposit and standard", async () => {
    const app = createApp();
    const res = await request(app).get("/api/payments/deposit-packages");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body as any)).toBe(true);
    expect(res.body as any).toHaveLength(6);

    // min-deposit should be first, $10 (1000 cents)
    expect((res.body as any)[0].id).toBe("min-deposit");
    expect((res.body as any)[0].prices[0].unitAmount).toBe(1000);

    // standard should be at index 2, $50 (5000 cents)
    expect((res.body as any)[2].id).toBe("standard");
    expect((res.body as any)[2].prices[0].unitAmount).toBe(5000);

    // Last should be vip ($500 = 50000 cents)
    expect((res.body as any)[5].id).toBe("vip");
    expect((res.body as any)[5].prices[0].unitAmount).toBe(50000);
  });

  it("works without authentication", async () => {
    const app = createApp(); // no userId = unauthenticated
    const res = await request(app).get("/api/payments/deposit-packages");
    expect(res.status).toBe(200);
  });
});

describe("POST /api/payments/checkout", () => {
  beforeEach(() => {
    paymentSessions.current = [];
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = createApp();
    const res = await request(app).post("/api/payments/checkout", {
      priceId: "starter",
    });
    expect(res.status).toBe(401);
    expect(res.body as any).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when priceId is missing", async () => {
    const app = createApp("user-1");
    const res = await request(app).post("/api/payments/checkout", {});
    expect(res.status).toBe(400);
    expect(res.body as any).toMatchObject({ error: "Validation failed" });
  });

  it("returns 400 for invalid priceId", async () => {
    const app = createApp("user-1");
    const res = await request(app).post("/api/payments/checkout", {
      priceId: "nonexistent",
    });
    expect(res.status).toBe(400);
    expect(res.body as any).toEqual({ error: "Invalid package" });
  });

  it("creates checkout and returns PayRam URL for valid priceId", async () => {
    const app = createApp("user-1");
    const res = await request(app).post("/api/payments/checkout", {
      priceId: "starter",
    });

    expect(res.status).toBe(200);
    expect(res.body as any).toHaveProperty("url");
    expect((res.body as any).url).toContain(
      "https://payram.test/payments?reference_id=",
    );
    expect(payramMocks.initiatePayment).toHaveBeenCalledWith({
      customerEmail: "test@example.com",
      customerId: "user-1",
      amountInUSD: 25,
    });
  });

  it("accepts min-deposit priceId ($10)", async () => {
    const app = createApp("user-1");
    const res = await request(app).post("/api/payments/checkout", {
      priceId: "min-deposit",
    });

    expect(res.status).toBe(200);
    expect(payramMocks.initiatePayment).toHaveBeenCalledWith({
      customerEmail: "test@example.com",
      customerId: "user-1",
      amountInUSD: 10,
    });
  });

  it("handles all package tiers correctly", async () => {
    const tiers = [
      { priceId: "starter", usd: 25 },
      { priceId: "pro", usd: 100 },
      { priceId: "elite", usd: 250 },
      { priceId: "vip", usd: 500 },
    ];

    for (const tier of tiers) {
      const app = createApp("user-1");
      const res = await request(app).post("/api/payments/checkout", {
        priceId: tier.priceId,
      });
      expect(res.status).toBe(200);
      expect(payramMocks.initiatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountInUSD: tier.usd }),
      );
    }
  });

  it("returns 500 when PayRam client throws", async () => {
    payramMocks.initiatePayment.mockRejectedValueOnce(new Error("PayRam down"));
    const app = createApp("user-1");
    const res = await request(app).post("/api/payments/checkout", {
      priceId: "starter",
    });
    expect(res.status).toBe(500);
    expect(res.body as any).toEqual({
      error: "Failed to create checkout session",
    });
  });
});

describe("POST /api/payments/shareable-link", () => {
  beforeEach(() => {
    paymentSessions.current = [];
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = createApp();
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: 50,
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const app = createApp("user-1", "user");
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: 50,
    });
    expect(res.status).toBe(403);
    expect(res.body as any).toEqual({ error: "Admin role required" });
  });

  it("returns 400 when amountInUSD is below minimum ($10)", async () => {
    const app = createApp("admin-1", "admin");
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: 5,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("10");
  });

  it("returns 400 when amountInUSD exceeds $10000", async () => {
    const app = createApp("admin-1", "admin");
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: 10001,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("10000");
  });

  it("returns 400 for non-numeric amount", async () => {
    const app = createApp("admin-1", "admin");
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: "abc",
    });
    expect(res.status).toBe(400);
  });

  it("creates shareable link for admin with valid amount", async () => {
    const app = createApp("admin-1", "admin");
    const res = await request(app).post("/api/payments/shareable-link", {
      amountInUSD: 50,
    });

    expect(res.status).toBe(200);
    expect(res.body as any).toHaveProperty("url");
    expect(res.body as any).toHaveProperty("reference_id");
    expect(payramMocks.initiatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        amountInUSD: 50,
        customerEmail: "shareable-link@casino.local",
      }),
    );
  });
});

describe("GET /api/payments/status/:referenceId", () => {
  beforeEach(() => {
    paymentSessions.current = [];
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = createApp();
    const res = await request(app).get("/api/payments/status/some-ref");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent reference", async () => {
    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/status/nonexistent-ref");
    expect(res.status).toBe(404);
    expect(res.body as any).toEqual({ error: "Session not found" });
  });

  it("returns session status for valid reference owned by user", async () => {
    // Seed a payment session
    paymentSessions.current.push({
      reference_id: "ref-123",
      user_id: "user-1",
      amount_usd: 25,
      status: "open",
      filled_amount: null,
      filled_currency: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/status/ref-123");

    expect(res.status).toBe(200);
    expect((res.body as any).reference_id).toBe("ref-123");
    expect((res.body as any).status).toBe("open");
  });

  it("returns session for shareable link (null user_id)", async () => {
    paymentSessions.current.push({
      reference_id: "ref-shared",
      user_id: null,
      amount_usd: 50,
      status: "open",
      filled_amount: null,
      filled_currency: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/status/ref-shared");

    expect(res.status).toBe(200);
    expect((res.body as any).reference_id).toBe("ref-shared");
  });
});

describe("GET /api/payments/history", () => {
  beforeEach(() => {
    paymentSessions.current = [];
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const app = createApp();
    const res = await request(app).get("/api/payments/history");
    expect(res.status).toBe(401);
  });

  it("returns empty array for user with no payments", async () => {
    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body as any)).toBe(true);
    expect(res.body as any).toHaveLength(0);
  });

  it("returns payment history for authenticated user", async () => {
    paymentSessions.current.push(
      {
        reference_id: "ref-1",
        user_id: "user-1",
        amount_usd: 25,
        status: "completed",
        filled_amount: "25",
        filled_currency: "USDC",
        created_at: new Date("2026-01-01"),
        updated_at: new Date(),
      },
      {
        reference_id: "ref-2",
        user_id: "user-1",
        amount_usd: 100,
        status: "open",
        filled_amount: null,
        filled_currency: null,
        created_at: new Date("2026-01-02"),
        updated_at: new Date(),
      },
    );

    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/history");

    expect(res.status).toBe(200);
    expect(res.body as any).toHaveLength(2);
    // Should be sorted by created_at DESC
    expect((res.body as any)[0].reference_id).toBe("ref-2");
    expect((res.body as any)[1].reference_id).toBe("ref-1");
  });

  it("only returns payments for the requesting user", async () => {
    paymentSessions.current.push(
      {
        reference_id: "ref-mine",
        user_id: "user-1",
        amount_usd: 25,
        status: "open",
        filled_amount: null,
        filled_currency: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        reference_id: "ref-other",
        user_id: "user-2",
        amount_usd: 50,
        status: "open",
        filled_amount: null,
        filled_currency: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    );

    const app = createApp("user-1");
    const res = await request(app).get("/api/payments/history");

    expect(res.status).toBe(200);
    expect(res.body as any).toHaveLength(1);
    expect((res.body as any)[0].reference_id).toBe("ref-mine");
  });
});

describe("POST /api/payments/payram-webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when API key verification fails", async () => {
    webhookMocks.verifyWebhookApiKey.mockReturnValueOnce(false);
    const app = createApp();
    const res = await request(app).post("/api/payments/payram-webhook", {
      reference_id: "test-ref",
      status: "FILLED",
    });
    expect(res.status).toBe(401);
    expect(res.body as any).toEqual({ error: "Invalid API key" });
  });

  it("returns 200 and processes webhook when API key is valid", async () => {
    const app = createApp();
    const res = await request(app).post("/api/payments/payram-webhook", {
      reference_id: "test-ref",
      status: "FILLED",
    });
    expect(res.status).toBe(200);
    expect(res.body as any).toEqual({ received: true });
    expect(webhookMocks.processPayramWebhook).toHaveBeenCalledWith({
      reference_id: "test-ref",
      status: "FILLED",
    });
  });

  it("returns 200 even for empty body", async () => {
    const app = createApp();
    const res = await request(app).post("/api/payments/payram-webhook", {});
    expect(res.status).toBe(200);
    expect(webhookMocks.processPayramWebhook).toHaveBeenCalledWith({});
  });

  it("returns 500 when webhook processing throws", async () => {
    webhookMocks.processPayramWebhook.mockRejectedValue(new Error("DB error"));
    const app = createApp();
    const res = await request(app).post("/api/payments/payram-webhook", {
      reference_id: "test-ref",
      status: "FILLED",
    });
    expect(res.status).toBe(500);
    expect(res.body as any).toEqual({ error: "Webhook processing error" });
  });
});
