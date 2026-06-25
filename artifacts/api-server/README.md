# Charter & Oak API Server

Express 5 backend for the Charter & Oak Casino platform. Handles game rounds, wallet operations, authentication, and real-time events.

**Quick Links**:

- [Provably Fair Verification Guide](../../lib/api-spec/VERIFICATION.md)
- [OpenAPI Specification](../../lib/api-spec/openapi.yaml)
- [Database Schema](../../lib/db)

## Table of Contents

- [Architecture](#architecture)
- [Game Engine](#game-engine)
- [Available Game Types](#available-game-types)
- [API Endpoint Reference](#api-endpoint-reference)
- [Configuration](#configuration)
- [Testing](#testing)
- [Development](#development)
- [Production Deployment](#production-deployment)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Express 5 App                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Routes    │  │  Middleware │  │      Engines        │  │
│  │  /healthz   │  │    Auth     │  │      Slots          │  │
│  │  /games     │  │    CORS     │  │      Blackjack      │  │
│  │  /rounds    │  │    Error    │  │      Roulette       │  │
│  │  /wallet    │  │   Handler   │  │      Dice           │  │
│  │  /auth      │  │             │  │      Crash          │  │
│  │  /payments  │  │             │  │      Mines          │  │
│  │  /events    │  │             │  │      Plinko         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                           │                                   │
│                    ┌────────────┐                           │
│                    │   Drizzle   │                           │
│                    │    ORM      │                           │
│                    └────────────┘                           │
│                           │                                   │
│                    ┌────────────┐                           │
│                    │ PostgreSQL  │                           │
│                    └────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component         | Description                                        |
| ----------------- | -------------------------------------------------- |
| `src/app.ts`      | Express application setup, middleware registration |
| `src/index.ts`    | Server entry point, port binding                   |
| `src/routes/`     | HTTP route handlers organized by domain            |
| `src/engines/`    | Game logic implementations                         |
| `src/lib/`        | Shared utilities (wallet, hash chain, SSE, auth)   |
| `src/middleware/` | Express middleware (auth, error handling)          |

---

## Game Engine

All games implement the `GameEngine` interface defined in `src/lib/game-engine.ts`:

```typescript
interface GameEngine {
  readonly gameType: string;
  readonly config: GameConfig;

  placeBet(params: {
    userId: string;
    betAmount: number;
    clientSeed: string;
    gameParams?: Record<string, unknown>;
  }): Promise<GameRoundData>;

  handleAction(
    roundId: number,
    action: string,
    params?: Record<string, unknown>,
  ): Promise<{
    result: GameResult;
    payout: number;
    gameDetails?: Record<string, unknown>;
  }>;
}
```

### BaseGameEngine

`BaseGameEngine` provides common functionality:

- Bet validation against min/max limits
- Wallet debiting
- Hash chain seed retrieval
- Round creation in the database
- Result resolution and payout crediting
- SSE broadcasting

Each game engine extends `BaseGameEngine` and implements `executeGame()` for its specific logic.

### Game Flow

```
1. Client sends POST /api/rounds
   { gameType, betAmount, clientSeed, gameParams }

2. Server retrieves next hash from chain
   - serverSeed = "slots:chainId:nonce:random"
   - serverSeedHash = SHA-256(serverSeed)

3. Server creates round in database
   - Stores clientSeed, serverSeedHash, nonce
   - Marks round as "pending"

4. Server executes game engine
   - Game result computed deterministically from seeds
   - Payout calculated
   - Game details (reels, cards, etc.) captured

5. Server resolves round
   - Updates wallet balance
   - Stores serverSeed (revealed for verification)
   - Broadcasts SSE event

6. Client receives response
   { roundId, serverSeedHash, result, payout, newBalance }
```

### Provably Fair System

All games use a provably fair hash chain. See [VERIFICATION.md](../../lib/api-spec/VERIFICATION.md) for the complete guide.

Key points:

- Server pre-generates 1,000,000 SHA-256 hashes per game type
- When placing a bet, the server commits to the next hash (`serverSeedHash`)
- The client provides a `clientSeed`
- The game result is computed from both seeds
- After the round, the `serverSeed` is revealed for verification

---

## Available Game Types

### Slots

5-reel, 3-row video slot with 20 paylines.

| Property | Value                            |
| -------- | -------------------------------- |
| Min Bet  | 1 cent                           |
| Max Bet  | $1,000                           |
| RTP      | 96%                              |
| Paylines | 20                               |
| Special  | Wild symbols, scatter free spins |

**Symbols** (highest to lowest payout): DIAMOND, SEVEN, BELL, CHERRY, LEMON, ORANGE, A, K, Q, J, 10.

**Special Symbols**:

- **WILD**: Substitutes for any symbol (except scatter)
- **SCATTER (STAR)**: 3+ triggers 10 free spins with 2x multiplier
- **BLANK**: Empty space

**Payline Patterns**: 20 fixed paylines (zigzag, diagonal, horizontal patterns)

### Blackjack

Standard 6-deck blackjack with standard rules.

| Property            | Value                                |
| ------------------- | ------------------------------------ |
| Min Bet             | 1 cent                               |
| Max Bet             | $500                                 |
| RTP                 | 99.5%                                |
| Decks               | 6                                    |
| Dealer Hits Soft 17 | No                                   |
| Blackjack Pays      | 3:2                                  |
| Insurance           | Available (pays 2:1)                 |
| Actions             | hit, stand, double, split, insurance |

**Game Flow**:

1. Player places bet
2. Player and dealer each receive 2 cards (dealer's second card hidden)
3. Player acts: hit, stand, double down, split pairs, or take insurance
4. Dealer reveals hole card and hits until 17+
5. Payout determined by hand comparison

### Roulette

European single-zero roulette (37 numbers).

| Property | Value           |
| -------- | --------------- |
| Min Bet  | 1 cent          |
| Max Bet  | $1,000          |
| RTP      | 97.3%           |
| Wheel    | European (0-36) |

**Bet Types**:

| Bet Type   | Description                    | Payout |
| ---------- | ------------------------------ | ------ |
| Straight   | Single number                  | 35:1   |
| Split      | Two adjacent numbers           | 17:1   |
| Street     | Three numbers in a row         | 11:1   |
| Corner     | Four numbers meeting at corner | 8:1    |
| Line       | Six numbers (two rows)         | 5:1    |
| Column     | One of 12-number columns       | 2:1    |
| Dozen      | 1-12, 13-24, or 25-36          | 2:1    |
| Even Money | Red/Black, Odd/Even, High/Low  | 1:1    |

### Dice

Two six-sided dice with multiple bet types.

| Property | Value  |
| -------- | ------ |
| Min Bet  | 1 cent |
| Max Bet  | $1,000 |
| RTP      | 97%    |

**Bet Types**:

| Bet Type     | Description                      | Payout |
| ------------ | -------------------------------- | ------ |
| Over 7       | Sum > 7                          | 47:100 |
| Under 7      | Sum < 7                          | 47:100 |
| Exact 7      | Sum = 7                          | 4:1    |
| Exact Double | Specific double (e.g., double 6) | 11:1   |
| Any Double   | Any doubles (2-2, 3-3, etc.)     | 7:1    |

### Crash

Real-time multiplier game. The multiplier increases over time until it crashes.

| Property      | Value  |
| ------------- | ------ |
| Min Bet       | 1 cent |
| Max Bet       | $5,000 |
| RTP           | 99%    |
| Tick Interval | 100ms  |

**Game Flow**:

1. Players place bets during countdown
2. Multiplier starts at 1.00x and increases exponentially
3. Players must click "Cash Out" before crash
4. Crash point is determined deterministically from hash chain
5. Players who cashed out win at their cashout multiplier

**Crash Point Formula**:

```
crashPoint = max(1.00, 0.99 / (1 - randomValue))
```

### Mines

Grid-based game where players reveal tiles while avoiding mines.

| Property   | Value          |
| ---------- | -------------- |
| Min Bet    | 1 cent         |
| Max Bet    | $1,000         |
| RTP        | 97%            |
| Grid Size  | 5x5 (25 tiles) |
| Mine Range | 1-24 mines     |

**Game Flow**:

1. Player places bet and selects mine count (1-24)
2. Grid of 25 tiles appears (all hidden)
3. Player clicks tiles one at a time
4. Each safe reveal increases multiplier
5. Player can cash out at any time
6. Hitting a mine loses the entire bet

**Multiplier Example** (3 mines):

- 1 tile: 1.13x
- 5 tiles: 2.38x
- 10 tiles: 10.42x
- 15 tiles: 89.71x
- 22 tiles: 1000x

### Plinko

Ball-drop game with peg boards.

| Property    | Value             |
| ----------- | ----------------- |
| Min Bet     | 1 cent            |
| Max Bet     | $1,000            |
| RTP         | 96%               |
| Rows        | 8, 12, or 16      |
| Risk Levels | low, medium, high |
| Max Balls   | 10 per round      |

**Game Flow**:

1. Player selects row count (8, 12, or 16) and risk level
2. Player places bet (up to 10 balls)
3. Balls fall through peg board one at a time
4. At each peg, ball randomly goes left or right
5. Ball lands in slot with predetermined multiplier
6. All ball payouts are summed

**Multiplier Example** (16 rows, medium risk):

- Center slots: 0.5x
- Middle slots: 1x - 3x
- Edge slots: 15x - 100x

---

## API Endpoint Reference

### Health

| Method | Endpoint       | Description  |
| ------ | -------------- | ------------ |
| GET    | `/api/healthz` | Health check |

**Example**:

```bash
curl http://localhost:3000/api/healthz
# {"status":"ok"}
```

### Games

| Method | Endpoint                    | Description                 |
| ------ | --------------------------- | --------------------------- |
| GET    | `/api/games`                | List all games              |
| GET    | `/api/games?category=slots` | Filter by category          |
| GET    | `/api/games?featured=true`  | Featured games only         |
| GET    | `/api/games/categories`     | List categories with counts |
| GET    | `/api/games/featured`       | Featured games for homepage |
| GET    | `/api/games/:id`            | Get game details            |

**Examples**:

```bash
# List all games
curl http://localhost:3000/api/games

# Filter by category
curl "http://localhost:3000/api/games?category=slots"

# Get game details
curl http://localhost:3000/api/games/1
```

### Rounds (Game Play)

| Method | Endpoint                 | Auth | Description           |
| ------ | ------------------------ | ---- | --------------------- |
| POST   | `/api/rounds`            | Yes  | Place a bet           |
| GET    | `/api/rounds`            | Yes  | List user's rounds    |
| GET    | `/api/rounds/:id`        | Yes  | Get round details     |
| POST   | `/api/rounds/:id`        | Yes  | Handle game action    |
| POST   | `/api/rounds/:id/verify` | Yes  | Verify round fairness |

**Examples**:

```bash
# Place a bet (slots)
curl -X POST http://localhost:3000/api/rounds \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "gameType": "slots",
    "betAmount": 1000,
    "clientSeed": "my-random-seed-123",
    "gameParams": {"demo": false}
  }'

# Response:
# {
#   "roundId": 12345,
#   "serverSeedHash": "a1b2c3d4e5f6...",
#   "result": "win",
#   "payout": 5000,
#   "newBalance": 14500
# }

# Get round details
curl http://localhost:3000/api/rounds/12345 \
  -H "Authorization: Bearer <session-token>"

# Verify round fairness
curl -X POST http://localhost:3000/api/rounds/12345/verify \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": 12345,
    "serverSeed": "slots:a3f7b2d9:42:8f3c2a1b..."
  }'

# Response:
# {
#   "verified": true,
#   "computedHash": "a1b2c3d4e5f6...",
#   "expectedHash": "a1b2c3d4e5f6..."
# }
```

### Wallet

| Method | Endpoint              | Auth | Description         |
| ------ | --------------------- | ---- | ------------------- |
| GET    | `/api/wallet`         | Yes  | Get balance         |
| GET    | `/api/wallet/history` | Yes  | Transaction history |

**Examples**:

```bash
# Get wallet balance
curl http://localhost:3000/api/wallet \
  -H "Authorization: Bearer <session-token>"

# Response:
# {
#   "id": 1,
#   "userId": 987,
#   "balance": 14500,
#   "currency": "USD",
#   "createdAt": "2025-01-15T08:00:00Z"
# }

# Get transaction history
curl "http://localhost:3000/api/wallet/history?limit=10" \
  -H "Authorization: Bearer <session-token>"
```

### Demo Wallet

| Method | Endpoint                   | Auth | Description              |
| ------ | -------------------------- | ---- | ------------------------ |
| GET    | `/api/demo/wallet`         | Yes  | Demo balance             |
| POST   | `/api/demo/wallet/reset`   | Yes  | Reset to $100            |
| GET    | `/api/demo/wallet/history` | Yes  | Demo transaction history |

**Examples**:

```bash
# Get demo balance
curl http://localhost:3000/api/demo/wallet \
  -H "Authorization: Bearer <session-token>"

# Reset demo balance to $100
curl -X POST http://localhost:3000/api/demo/wallet/reset \
  -H "Authorization: Bearer <session-token>"
```

### Auth

| Method | Endpoint                          | Auth | Description           |
| ------ | --------------------------------- | ---- | --------------------- |
| GET    | `/api/auth/user`                  | Yes  | Get current user      |
| GET    | `/api/login`                      | No   | Start OIDC login      |
| GET    | `/api/callback`                   | No   | OIDC callback         |
| GET    | `/api/logout`                     | Yes  | Logout                |
| POST   | `/api/mobile-auth/token-exchange` | No   | Exchange mobile token |
| POST   | `/api/mobile-auth/logout`         | Yes  | Logout mobile session |

### Payments

| Method | Endpoint                            | Auth | Description           |
| ------ | ----------------------------------- | ---- | --------------------- |
| GET    | `/api/payments/deposit-packages`    | Yes  | List deposit packages |
| POST   | `/api/payments/checkout`            | Yes  | Create checkout       |
| GET    | `/api/payments/status/:referenceId` | Yes  | Check payment status  |
| GET    | `/api/payments/history`             | Yes  | Payment history       |
| POST   | `/api/payments/payram-webhook`      | No   | Payram webhook        |

### Events (Server-Sent Events)

| Method | Endpoint                      | Auth | Description |
| ------ | ----------------------------- | ---- | ----------- |
| GET    | `/api/events?gameType={type}` | Yes  | SSE stream  |

**Example**:

```bash
# Connect to SSE stream
curl -N http://localhost:3000/api/events?gameType=slots \
  -H "Authorization: Bearer <session-token>"

# Stream output:
# event: round_update
# data: {"roundId":12345,"state":"resolved","result":"win","payout":5000}
#
# event: round_update
# data: {"roundId":12346,"state":"resolved","result":"lose","payout":0}
#
```

### Stats

| Method | Endpoint     | Auth | Description            |
| ------ | ------------ | ---- | ---------------------- |
| GET    | `/api/stats` | No   | Casino-wide statistics |

**Example**:

```bash
curl http://localhost:3000/api/stats

# Response:
# {
#   "totalPayoutToday": 847293.5,
#   "activePlayers": 1842,
#   "currentJackpot": 2450000,
#   "gamesAvailable": 156
# }
```

### Promotions

| Method | Endpoint              | Auth | Description            |
| ------ | --------------------- | ---- | ---------------------- |
| GET    | `/api/promotions`     | No   | List active promotions |
| GET    | `/api/promotions/:id` | No   | Get promotion details  |

### Winners

| Method | Endpoint                 | Auth | Description        |
| ------ | ------------------------ | ---- | ------------------ |
| GET    | `/api/winners?limit={n}` | No   | Recent big winners |

**Example**:

```bash
curl "http://localhost:3000/api/winners?limit=10"

# Response:
# [
#   {
#     "id": 1,
#     "playerName": "LuckyPlayer7",
#     "gameName": "Diamond Rush",
#     "winAmount": 250000,
#     "timestamp": "2025-06-23T14:30:00Z",
#     "avatarUrl": "/avatars/luckyplayer7.jpg"
#   },
#   ...
# ]
```

### Hash Chain Info

| Method | Endpoint               | Auth | Description                    |
| ------ | ---------------------- | ---- | ------------------------------ |
| GET    | `/api/hash-chain/info` | Yes  | Get provably fair chain status |

**Example**:

```bash
curl http://localhost:3000/api/hash-chain/info \
  -H "Authorization: Bearer <session-token>"

# Response:
# {
#   "chainId": "a3f7b2d9",
#   "gameType": "slots",
#   "remainingHashes": 850000,
#   "currentHash": "a1b2c3d4e5f6..."
# }
```

---

## Configuration

### Environment Variables

| Variable            | Required | Default       | Description                  |
| ------------------- | -------- | ------------- | ---------------------------- |
| `PORT`              | Yes      | -             | Server port                  |
| `DATABASE_URL`      | Yes      | -             | PostgreSQL connection string |
| `PAYRAM_API_URL`    | Yes      | -             | Payram payment API URL       |
| `PAYRAM_API_KEY`    | Yes      | -             | Payram API key               |
| `PAYRAM_PROJECT_ID` | Yes      | -             | Payram project ID            |
| `REPL_ID`           | Yes      | -             | Replit app ID (for OIDC)     |
| `ISSUER_URL`        | Yes      | -             | OIDC issuer URL              |
| `SESSION_SECRET`    | Yes      | -             | Session signing secret       |
| `NODE_ENV`          | No       | `development` | Environment mode             |

### Database Schema

The server uses Drizzle ORM with the following main tables:

- `users` — Player accounts
- `wallets` — Player balances
- `transactions` — Wallet transaction history
- `gameRounds` — Game round records
- `hashChains` — Provably fair hash chain storage
- `promotions` — Active promotions
- `winners` — Recent winners feed
- `paymentSessions` — Payment session tracking

---

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

### Test Structure

```
src/test/
  health.test.ts          # Health endpoint tests
  errorHandler.test.ts    # Error middleware tests
  sse.test.ts             # SSE functionality tests
  helpers.ts              # Test utilities
  setup.ts                # Test setup
  property/               # Property-based tests
    slots.property.test.ts
    blackjack.property.test.ts
    roulette.property.test.ts
    dice.property.test.ts
    crash.property.test.ts
    mines.property.test.ts

src/engines/
  index.test.ts           # Engine registry tests
  slots/index.test.ts     # Slots engine tests
  blackjack/index.test.ts # Blackjack engine tests
  roulette/index.test.ts  # Roulette engine tests
  dice/index.test.ts      # Dice engine tests
  crash/index.test.ts     # Crash engine tests
  mines/index.test.ts     # Mines engine tests
  plinko/index.test.ts    # Plinko engine tests

src/routes/
  rounds.test.ts          # Rounds API tests
  wallet.test.ts          # Wallet API tests

src/lib/
  hash-chain.test.ts      # Hash chain tests
  wallet.test.ts          # Wallet logic tests
  demo-wallet.test.ts     # Demo wallet tests
```

### Property-Based Testing

The project uses `fast-check` for property-based testing of game engines. These tests verify that:

- Game outcomes are deterministic given the same seed
- Payouts are within expected ranges
- Edge cases are handled correctly
- RTP approximations are within tolerance

---

## Development

### Install Dependencies

```bash
pnpm install
```

### Start Development Server

```bash
pnpm dev
```

This builds the project and starts the server with source maps enabled.

### Build for Production

```bash
pnpm build
```

### Type Checking

```bash
pnpm typecheck
```

### Project Scripts

| Command           | Description                    |
| ----------------- | ------------------------------ |
| `pnpm dev`        | Build and start in development |
| `pnpm build`      | Build with esbuild             |
| `pnpm start`      | Start built server             |
| `pnpm test`       | Run all tests once             |
| `pnpm test:watch` | Run tests in watch mode        |
| `pnpm typecheck`  | Run TypeScript type checking   |
