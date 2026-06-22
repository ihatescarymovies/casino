# Charter & Oak Casino — Agent Guide

## Project Overview

Charter & Oak is an online casino platform built as a pnpm monorepo. The frontend is Astro 6 with React islands; the backend is Express 5 with Drizzle ORM and PostgreSQL. An OpenAPI 3.1 spec drives code generation for both the React Query API client and Zod validators.

## Monorepo Structure

```
casino/
├── artifacts/
│   ├── casino-astro/      # @workspace/casino-astro — Astro 6 SSR frontend
│   ├── api-server/        # @workspace/api-server   — Express 5 API server
│   └── mockup-sandbox/    # @workspace/mockup-sandbox — Vite+React component sandbox
├── lib/
│   ├── db/                # @workspace/db           — Drizzle ORM schemas + migrations
│   ├── api-spec/          # @workspace/api-spec      — OpenAPI 3.1 spec (openapi.yaml)
│   ├── api-client-react/  # @workspace/api-client-react — Generated React Query hooks
│   ├── api-zod/           # @workspace/api-zod       — Generated Zod validators
│   └── integrations/
│       └── replit-auth-web/ # @workspace/replit-auth-web — Replit auth integration
├── scripts/               # @workspace/scripts       — Utility scripts
├── pnpm-workspace.yaml    # Workspace config + catalog deps
├── tsconfig.base.json     # Shared TS config (strict, es2022, bundler resolution)
└── package.json           # Root workspace scripts
```

## Common Commands

All commands run from repo root unless noted. Use `pnpm --filter <pkg>` to target a specific package.

```bash
# Install
pnpm install

# Development
pnpm --filter @workspace/casino-astro dev    # Astro dev server (0.0.0.0:4321)
pnpm --filter @workspace/api-server dev      # Express dev server (localhost:3000)

# Build
pnpm build                                    # Build all packages
pnpm --filter @workspace/casino-astro build   # Astro production build
pnpm --filter @workspace/api-server build     # esbuild bundle

# Test
pnpm --filter @workspace/casino-astro test          # Vitest (107 tests, 9 files)
pnpm --filter @workspace/casino-astro test:watch    # Vitest watch mode
pnpm --filter @workspace/casino-astro test:e2e      # Playwright e2e

# Type checking
pnpm typecheck                                 # All packages
pnpm typecheck:libs                            # Lib packages only
pnpm --filter @workspace/casino-astro typecheck # Astro check

# Database
pnpm --filter @workspace/db run push           # Drizzle schema push to DB

# Production
pnpm --filter @workspace/casino-astro start   # node dist/server/entry.mjs
pnpm --filter @workspace/api-server start      # node dist/index.mjs
```

## Key Architecture

### Frontend (casino-astro)

- **Astro 6 SSR** with `@astrojs/node` adapter (standalone mode)
- **React islands** for interactive components — Cashier, Dashboard, GamesFilter, JackpotCounter, Profile, Transactions, WinnersTicker
- **Tailwind v4** via `@tailwindcss/vite` plugin
- **shadcn/ui** components in `src/components/ui/`
- **Middleware** (`src/middleware.ts`): CSRF tokens, rate limiting, security headers (HSTS, CSP, X-Frame-Options, etc.), structured logging, session handling
- **Config** (`src/lib/config.ts`): Centralized `API_BASE_URL`, `rateLimit`, `csrf`, `securityHeaders`, `cashier`, `features` — all env-aware

### Backend (api-server)

- **Express 5** with esbuild bundling
- **Pino** structured logging
- **Routes**: auth, games, health, payments, promotions, stats, winners
- **Auth middleware**: `authMiddleware` with Replit/OpenID Connect
- **Payments**: Payram integration

### API Codegen Flow

```
lib/api-spec/openapi.yaml
  → Orval generates:
    lib/api-client-react/  (React Query hooks)
    lib/api-zod/           (Zod validators)
```

When changing the API spec, regenerate clients: `pnpm --filter @workspace/api-spec run generate` (or the Orval config command).

### Database (lib/db)

- **Drizzle ORM** with PostgreSQL
- Schema files: auth, game-rounds, games, payments, promotions, sessions, transactions, users, wallets, winners
- Push schema changes: `pnpm --filter @workspace/db run push`

## Code Conventions

- **TypeScript strict mode** everywhere (`tsconfig.base.json`)
- **Module resolution**: `bundler` with `customConditions: ["workspace"]`
- **Workspace imports**: Use `@workspace/<pkg>` for cross-package references
- **Pre-commit**: Husky + lint-staged runs Prettier on `*.{ts,tsx,js,jsx,mjs}` and `*.{json,md,yml,yaml,css}`
- **Tests**: Vitest for unit/integration, Playwright for e2e. Test files live alongside source in `src/test/` or as `*.test.ts(x)`
- **Images**: Always use `loading="lazy"` and `decoding="async"` on `<img>` tags
- **Security headers**: Centralized in `config.ts` `securityHeaders` — never add security headers ad-hoc in middleware
- **API URL**: Always import `API_BASE_URL` from `@/lib/config` — never hardcode localhost

