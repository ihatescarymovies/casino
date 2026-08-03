# PayRam Headless Setup Runbook

**Charter & Oak Casino** — Headless PayRam provisioning on cloud VPS.
**Status**: Provisioned & smoke-tested (2026-08-03). Soft launch: <100 txns/day.

---

## Architecture

```
Player → Caddy (443) → Astro (4321)
                   ↘ PayRam (8080, Docker)
                          ↘ webhook → Caddy /casino-api/* → API server (3000) /api/payments/payram-webhook
```

| Service    | Port   | Owner                        |
| ---------- | ------ | ---------------------------- |
| Astro SSR  | 4321   | systemd casino-astro.service |
| API server | 3000   | systemd casino-api.service   |
| PayRam     | 8080   | Docker container `payram`    |
| Caddy      | 80/443 | systemd caddy.service        |

---

## 1. Provision PayRam (Docker)

Single-tenant headless deploy. Containerized Go binary + Next.js dashboard + Postgres 17 + Redis + nginx + supervisor.

```bash
# Data dir (persistent, mounted into container)
mkdir -p /home/vivi/.payram-core/{db,log,uploads}

# Run PayRam container
docker run -d \
  --name payram \
  --restart unless-stopped \
  -p 8080:80 \
  -v /home/vivi/.payram-core:/root/payram \
  payramapp/payram:3.5.2

# Verify
docker ps | grep payram
curl -fsS http://localhost:8080/api/v1/health || true
```

**Container internals**: Go binary `/payram`, Next.js dashboard v16.2.6, Postgres 17, Redis, nginx, supervisor. All state lives under `/root/payram` (mounted to `/home/vivi/.payram-core`). No `config.env` file required — secrets live in the embedded Postgres.

**Upgrade**: Pull new tag, `docker stop payram && docker rm payram`, re-run with same `-v` mount. DB persists across container recreations.

---

## 2. Caddy Reverse Proxy

Two routes: PayRam dashboard/API (`payram.timewarper.me`) and casino API webhook passthrough (`/casino-api/*`).

`/etc/caddy/Caddyfile`:

```caddy
payram.timewarper.me {
  handle /casino-api/* {
    uri strip_prefix /casino-api
    reverse_proxy localhost:3000
  }
  handle {
    reverse_proxy localhost:8080
  }
}

casino.timewarper.me {
  reverse_proxy localhost:4321
}
```

`/casino-api/*` lets PayRam webhooks reach the casino API server at the same hostname that PayRam already trusts (same-origin). Caddy strips the prefix, so `https://payram.timewarper.me/casino-api/api/payments/payram-webhook` → `localhost:3000/api/payments/payram-webhook`.

```bash
sudo systemctl reload caddy
```

---

## 3. PayRam Dashboard — Platform + Webhook

Performed once via PayRam dashboard (`https://payram.timewarper.me`). DB-backed; no on-disk config file.

1. Sign in to dashboard as admin.
2. **External Platforms** → create:
   - Name: `Charter & Oak Casino`
   - Website: `https://casino.timewarper.me`
   - Success endpoint: `https://casino.timewarper.me/cashier`
   - Cancel endpoint: `https://casino.timewarper.me/cashier`
3. Generate an API key for the platform → `cko_live_...` (this is both `PAYRAM_API_KEY` and `PAYRAM_WEBHOOK_SECRET`).
4. **Webhooks** → create:
   - Name: `Casino Webhook`
   - URL: `https://payram.timewarper.me/casino-api/api/payments/payram-webhook`
   - Access key: same `cko_live_...` value
   - Status: `active`

**Verify via psql inside container**:

```bash
docker exec -it payram psql -U payram -d payram -c \
  "SELECT id, name, url, status, tested FROM webhooks WHERE external_platform_id=2;"
docker exec -it payram psql -U payram -d payram -c \
  "SELECT id, name, website, success_endpoint FROM external_platforms WHERE id=2;"
```

---

## 4. Casino `.env`

Append to `/home/vivi/casino/.env`:

```bash
PAYRAM_API_URL=https://payram.timewarper.me
PAYRAM_API_KEY=cko_live_<value>
PAYRAM_PROJECT_ID=2
PAYRAM_WEBHOOK_SECRET=cko_live_<value>  # same as PAYRAM_API_KEY (webhook access_key)
```

**Notes**:

- `PAYRAM_WEBHOOK_SECRET` equals `PAYRAM_API_KEY` — PayRam's per-platform access key is used for both request auth and webhook verification. There is no separate `webhook_secret` column.
- MCP `payram_*` tools expect `PAYRAM_BASE_URL` (not `PAYRAM_API_URL`) and `PAYRAM_ACCESS_TOKEN` (admin JWT). For agent-driven ops, symlink env or pass explicitly.

Restart API server after env change:

```bash
sudo systemctl restart casino-api.service
```

