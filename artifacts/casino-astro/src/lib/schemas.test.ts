import { describe, it, expect } from "vitest";
import {
  checkoutRequestSchema,
  depositMethodSchema,
  gameIdParamSchema,
  healthCheckQuerySchema,
  paginationSchema,
  validateWithSchema,
} from "./schemas";

describe("depositMethodSchema", () => {
  it("accepts valid methods", () => {
    expect(depositMethodSchema.parse("card")).toBe("card");
    expect(depositMethodSchema.parse("crypto")).toBe("crypto");
    expect(depositMethodSchema.parse("bank")).toBe("bank");
  });

  it("rejects invalid methods", () => {
    const result = depositMethodSchema.safeParse("wire");
    expect(result.success).toBe(false);
  });
});

describe("checkoutRequestSchema", () => {
  it("accepts valid checkout request", () => {
    const result = checkoutRequestSchema.safeParse({
      amount: 2500,
      method: "card",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ amount: 2500, method: "card" });
    }
  });

  it("rejects amount below minimum ($5 = 500 cents)", () => {
    const result = checkoutRequestSchema.safeParse({
      amount: 499,
      method: "card",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount above maximum ($10,000 = 1,000,000 cents)", () => {
    const result = checkoutRequestSchema.safeParse({
      amount: 1_000_001,
      method: "card",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer amounts", () => {
    const result = checkoutRequestSchema.safeParse({
      amount: 25.5,
      method: "card",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid deposit method", () => {
    const result = checkoutRequestSchema.safeParse({
      amount: 2500,
      method: "paypal",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = checkoutRequestSchema.safeParse({ amount: 2500 });
    expect(result.success).toBe(false);
  });

  it("accepts boundary values", () => {
    const min = checkoutRequestSchema.safeParse({
      amount: 500,
      method: "crypto",
    });
    expect(min.success).toBe(true);

    const max = checkoutRequestSchema.safeParse({
      amount: 1_000_000,
      method: "bank",
    });
    expect(max.success).toBe(true);
  });
});

describe("gameIdParamSchema", () => {
  it("parses valid numeric string", () => {
    const result = gameIdParamSchema.safeParse({ id: "42" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
  });

  it("rejects non-numeric strings", () => {
    const result = gameIdParamSchema.safeParse({ id: "abc" });
    expect(result.success).toBe(false);
  });

  it("rejects negative numbers", () => {
    const result = gameIdParamSchema.safeParse({ id: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects zero", () => {
    const result = gameIdParamSchema.safeParse({ id: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects floating point strings", () => {
    const result = gameIdParamSchema.safeParse({ id: "3.14" });
    expect(result.success).toBe(false);
  });
});

describe("paginationSchema", () => {
  it("uses defaults for missing fields", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerces string inputs to numbers", () => {
    const result = paginationSchema.parse({ page: "3", limit: "50" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it("rejects page below 1", () => {
    const result = paginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects limit above 100", () => {
    const result = paginationSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer values", () => {
    const result = paginationSchema.safeParse({ page: 1.5, limit: 20 });
    expect(result.success).toBe(false);
  });
});

describe("healthCheckQuerySchema", () => {
  it("defaults to false when verbose is omitted", () => {
    const result = healthCheckQuerySchema.parse({});
    expect(result.verbose).toBe(false);
  });

  it("transforms verbose=true string to boolean true", () => {
    const result = healthCheckQuerySchema.parse({ verbose: "true" });
    expect(result.verbose).toBe(true);
  });

  it("transforms verbose=false string to boolean false", () => {
    const result = healthCheckQuerySchema.parse({ verbose: "false" });
    expect(result.verbose).toBe(false);
  });

  it("rejects invalid verbose values", () => {
    const result = healthCheckQuerySchema.safeParse({ verbose: "yes" });
    expect(result.success).toBe(false);
  });
});

describe("validateWithSchema", () => {
  it("returns success with data for valid input", () => {
    const result = validateWithSchema(checkoutRequestSchema, {
      amount: 1000,
      method: "card",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ amount: 1000, method: "card" });
    }
  });

  it("returns failure with error messages for invalid input", () => {
    const result = validateWithSchema(checkoutRequestSchema, {
      amount: 1,
      method: "invalid",
    });
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => /minimum/i.test(e))).toBe(true);
    }
  });

  it("handles completely wrong input types", () => {
    const result = validateWithSchema(checkoutRequestSchema, "not an object");
    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
