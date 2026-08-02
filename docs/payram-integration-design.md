# PayRam Headless Integration — Design Document

**Charter & Oak Casino** — PayRam Payment Gateway setup, bug fixes, and link delivery.
**Approach**: A — MCP-First, Security-Priority.
**Soft launch**: live real-player deposits, <100 transactions/day, manual token refresh.

---

## 1. Understanding Summary

- **What is being built**: Working headless PayRam integration covering (a) provisioning fresh PayRam instance on cloud VPS using `mcp.payram.com` guidance (added as MCP server), (b) bug fixes to existing api-server PayRam integration (env var mismatch, backend/frontend contract, webhook signature verification + idempotency), (c) producing shareable PayRam payment link(s) from Cashier flow and one-off admin route.
- **Why**: Existing code wires PayRam but has silent bugs (frontend payload ignored, env var mismatch, insecure webhook) and no live PayRam instance exists yet. Soft-launch needs real-player deposits.
- **Who**: Charter & Oak Casino operator — soft launch, real player deposits, low volume.
- **Key constraints**: Soft launch / low-volume (<100 txns/day); manual ACCESS_TOKEN refresh every ~30 days; PayRam signature verification mandatory on webhook; <500ms checkout response time (excluding PayRam upstream); YAGNI on auto-rotation, alerting, monitoring infra.
- **Explicit non-goals**: Auto-rotation of PayRam ACCESS_TOKEN; payment-link distribution UI; dashboarding/monitoring; refund/withdrawal flow changes; replacing hardcoded deposit packages with dynamic catalog; removing dead `deposit.ts` Astro route (out of scope unless blocks cashier link flow).

---

## 2. Assumptions

1. `mcp.payram.com` exposes MCP tools producing setup instructions/scripts/endpoint URLs for headless VPS provisioning — otherwise only docs/help, need different source for provisioning steps.
2. User has a PayRam account / can create one → instance can be provisioned. If not, provisioning blocked → scope collapses to code-fix-only (no live link).
3. Cloud VPS available and SSH-reachable from this environment, OR PayRam provisioning invoked entirely through `mcp.payram.com` tools without direct SSH. Will NOT run commands on VPS without explicit go-ahead.
4. `payram` npm package's `initiatePayment` signature is stable as used in `payments.ts`; if `mcp.payram.com` reveals different contract, the client call site is in scope to update.
5. PayRam emits signed webhooks (HMAC or JWT) per published API; existing unsigned `processPayramWebhook` must be replaced with signature-verified version. If PayRam doesn't support signing, fallback is IP allowlist + shared secret header — captured as a decision.
6. Standardize on `PAYRAM_API_URL` everywhere (matches .env.example, README, AGENTS.md). Update `payramClient.ts` to use it. `PAYRAM_PROJECT_ID` wired into client + `initiatePayment` call if `mcp.payram.com` confirms required.
7. "Sharing a payment link" = Cashier flow produces `data.url` and surfaces/shares it to the player. If "share" means more (e.g. shareable admin URL generator), that's a design fork to clarify in approaches. **Resolved**: both per-player + one-off admin-generated link.
8. `deposit.ts` Astro mock route is dead → left in place unless interferes with Cashier→api-server path. No rewrite in scope.

### Open Questions (to resolve during implementation)

1. Does `mcp.payram.com` actually expose MCP tools with concrete tool schemas, OR just a help/docs site? Determines whether setup guidance is MCP-tool-driven or web-research-driven. **Resolution path**: add server, call `list_mcp_resources/tools`, fallback to Approach B if docs-only.
2. User wants single shareable deposit link (one-off, e.g., soft-launch invite email) OR in-app Cashier path producing link per player (production flow)? **RESOLVED**: both (Q2=C).
3. Existing VPS for headless setup, OR does "provision on cloud VPS" include spinning one up first? **Resolution path**: clarify during provisioning step (MCP tools may answer directly).

---

## 3. Decision Log (D1-D10)

### D1. Scope: Fix bugs + provision headless

- **Decided**: Fix existing integration bugs (env mismatch, frontend/backend contract, webhook security) AND provision fresh PayRam instance on cloud VPS.
- **Alternatives**: (a) Code-fix only no provisioning; (b) Provision only defer bug fixes.
- **Why**: Both needed for soft launch — silent bugs corrupt real deposits; no live instance means no link works.

