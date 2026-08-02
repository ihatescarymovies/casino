# HANDOFF — PayRam Setup Continuation

## Objective

Finish PayRam integration so the casino app can call PayRam payments API.

## Context

- PayRam Docker container `payram` running (up 10h), version 3.5.2, mainnet
- Domain: `https://payram.timewarper.me`, SSL via Let's Encrypt
- DB: Neon Postgres `ep-jolly-art-axl0kyoz-pooler.c-4.us-east-2.aws.neon.tech:5432/neondb`, user `neondb_owner`, pw `npg_OHeJ3R6FPNuz`
- All workers RUNNING (per `/api/v1/health`)
- AES_KEY in `~/.payraminfo/config.env`
- Admin member: id=1, `admin@casino2.test` / password=`password` (bcrypt hash)
- External platform "casino2": id=1, role_id=4
- API key in DB: `payram_sk_test_abcdef123456` (SHA256 hash matches)
- JWT secrets in `configurations` table
- `~/.payraminfo/headless-tokens.env` does NOT exist yet (need to create)

## Goal

1. Obtain JWT access token for PAYRAM_API_KEY
2. Configure webhook secret
3. Populate `/home/vivi/casino/.env` with PayRam vars
4. Verify casino → PayRam end-to-end

## Required Env Vars (from .env.example)

```
PAYRAM_API_URL=https://payram.timewarper.me
PAYRAM_API_KEY=<JWT access token>
PAYRAM_PROJECT_ID=1
PAYRAM_WEBHOOK_SECRET=<from dashboard>
```

## Blockers & Findings

- `/api/v1/auth/login`, `/api/auth/login`, `/api/v1/login` all return 404
- Health endpoint: `/api/v1/health` → works, all workers RUNNING
- Go backend log shows `DecryptLegacyCFBHex` errors — API key stored plaintext, decrypt fails on hex parse
- Auth middleware tries to parse `Authorization` as JWT → "token contains an invalid number of segments"
- nginx forwards `Host/X-Real-IP/X-Forwarded-*` but not explicit Authorization header (default proxy_pass passes it through)
- `setup_payram_agents.sh signin` requires curl; curl not in container; host has curl
- NextAuth credentials signin endpoint returns 404

## Code Changes Already In Progress (uncommitted)

- `artifacts/api-server/src/lib/payramClient.ts`
- `artifacts/api-server/src/lib/webhookHandlers.ts`
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/casino-astro/src/components/islands/Cashier.tsx`
- `.env.example`

## Next Steps

1. **Discover the real login endpoint** — check Go binary routes or look at `/health` workers for clue. Try `/api/v1/auth/signin`, `/api/v1/sessions`, or check the bundled Next.js frontend for the auth route
2. **Get a session cookie via the Next.js UI** — `https://payram.timewarper.me/auth/signin` (NextAuth), capture cookies with `wget --save-cookies`
3. **Use session to call** `/api/v1/external-platform/details` — verify platform info
4. **Call PayRam API to mint a headless API key / JWT** — or set `PAYRAM_API_KEY` to a long-lived API key (the raw `payram_sk_test_abcdef123456`) if the Go backend accepts that for service-to-service auth. Note: the docs say JWT is required, but we should confirm
5. **Generate webhook secret** — via dashboard config or POST to configurations endpoint
6. **Patch `api_keys.key` column** to be properly hex-encrypted (or fix middleware to handle plaintext) — this unblocks auth
7. **Update `/home/vivi/casino/.env`** with all 4 vars
8. **Run `pnpm build` and smoke test** the Cashier island → payment flow

## Relevant Files

- `/home/vivi/casino/.env` — empty of PayRam vars
- `/home/vivi/casino/.env.example` — template
- `/home/vivi/.payraminfo/config.env` — payram install config
- `/home/vivi/.payraminfo/aes/` — AES key file
- `artifacts/api-server/src/lib/payramClient.ts` — client lib (in-progress)
- `artifacts/api-server/src/routes/payments.ts` — payment routes (in-progress)
- `artifacts/api-server/src/lib/webhookHandlers.ts` — webhook HMAC verify (in-progress)

## Verification Checklist

- [ ] PayRam `/api/v1/external-platform/details` returns 200 with valid auth
- [ ] Casino `/api/v1/payments/create` → PayRam creates payment link
- [ ] PayRam webhook → `/api/v1/webhooks/payram` → HMAC verified → DB updated
- [ ] Cashier UI shows deposit address / link from PayRam response
