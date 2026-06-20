import { Payram } from "payram";

export function getPayramClient(): Payram {
  const apiKey = process.env.PAYRAM_API_KEY;
  const baseUrl = process.env.PAYRAM_BASE_URL;

  if (!apiKey || !baseUrl) {
    throw new Error(
      "PAYRAM_API_KEY and PAYRAM_BASE_URL environment variables are required."
    );
  }

  return new Payram({ apiKey, baseUrl });
}