### D2. MCP: Add mcp.payram.com as MCP server + call tools

- **Decided**: Add mcp.payram.com as MCP server, discover real tools, use for provisioning + setup guidance.
- **Alternatives**: (a) Treat as docs-only (web research); (b) Skip MCP entirely (reconstruct from .env.example).
- **Why**: User explicitly requested mcp.payram.com usage; authoritative tool schemas eliminate guesswork.

### D3. On-Prem: Cloud VPS matching setup_payram.sh-on-VPS hint

- **Decided**: Provision PayRam instance on cloud VPS, matching .env.example mention of setup_payram.sh.
- **Alternatives**: (a) Local Docker; (b) PayRam SaaS hosting.
- **Why**: .env.example already explicitly mentions setup_payram.sh on VPS — project architecture already opts for this path.

### D4. NFRs: Security-first, manual token refresh, no auto-rotation

- **Decided**: Webhook signature verification mandatory; idempotent webhook; <500ms checkout (excluding PayRam upstream); documented token refresh runbook (no auto-rotation); soft launch <100 txns/day.
- **Alternatives**: (a) Auto-rotation of ACCESS_TOKEN; (b) Monitoring/alerting infra.
- **Why**: YAGNI for soft launch; manual refresh acceptable at low volume.

### D5. Approach: Approach A — MCP-First, Security-Priority

- **Decided**: Sequence — MCP integration first → provision instance → security-fix (webhook) → env var standardization → frontend/backend contract → remove unused invoiceId → deliver links.
- **Alternatives**: (a) Approach B Code-First MCP-Hybrid; (b) Approach C Script-Only (no MCP).
- **Why**: Security holes must close BEFORE any link goes live; live link validated end-to-end against real instance; MCP tools give authoritative setup steps.
- **Fallback**: If mcp.payram.com is docs-only (not real MCP tools), fall back to Approach B.

### D6. Link Delivery: Both per-player Cashier link AND one-off shareable link

- **Decided**: Deliver BOTH — per-player Cashier link (production flow) + one-off shareable link (marketing/soft-launch invites).
- **Alternatives**: (a) Per-player only; (b) One-off only.
- **Why**: User Q2=C (both); per-player serves production, one-off serves soft-launch onboarding.

### D7. Frontend/Backend Contract: Cashier sends {priceId}, min $10

- **Decided**: Update Cashier.tsx to send {priceId} matching payments.ts hardcoded packages; add $10 minimum (new package); backend authoritative.
- **Alternatives**: (a) Update payments.ts to accept {amount,method} from Cashier.tsx.
- **Why**: Backend-validated packages prevent amount tampering; lowest preset ($25) too high — user wants $10 floor.

### D8. Webhook Security: HMAC/JWT-signed POST, idempotent

- **Decided**: Convert to POST route; verify signature using PAYRAM_WEBHOOK_SECRET before any DB write; idempotency via ON CONFLICT or status check.
- **Alternatives**: (a) IP allowlist only; (b) Keep GET with query params.
- **Why**: Current unsigned webhook is critical security hole; PayRam supports signed webhooks per published API.

### D9. Env Var Standardization: PAYRAM_API_URL everywhere

- **Decided**: Standardize on PAYRAM_API_URL (matches .env.example/README/AGENTS.md); add PAYRAM_WEBHOOK_SECRET; PAYRAM_PROJECT_ID wired if MCP confirms.
- **Alternatives**: (a) Use PAYRAM_BASE_URL everywhere (current payramClient.ts).
- **Why**: Single source of truth; aligns with existing project documentation.

### D10. One-off Shareable Link: Server-side admin endpoint (Shape A)

- **Decided**: POST /api/payments/shareable-link admin-only auth, calls initiatePayment with fixed amount, persists to payment_sessions with user_id=NULL.
- **Alternatives**: (a) Shape B — PayRam dashboard UI manual generation.
- **Why**: Server-side keeps webhook→DB tracking uniform; dashboard would lose reference_id association.

---

## 4. Final Design — 7 Sections

### Section 1: MCP Integration + Provisioning Flow

