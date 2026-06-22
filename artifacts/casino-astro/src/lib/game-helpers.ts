/**
 * Game-related helper utilities.
 */

import type { Game } from "@workspace/api-client-react";

import slotsImg from "@/assets/slots.png";
import blackjackImg from "@/assets/blackjack.png";
import rouletteImg from "@/assets/roulette.png";
import pokerImg from "@/assets/poker.png";
import sportsImg from "@/assets/sports.png";
import liveImg from "@/assets/live-dealer.png";

export function getGameFallbackImage(category?: string): string {
  const img = (() => {
    switch (category?.toLowerCase()) {
      case "blackjack":
        return blackjackImg;
      case "roulette":
        return rouletteImg;
      case "poker":
        return pokerImg;
      case "sports":
        return sportsImg;
      case "live":
        return liveImg;
      case "slots":
      default:
        return slotsImg;
    }
  })();
  return typeof img === "string" ? img : img.src;
}

export function filterGamesByCategory(games: Game[], category: string): Game[] {
  if (category === "all") return games;
  return games.filter(
    (game) => game.category.toLowerCase() === category.toLowerCase(),
  );
}

export function filterGamesBySearch(games: Game[], query: string): Game[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return games;
  return games.filter(
    (game) =>
      game.name.toLowerCase().includes(lowerQuery) ||
      game.provider.toLowerCase().includes(lowerQuery),
  );
}
