import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate, formatTimeAgo } from "./formatters";

describe("formatCurrency", () => {
  it("formats whole dollars", () => {
    expect(formatCurrency(1000)).toBe("$1,000");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0");
  });

  it("formats negative amounts", () => {
    expect(formatCurrency(-50)).toBe("-$50");
  });

  it("formats large amounts with commas", () => {
    expect(formatCurrency(1234567)).toBe("$1,234,567");
  });

  it("truncates cents to whole dollars", () => {
    expect(formatCurrency(99.99)).toBe("$100");
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    const result = formatDate("2025-01-15");
    expect(result).toContain("January");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2025-06-01"));
    expect(result).toContain("June");
    expect(result).toContain("2025");
  });
});

describe("formatTimeAgo", () => {
  it("returns 'Just now' for less than 1 minute ago", () => {
    const now = new Date();
    expect(formatTimeAgo(now.toISOString())).toBe("Just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000);
    expect(formatTimeAgo(fiveMinAgo.toISOString())).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
    expect(formatTimeAgo(twoHoursAgo.toISOString())).toBe("2h ago");
  });

  it("returns days ago", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    expect(formatTimeAgo(threeDaysAgo.toISOString())).toBe("3d ago");
  });

  it("returns formatted date for older than 7 days", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
    const result = formatTimeAgo(twoWeeksAgo.toISOString());
    // Should return a date string, not Xd ago
    expect(result).not.toMatch(/\d+d ago/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts Date objects", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000);
    expect(formatTimeAgo(fiveMinAgo)).toBe("5m ago");
  });
});
