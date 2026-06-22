import type { APIContext } from "astro";
import { describe, it, expect } from "vitest";
import { GET as healthHandler } from "@/pages/api/health";
import { POST as depositHandler } from "@/pages/api/deposit";

// Minimal Astro APIContext mock — only the fields the handlers use.
function makeApiContext(body?: unknown, extraHeaders?: Record<string, string>) {
  const headers = new Headers({
    "content-type": "application/json",
    ...extraHeaders,
  });

  const request = new Request("http://localhost:3000/api/deposit", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // The deposit handler only destructures { request } from the context.
  return { request } as unknown as APIContext;
}

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const response = await healthHandler({} as APIContext);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  it("includes uptime as a number", async () => {
    const response = await healthHandler({} as APIContext);
    const data = await response.json();
    expect(typeof data.uptime).toBe("number");
    expect(data.uptime).toBeGreaterThanOrEqual(0);
  });

  it("includes memory stats with expected keys", async () => {
    const response = await healthHandler({} as APIContext);
    const data = await response.json();
    expect(data.memory).toBeDefined();
    expect(data.memory).toHaveProperty("rss");
    expect(data.memory).toHaveProperty("heapUsed");
    expect(data.memory).toHaveProperty("heapTotal");
  });

  it("includes a valid ISO timestamp", async () => {
    const response = await healthHandler({} as APIContext);
    const data = await response.json();
    expect(data.timestamp).toBeDefined();
    expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);
  });

  it("includes version field", async () => {
    const response = await healthHandler({} as APIContext);
    const data = await response.json();
    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe("string");
  });

  it("sets content-type to application/json", async () => {
    const response = await healthHandler({} as APIContext);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});

describe("POST /api/deposit", () => {
  it("returns 200 for valid deposit request", async () => {
    const ctx = makeApiContext({ amount: 2500, method: "card" });
    const response = await depositHandler(ctx);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.amount).toBe(2500);
    expect(data.method).toBe("card");
    expect(data.transactionId).toBeDefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const request = new Request("http://localhost:3000/api/deposit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json{{{",
    });
    const response = await depositHandler({ request } as APIContext);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Invalid JSON body");
  });

  it("returns 400 for amount below minimum", async () => {
    const ctx = makeApiContext({ amount: 100, method: "card" });
    const response = await depositHandler(ctx);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
    expect(data.details.length).toBeGreaterThan(0);
  });

  it("returns 400 for invalid deposit method", async () => {
    const ctx = makeApiContext({ amount: 2500, method: "paypal" });
    const response = await depositHandler(ctx);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Validation failed");
  });

  it("returns 400 for missing fields", async () => {
    const ctx = makeApiContext({ amount: 2500 });
    const response = await depositHandler(ctx);
    expect(response.status).toBe(400);
  });

  it("accepts all valid deposit methods", async () => {
    for (const method of ["card", "crypto", "bank"]) {
      const ctx = makeApiContext({ amount: 2500, method });
      const response = await depositHandler(ctx);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.method).toBe(method);
    }
  });

  it("returns a transaction ID with txn- prefix", async () => {
    const ctx = makeApiContext({ amount: 5000, method: "crypto" });
    const response = await depositHandler(ctx);
    const data = await response.json();
    expect(data.transactionId).toMatch(/^txn-/);
  });

  it("sets content-type to application/json", async () => {
    const ctx = makeApiContext({ amount: 2500, method: "card" });
    const response = await depositHandler(ctx);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
