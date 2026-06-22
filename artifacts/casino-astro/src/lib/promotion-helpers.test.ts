import { describe, it, expect } from "vitest";
import { isPromotionExpired, formatBonusAmount } from "./promotion-helpers";

describe("isPromotionExpired", () => {
  it("returns true for past dates", () => {
    expect(isPromotionExpired("2020-01-01")).toBe(true);
  });

  it("returns false for future dates", () => {
    const future = new Date(Date.now() + 86400000 * 365).toISOString();
    expect(isPromotionExpired(future)).toBe(false);
  });
});

describe("formatBonusAmount", () => {
  it("formats whole numbers", () => {
    expect(formatBonusAmount(500)).toBe("$500");
  });

  it("formats large numbers with commas", () => {
    expect(formatBonusAmount(10000)).toBe("$10,000");
  });

  it("formats zero", () => {
    expect(formatBonusAmount(0)).toBe("$0");
  });
});