- Add `mcp.payram.com` as MCP server in OpenCode config (`~/.config/opencode/config.json` MCP section, or repo `.opencode/`).
- Run `list_mcp_resources/tools` to discover what `mcp.payram.com` actually exposes.
- **Two outcomes (Q1)**:
  - Tools exist → Approach A: use tools to (a) provision fresh PayRam instance on cloud VPS, (b) fetch `PAYRAM_API_URL`, `PAYRAM_API_KEY` (30-day ACCESS_TOKEN), `PAYRAM_PROJECT_ID`, (c) obtain **webhook signing secret** needed in Section 2.
  - Docs only → fallback to Approach B (code-first via web research; provisioning deferred).
- **Q3 still open**: existing VPS SSH-reachable from env, OR provisioning entirely through `mcp.payram.com` tools without SSH. NO VPS shell commands without explicit user go-ahead.
- **Runbook artifact**: write `docs/payram-headless-setup.md` capturing exact steps (instance creation, token issuance, PROJECT_ID lookup, webhook secret rotation, token refresh cadence ~30 days). Satisfies maintenance NFR deliverable — no auto-rotation, human-readable runbook for manual refresh.
- **Output of this step**: live PayRam instance + 4 secrets (`PAYRAM_API_URL`, `PAYRAM_API_KEY`, `PAYRAM_PROJECT_ID`, `PAYRAM_WEBHOOK_SECRET`) + runbook file. No code changes yet.

### Section 2: Webhook Security + Idempotency Fix

**Problem**: `webhookHandlers.ts` calls `processPayramWebhook(payload)` with NO signature verification, NO HMAC, NO token check. Anyone with a `reference_id` could fire the webhook and mark `payment_sessions` as `completed`. Webhook route is `GET /payram-webhook` taking query params only — wrong contract for signed POST webhooks.

**Design**:

- Convert route to `POST /payram-webhook` accepting raw body + signature header.
- **Signature verification**: Read PayRam signing secret from `PAYRAM_WEBHOOK_SECRET` env var. Verify HMAC-SHA256 over raw request body (preferred). If PayRam uses JWT-signed webhooks instead, verify JWT signature using same secret. Exact mechanism confirmed from `mcp.payram.com` tools/credentials (Section 1 deliverable).
- **Verification boundary**: Verify signature FIRST before any DB write. Reject 401 on signature mismatch. No state change on unsigned requests.
- **Idempotency**: PayRam may retry webhooks. Add `ON CONFLICT (reference_id) DO NOTHING` guard OR check `payment_sessions.status` before UPDATE — if already `completed`/`partial`, return 200 OK without re-updating. Prevents double-credit on retry.
- **Status transition**: FILLED/OVER_FILLED → `completed`, PARTIALLY_FILLED → `partial`. Same as current logic, but only AFTER signature passes.
- **Match on**: `reference_id` (unique) — same as current. No user_id cross-check needed b/c webhook fires per-invoice, not per-user.

**Files touched**: `artifacts/api-server/src/routes/payments.ts` (route method + signature check before handler), `artifacts/api-server/src/lib/webhookHandlers.ts` (replace raw payload processing with signature-verified pipeline).

### Section 3: Env Var Standardization + Client Contract Update

**Problem**: `payramClient.ts` uses `PAYRAM_BASE_URL`, but `.env.example`, `README.md`, and `AGENTS.md` use `PAYRAM_API_URL`. `PAYRAM_PROJECT_ID` declared in env but never wired into the client.

**Design**:

- **Standardize on `PAYRAM_API_URL`** everywhere (matches `.env.example`, README, AGENTS.md — single source of truth).
- Update `payramClient.ts`: `new Payram({ apiKey: process.env.PAYRAM_API_KEY, baseUrl: process.env.PAYRAM_API_URL })`. Read `process.env.PAYRAM_API_URL` at call time, not init — matches Express lifecycle.
- **`PAYRAM_PROJECT_ID` wiring**: Pass to `Payram` constructor IF `mcp.payram.com` confirms required (Section 1 deliverable). Skeleton: `new Payram({ apiKey, baseUrl, projectId? })` — omit if unsupported by the `payram` npm package API.
- **Webhook secret**: New env var `PAYRAM_WEBHOOK_SECRET` added from Section 1 provisioning — consumed in `webhookHandlers.ts` (Section 2 already covered).
- **`.env.example` update**:
  - Rename `PAYRAM_API_URL` comment to clarify: "Base URL of your PayRam instance (from `mcp.payram.com` provisioning or dashboard)."
  - Add `PAYRAM_WEBHOOK_SECRET=...` with comment "HMAC/JWT signing secret from PayRam dashboard — used to verify webhook signatures."
  - Keep `PAYRAM_PROJECT_ID` comment as-is (already references `/api/v1/external-platform/details`).
