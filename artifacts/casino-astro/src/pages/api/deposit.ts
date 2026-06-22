import type { APIRoute } from "astro";
import { validateWithSchema, checkoutRequestSchema } from "@/lib/schemas";

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = validateWithSchema(checkoutRequestSchema, body);

  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: (result as { success: false; errors: string[] }).errors,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // In production this would call PayRam / payment processor.
  // For now return a mock success (no redirect URL).
  return new Response(
    JSON.stringify({
      success: true,
      amount: result.data.amount,
      method: result.data.method,
      transactionId: `txn-${Date.now()}`,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
