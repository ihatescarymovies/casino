/**
 * Promotion-related helper utilities.
 */

export function isPromotionExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

export function formatBonusAmount(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}
