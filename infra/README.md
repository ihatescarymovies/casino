# Casino Infrastructure — Prometheus & Grafana

Monitoring stack for the Charter & Oak Casino API server.

## Overview

- **Prometheus** scrapes `/metrics` from the API server every 15s
- **Grafana** dashboards visualize API health, payments, webhooks, and wallet activity
- **Alertmanager** rules fire on payment failures, webhook errors, latency spikes, and downtime

## Quick Start (Docker Compose)

```bash
docker compose up -d
```

This starts Prometheus (`:9090`) and Grafana (`:3001`).

## Docker Compose Example

```yaml
version: "3.8"
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alerts.yml:/etc/prometheus/alerts.yml
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--web.enable-lifecycle"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/dashboards/casino-overview.json
```

## Metrics Exposed

The API server exposes the following metrics at `GET /metrics`:

| Metric                              | Type      | Labels                     | Description                         |
| ----------------------------------- | --------- | -------------------------- | ----------------------------------- |
| `http_requests_total`               | Counter   | method, route, status_code | Total HTTP requests                 |
| `http_request_duration_seconds`     | Histogram | method, route, status_code | Request latency distribution        |
| `payment_creations_total`           | Counter   | package_id, status         | Payment checkout sessions created   |
| `webhook_deliveries_total`          | Counter   | status, result             | PayRam webhook deliveries processed |
| `webhook_delivery_duration_seconds` | Histogram | status                     | Webhook processing duration         |
| `wallet_credits_total`              | Counter   | status                     | Wallet credit operations            |
| `sse_broadcasts_total`              | Counter   | event_type                 | SSE events broadcast to clients     |

## Alert Rules

| Alert                  | Condition                     | Severity |
| ---------------------- | ----------------------------- | -------- |
| HighPaymentFailureRate | Failure rate > 15% for 10m    | warning  |
| HighWebhookFailureRate | Webhook failure > 10% for 10m | warning  |
| HighLatencyP95         | P95 latency > 2s for 10m      | warning  |
| ServiceDown            | Target unreachable for 1m     | critical |

## Configuration

- `prometheus.yml` — Scrape configuration (target: `api-server:3000`)
- `alerts.yml` — Alerting rules
- `grafana/dashboards/casino-overview.json` — Pre-built dashboard

### Adjusting scrape target

If the API server runs on a different host/port, edit `prometheus.yml`:

```yaml
static_configs:
  - targets: ["your-api-host:3000"]
```

### Adding Grafana data source

After launching Grafana, add Prometheus as a data source:

1. Navigate to **Configuration → Data Sources**
2. Add Prometheus with URL `http://prometheus:9090`
3. Import the dashboard from **Dashboards → Import** or it loads automatically if volume-mounted
