import slotsImg from "@/assets/slots.png";
import blackjackImg from "@/assets/blackjack.png";
import rouletteImg from "@/assets/roulette.png";
import pokerImg from "@/assets/poker.png";
import sportsImg from "@/assets/sports.png";
import liveImg from "@/assets/live-dealer.png";

export function getGameFallbackImage(category?: string) {
  switch(category?.toLowerCase()) {
    case 'blackjack': return blackjackImg;
    case 'roulette': return rouletteImg;
    case 'poker': return pokerImg;
    case 'sports': return sportsImg;
    case 'live': return liveImg;
    case 'slots':
    default: return slotsImg;
  }
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