- **No changes to README.md** beyond reflecting the above — README is informational, not load-bearing.

**Files touched**: `artifacts/api-server/src/lib/payramClient.ts` (env var rename + optional projectId), `.env.example` (add webhook secret + clarify comments).

**Risk**: If `payram` npm package doesn't accept `projectId` in constructor, pass it at the `initiatePayment` call site instead (Section 4).

### Section 4: Frontend/Backend Contract Fix

**Decision**: Option A — update Cashier.tsx to send `{ priceId }` matching payments.ts hardcoded packages. Backend stays authoritative on validated packages.

**User modification**: Minimum deposit = $10 (currently lowest preset is $25 in Cashier.tsx PRESET_AMOUNTS, and lowest hardcoded package is starter=$25 in payments.ts). User wants minimum lowered to $10.

**Implication**: Must add a $10 package/option. Two concrete changes needed at implementation time:

- Cashier.tsx PRESET_AMOUNTS: ensure $10 (1000 cents) is in the list (currently starts at 2500 cents/$25).
- payments.ts /deposit-packages: add a $10 package (priceId + amountInUSD=10), OR lower the starter package from $25 to $10.

**Also confirmed (both options)**:

- Remove unused `invoiceId` var in `payments.ts /checkout` (computed, never used).
- Wire `PAYRAM_PROJECT_ID` into `initiatePayment` call if MCP confirms required (Section 1).

**Files touched at implementation time**: `artifacts/api-server/src/routes/payments.ts` (remove invoiceId, possibly add $10 package or lower starter), `artifacts/casino-astro/src/components/islands/Cashier.tsx` (map chosen amount to nearest priceId, add $10 preset).

### Section 5: Per-Player Cashier Link Flow

**End-to-end flow** (production deposit path):

1. **Cashier.tsx** — Player selects method (card/crypto/bank), picks amount (presets from Section 4, min $10), clicks "Confirm Deposit".
2. **POST `/api/payments/checkout`** with `{ priceId }` (CSRF token in `x-csrf-token` header). Auth required.
3. **payments.ts** validates `priceId` against hardcoded packages → finds matching `amountInUSD` (e.g., 10 for the new $10 package).
4. Calls `payram.payments.initiatePayment({ customerEmail, customerId: userId, amountInUSD })`. If Section 1 confirms `PAYRAM_PROJECT_ID` required, pass it here.
5. **Insert** row into `payment_sessions`: `reference_id` (PayRam-returned), `invoice_id` (if returned), `user_id`, `amount_usd`, `status='open'`, timestamps.
6. **Returns** `{ url: checkout.url }` to Cashier.
7. **Cashier.tsx** does `window.location.href = data.url` → player lands on PayRam-hosted checkout page.
8. Player completes payment on PayRam → PayRam fires **POST `/api/payments/payram-webhook`** (Section 2 verified signature) with `{ reference_id, status, amount, currency }`.
9. **webhookHandlers.ts** verifies signature → idempotency check → updates `payment_sessions.status` to `completed`/`partial`.
10. Player returns to casino → `GET /api/payments/status/:referenceId` confirms completion → UI updates.

**This is the "per-player shared link"** — the PayRam checkout URL is unique per deposit session, shared to the player via the Cashier redirect. No standalone admin URL.

**No files changed beyond Sections 2-4** — this section confirms the flow uses the already-fixed endpoints. The only addition: ensure `initiatePayment` return value includes `reference_id` (currently checked as `invoice_id` in payments.ts but stored as `reference_id` in DB — verify field mapping during implementation).

### Section 6: One-off Shareable Deposit Link (Shape A — server-side admin endpoint)

- Purpose: static PayRam payment link for soft-launch invites (email/DM/marketing), independent of per-player Cashier flow. Generated ONCE, shared many times.
- New authenticated route: `POST /api/payments/shareable-link` (admin-only auth — role check, not just `authMiddleware`).
- Calls `payram.payments.initiatePayment` with fixed amount (no user-specific data), returns URL.
- URL persisted to `payment_sessions` with `user_id=NULL`, `status='open'`, special `reference_id` prefix.
- Returned URL is copy-pastable into invite email. Player opens it → PayRam checkout → webhook fires (same Section 2 path) → status updates.
- Keeps webhook→DB tracking uniform for both link types (per-player + one-off). Single flow.