## CI Pipeline

`.github/workflows/ci.yml` — 4 jobs:

| Job       | Command          | Depends On              |
| --------- | ---------------- | ----------------------- |
| lint      | `pnpm typecheck` | —                       |
| typecheck | `astro check`    | —                       |
| test      | `vitest run`     | —                       |
| build     | `astro build`    | lint + typecheck + test |

All jobs run `pnpm install --frozen-lockfile`.

### Lighthouse CI

`.github/workflows/lighthouse.yml` audits `/`, `/games`, `/promotions`:

- Performance ≥ 0.85, Accessibility ≥ 0.95, Best Practices ≥ 0.9, SEO ≥ 0.9
- LCP ≤ 2500ms, CLS ≤ 0.1, TBT ≤ 300ms

## Environment Variables

| Variable            | Used By      | Description                                     |
| ------------------- | ------------ | ----------------------------------------------- |
| `PORT`              | api-server   | Server port (default 3000)                      |
| `DATABASE_URL`      | db           | PostgreSQL connection string                    |
| `PAYRAM_API_URL`    | api-server   | Payram payment API URL                          |
| `PAYRAM_API_KEY`    | api-server   | Payram API key                                  |
| `PAYRAM_PROJECT_ID` | api-server   | Payram project ID                               |
| `API_BASE_URL`      | casino-astro | Backend API URL (default http://localhost:3000) |
| `CSRF_TOKEN_SECRET` | casino-astro | CSRF token signing secret                       |
| `SESSION_SECRET`    | casino-astro | Session signing secret                          |

See `.env.example` for template.

## File Patterns

### casino-astro Pages (`src/pages/`)

| Route                   | File                         | Notes                                             |
| ----------------------- | ---------------------------- | ------------------------------------------------- |
| `/`                     | `index.astro`                | Homepage — games grid, promotions, winners ticker |
| `/games`                | `games.astro`                | Game catalog with filter island                   |
| `/live-dealer`          | `live-dealer.astro`          | Live dealer tables                                |
| `/promotions`           | `promotions.astro`           | Active promotions                                 |
| `/promotions/[id]`      | `promotions/[id].astro`      | Promotion detail                                  |
| `/winners`              | `winners.astro`              | Recent winners                                    |
| `/cashier`              | `cashier.astro`              | Deposit/withdraw (Cashier island)                 |
| `/transactions`         | `transactions.astro`         | Transaction history (Transactions island)         |
| `/profile`              | `profile.astro`              | User profile (Profile island)                     |
| `/dashboard`            | `dashboard.astro`            | Player dashboard (Dashboard island)               |
| `/responsible-gambling` | `responsible-gambling.astro` | Responsible gambling info                         |
| `/login`                | `login.astro`                | Login page                                        |
| `/signup`               | `signup.astro`               | Registration page                                 |

### casino-astro Components

- **Layout**: `BaseLayout.astro` — HTML shell, `<main id="main-content">`, SiteHeader, SiteFooter
- **SiteHeader.astro** — Desktop nav + mobile hamburger slide-out panel
- **SiteFooter.astro** — Footer with links
- **GameCard.astro** — Game thumbnail card with lazy images
- **PromotionCard.astro** — Promotion display card with lazy images
- **IslandErrorBoundary.astro** — Error boundary wrapper for React islands
- **ui/** — shadcn/ui primitives (Button, Card, Dialog, Input, Label, Select, Slider, Toast, etc.)

### casino-astro Islands (`src/components/islands/`)

Interactive React components with `client:load`:

- `Cashier.tsx` — Deposit/withdraw flow
- `Dashboard.tsx` — Player dashboard with favorites
- `GamesFilter.tsx` — Game search/filter
- `JackpotCounter.tsx` — Animated jackpot display
- `Profile.tsx` — User profile editor
- `Transactions.tsx` — Transaction history
- `WinnersTicker.tsx` — Scrolling winners feed
- `QueryProvider.tsx` — React Query provider wrapper

## Things to Know

- The monorepo enforces `pnpm` via a `preinstall` script — `npm`/`yarn` will fail
- `pnpm-workspace.yaml` has `minimumReleaseAge: 1440` (1-day supply-chain defense) — newly published npm packages can't be installed until 24h old
- The workspace `catalog:` in `pnpm-workspace.yaml` pins shared dependency versions across packages
- esbuild, lightningcss, and rollup are overridden to linux-x64 only in the workspace config
- Casino-astro middleware runs on every request — CSRF, rate limiting, security headers, logging, session
- The `@workspace/api-client-react` package is in `ssr.noExternal` in Astro config to avoid SSR bundling issues
- Pre-existing LSP warnings about `import.meta` and `astro:middleware` module resolution are safe to ignore — they don't affect build or runtime