---

## 5. Webhook Routing Verification

```
PayRam → POST https://payram.timewarper.me/casino-api/api/payments/payram-webhook
       → Caddy: strip /casino-api → localhost:3000/api/payments/payram-webhook
       → casino API (payments.ts:391) → webhookHandlers.processPayramWebhook
```

- Auth: `API-Key` header checked against `PAYRAM_API_KEY` via `verifyApiKey` from `payram` SDK. NOT HMAC-SHA256.
- Idempotency: handler skips if `payment_sessions.status` already `completed` or `partial`.
- Side effects on FILLED/OVER_FILLED: update `payment_sessions.status='completed'`, credit wallet (cents = `amount_usd * 100`), create `transactions` row, broadcast SSE.

---

## 6. Smoke Test

End-to-end webhook delivery test. **Real money — do not complete checkout unless prepared.**

```bash
# 1. Create test payment via PayRam API
RESP=$(curl -fsS -X POST https://payram.timewarper.me/api/v1/payment \
  -H "API-Key: $PAYRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amountInUSD": 10, "customerID": "smoke-test", "customerEmail": "smoke@example.com"}')
REFERENCE_ID=$(echo "$RESP" | jq -r .reference_id)
echo "Reference: $REFERENCE_ID"

# 2. Seed payment_sessions row in casino DB (user_id=NULL for dry run)
psql "$DATABASE_URL" -c \
  "INSERT INTO payment_sessions (reference_id, user_id, amount_usd, status) \
   VALUES ('$REFERENCE_ID', NULL, 10.00, 'open');"

# 3. Simulate webhook (FILLED status) — PayRam → casino API
curl -fsS -X POST http://localhost:3000/api/payments/payram-webhook \
  -H "API-Key: $PAYRAM_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"reference_id\":\"$REFERENCE_ID\",\"status\":\"FILLED\",\"amount\":10,\"currency\":\"USDC\"}"

# 4. Verify status flipped
psql "$DATABASE_URL" -c \
  "SELECT status, amount_usd, filled_amount, filled_currency FROM payment_sessions \
   WHERE reference_id='$REFERENCE_ID';"
# Expected: status=completed, filled_amount=10, filled_currency=USDC

# 5. Verify in PayRam DB
docker exec -it payram psql -U payram -d payram -c \
  "SELECT tested FROM webhooks WHERE external_platform_id=2;"
# Expected: tested=true (flips after PayRam itself emits a webhook, not just a mock)
```

**API server logs** should show:

```
Webhook received
PayRam webhook received (amount=10, currency=USDC)
Payment marked as completed
PayRam webhook processed
Webhook processed
```

---

## 7. Operations

### Restart PayRam

```bash
docker restart payram
```

### Logs

```bash
# PayRam
docker logs -f payram

# Casino API
sudo journalctl -u casino-api.service -f

# Casino Astro
sudo journalctl -u casino-astro.service -f
```

### Backup

```bash
# PayRam state (Postgres + uploads)
docker exec payram pg_dump -U payram payram > payram-$(date +%F).sql
tar czf payram-uploads-$(date +%F).tgz /home/vivi/.payram-core/uploads
```

### Token rotation

`PAYRAM_API_KEY` = platform access key. Rotate via PayRam dashboard → regenerate key → update both `PAYRAM_API_KEY` and `PAYRAM_WEBHOOK_SECRET` in `.env` → restart `casino-api.service` → update `webhooks.access_key` row in PayRam DB. Manual, ~30-day cadence per soft-launch policy.

---

## 8. Troubleshooting

| Symptom                                  | Check                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `MODULE_NOT_FOUND: @opentelemetry/api`   | Rebuild api-server — `@opentelemetry/api` is bundled by esbuild, not externalized.                                      |
| Webhook 401                              | `API-Key` header missing or mismatched against `PAYRAM_API_KEY`.                                                        |
| Webhook 404                              | Caddy `/casino-api/*` not stripping prefix, or api-server down on 3000.                                                 |
| Payment stuck `open`                     | `payment_sessions` row missing — handler no-ops without existing record.                                                |
| `webhooks.tested=false`                  | PayRam has not yet emitted a real webhook. Trigger a real checkout.                                                     |
| `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` | Pre-existing lockfile policy issue. Run `pnpm install` after cutoff passes, or bump `minimumReleaseAge: 0` temporarily. |

---

## Status

- [x] PayRam container provisioned
- [x] Caddy reverse proxy configured
- [x] Platform + webhook registered in PayRam DB
- [x] `.env` populated (4 vars)
- [x] Webhook routing verified end-to-end
- [x] Smoke test passed (2026-08-03)
- [x] API server build fixed (`@opentelemetry/api` bundled)
- [x] Payments e2e tests aligned with Zod validation shape
- [ ] Production readiness pass (security audit, load test, monitoring)