**Rejected alternative (Shape B)**: Generate directly via PayRam dashboard UI (outside app), no code change. Rejected b/c no DB tracking, no webhook association (reference_id unknown).

**Files touched**: `artifacts/api-server/src/routes/payments.ts` (new admin route + auth gating), `payment_sessions` table handling for NULL user_id rows.

**YAGNI applied**: No link-listing UI, no analytics, just generate + return URL. Link expires per PayRam's own rules.

### Section 7: Testing Strategy

**Objective**: Verify each design section with minimal, observable test coverage proportional to a soft launch.

#### 1. Webhook Authentication Test (Section 2 — security fix verification)

- POST without signature header → 401.
- POST with invalid signature → 401.
- POST with valid signature + unknown reference_id → 404.
- POST with valid signature + known reference_id + status=FILLED → payment_sessions updated to completed, 200.
- Idempotency: repeat same payload, status stays completed, no double-credit, 200.
- Vitest (already configured). Mock crypto.timingSafeEqual for HMAC verification.

#### 2. Checkout Contract Test (Sections 3+4)

- POST /checkout with valid priceId + auth → payment_sessions insert (reference_id, amount_usd, status=open).
- Invalid priceId (not in hardcoded list) → 400.
- Verify priceId of new $10 package matches result.
- Env var: payramClient.ts reads PAYRAM_API_URL at call time (process.env mock).
- Contract: Cashier.tsx sends {priceId} shape — React Testing Library configured per Astro test config.

#### 3. Shareable Link Test (Section 6)

- POST /shareable-link with admin auth → {url}.
- Without admin auth → 403.
- URL starts with PAYRAM_API_URL value.
- payment_sessions row: user_id=NULL, special reference_id prefix.

#### 4. Manual Smoke Test (final delivery)

End-to-end against live PayRam instance from Section 1:

1. Generate one-off shareable link via admin route.
2. Open URL in browser.
3. Complete minimum $10 deposit.
4. Observe webhook fires.
5. Verify GET /api/payments/status/:referenceId returns 200 with status=completed.
6. Confirm no double-credit in DB.

#### 5. Out-of-scope

No load testing (soft-launch <100 txns/day — NFR in b7). No chaos testing. No PayRam upstream mock — live instance required.

---

## 5. Implementation Sequence (Approach A)

1. **MCP setup** — Add `mcp.payram.com` server → discover tools → reconcile Q1 (real tools vs docs-only).
2. **Provision** — PayRam instance on cloud VPS via MCP guidance → collect 4 secrets → write `docs/payram-headless-setup.md` runbook.
3. **Security-first code fix ordering**:
   1. `webhookHandlers.ts` + `payments.ts` route: POST + signature verification + idempotency (Section 2).
   2. `payramClient.ts`: `PAYRAM_API_URL` not `PAYRAM_BASE_URL`, optional projectId (Section 3).
   3. `.env.example`: add `PAYRAM_WEBHOOK_SECRET`, clarify comments (Section 3).
   4. `payments.ts /checkout`: remove unused `invoiceId`; add $10 package or lower starter (Section 4).
   5. `Cashier.tsx`: send `{priceId}` not `{amount,method}`, add $10 preset (Section 4).
   6. `payments.ts`: add `POST /api/payments/shareable-link` admin route (Section 6).
4. **Tests** per Section 7 testing strategy.
5. **Manual smoke test** against live instance.

---

## 6. Rejected Alternatives

- **Approach B — Code-First, MCP-Hybrid**: Fix all backend/frontend bugs first using current code + docs/web research. Provision instance from `mcp.payram.com` in parallel. Rejected b/c link validation deferred, bugs may not surface until live, may need rework if MCP tools reveal different contract.
- **Approach C — Script-Only (no MCP)**: Skip `mcp.payram.com`, reconstruct `setup_payram.sh` from `.env.example` hints + public docs. Rejected b/c violates user's explicit ask ("use mcp.payram.com"), guesswork on token expiry/PROJECT_ID endpoint.
- **Shape B — PayRam dashboard manual link**: Generate shareable link via PayRam UI, no code change. Rejected b/c no DB tracking, no webhook association (reference_id unknown).
