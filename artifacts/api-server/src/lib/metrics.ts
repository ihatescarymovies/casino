import { Counter, Histogram, register } from "prom-client";

const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

const httpRequestDurationSeconds = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const paymentCreationsTotal = new Counter({
  name: "payment_creations_total",
  help: "Total payment checkout sessions created",
  labelNames: ["package_id", "status"],
});

const webhookDeliveriesTotal = new Counter({
  name: "webhook_deliveries_total",
  help: "Total PayRam webhook deliveries processed",
  labelNames: ["status", "result"],
});

const webhookDeliveryDurationSeconds = new Histogram({
  name: "webhook_delivery_duration_seconds",
  help: "Webhook processing duration in seconds",
  labelNames: ["status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const walletCreditsTotal = new Counter({
  name: "wallet_credits_total",
  help: "Total wallet credit operations for deposits",
  labelNames: ["status"],
});

const sseBroadcastsTotal = new Counter({
  name: "sse_broadcasts_total",
  help: "Total SSE event broadcasts",
  labelNames: ["event_type"],
});

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSec: number,
): void {
  httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
  httpRequestDurationSeconds.observe({ method, route }, durationSec);
}

export function recordWebhook(
  status: string,
  result: "success" | "retry" | "failed",
  durationSec: number,
): void {
  webhookDeliveriesTotal.inc({ status, result });
  webhookDeliveryDurationSeconds.observe({ status }, durationSec);
}

export function recordPaymentCreation(
  packageId: string,
  status: "success" | "failed",
): void {
  paymentCreationsTotal.inc({ package_id: packageId, status });
}

export function recordWalletCredit(status: "success" | "failed"): void {
  walletCreditsTotal.inc({ status });
}

export function recordSseBroadcast(eventType: string): void {
  sseBroadcastsTotal.inc({ event_type: eventType });
}

export { register };
