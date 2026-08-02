import { Payram } from "payram";

/**
 * Lazily construct the PayRam SDK client.
 *
 * Reads `PAYRAM_API_URL` (NOT `PAYRAM_BASE_URL`) per the project convention
 * documented in `.env.example`, `README.md`, and `AGENTS.md`.
 *
 * `PAYRAM_PROJECT_ID` is passed through if the SDK accepts it (per the
 * published `payram` package signature); otherwise downstream code passes it
 * at the `initiatePayment` call site.
 */
export function getPayramClient(): Payram {
  const apiKey = process.env.PAYRAM_API_KEY;
  const apiUrl = process.env.PAYRAM_API_URL;
  const projectId = process.env.PAYRAM_PROJECT_ID;

  if (!apiKey || !apiUrl) {
    throw new Error(
      "PAYRAM_API_KEY and PAYRAM_API_URL environment variables are required.",
    );
  }

  const isHttp = apiUrl.startsWith("http://");

  const config: {
    apiKey: string;
    baseUrl: string;
    projectId?: string;
    config?: { allowInsecureHttp?: boolean };
  } = {
    apiKey,
    baseUrl: apiUrl,
  };

  if (projectId) {
    config.projectId = projectId;
  }

  if (isHttp) {
    config.config = { allowInsecureHttp: true };
  }

  return new Payram(config);
}
