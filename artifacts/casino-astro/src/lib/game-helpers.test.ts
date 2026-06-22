import { describe, it, expect } from "vitest";
import { filterGamesByCategory, filterGamesBySearch } from "./game-helpers";

// Mock games matching the Game type shape
const games = [
  { id: 1, name: "Mega Slots", category: "slots", provider: "NetEnt" },
  {
    id: 2,
    name: "Blackjack Pro",
    category: "blackjack",
    provider: "Evolution",
  },
  {
    id: 3,
    name: "Roulette Royal",
    category: "roulette",
    provider: "Pragmatic",
  },
  { id: 4, name: "Poker Face", category: "poker", provider: "NetEnt" },
  { id: 5, name: "Sports Blitz", category: "sports", provider: "DraftKings" },
  { id: 6, name: "Live Dealer Gold", category: "live", provider: "Evolution" },
  { id: 7, name: "Diamond Slots", category: "slots", provider: "Microgaming" },
] as any;

describe("filterGamesByCategory", () => {
  it("returns all games for 'all' category", () => {
    expect(filterGamesByCategory(games, "all")).toHaveLength(7);
  });

  it("filters by exact category", () => {
    const result = filterGamesByCategory(games, "slots");
    expect(result).toHaveLength(2);
    expect(result.every((g: any) => g.category === "slots")).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = filterGamesByCategory(games, "BLACKJACK");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Blackjack Pro");
  });

  it("returns empty for non-existent category", () => {
    expect(filterGamesByCategory(games, "craps")).toHaveLength(0);
  });
});

describe("filterGamesBySearch", () => {
  it("returns all games for empty query", () => {
    expect(filterGamesBySearch(games, "")).toHaveLength(7);
  });

  it("returns all games for whitespace query", () => {
    expect(filterGamesBySearch(games, "   ")).toHaveLength(7);
  });

  it("searches game names (case-insensitive)", () => {
    const result = filterGamesBySearch(games, "slots");
    expect(result).toHaveLength(2); // Mega Slots + Diamond Slots
  });

  it("searches provider names", () => {
    const result = filterGamesBySearch(games, "evolution");
    expect(result).toHaveLength(2); // Blackjack Pro + Live Dealer Gold
  });

  it("returns empty for no matches", () => {
    expect(filterGamesBySearch(games, "nonexistent")).toHaveLength(0);
  });
});
