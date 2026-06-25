# Provably Fair Verification Guide

This document explains how to verify that every game round on Charter & Oak Casino is fair and untampered with. Our provably fair system uses a hash chain with SHA-256, client seeds, and server seed commitments.

## Table of Contents

- [How It Works](#how-it-works)
- [The Hash Chain](#the-hash-chain)
- [Client Seeds](#client-seeds)
- [Step-by-Step Verification](#step-by-step-verification)
- [Code Examples](#code-examples)
- [Per-Game Result Decoding](#per-game-result-decoding)

---

## How It Works

Every game round follows this sequence:

1. **Pre-generation唾沫** — The server generates a chain of SHA-256 hashes before any bets are placed.
2. **Commitment** — When you place a bet, the server reveals only the hash of the next seed (`serverSeedHash`), not the seed itself.
3. **Client Seed** — Your browser provides a `clientSeed` that combines with the server seed.
4. **Result** — The game outcome is computed from both seeds.
5. **Revelation** — After the round, the actual `serverSeed` is revealed.
6. **Verification** — You verify that `SHA-256(serverSeed) === serverSeedHash`.

This guarantees the server could not have changed the outcome after seeing your bet, because the hash was committed before the round started.

---

## The Hash Interstate

### Pre-Generation

Before any game begins, the server generates a chain of 1,000,000 seeds per game type. Each seed has the format:

```
{gameType}:{chainId}:{index}:{random}
```

For example:

```
slots:a3f7b2d9:42:8f3c2a1b...
```

The SHA-256 hash of each seed is stored in the database. The actual seed remains secret until the round completes.

### Serving Order

Hashes are consumed in index order (highest first). When the remaining supply drops below 10% of the chain, a new chain is automatically generated and linked to the previous chain's final hash.

### Chain Linking

Each new chain links to the previous chain through the `previousHash` field. This creates an auditable trail:

```
Chain N:   seed_0 -> hash_0 -> seed_1 -> hash_1 -> ... -> seed_999999 -> hash_999999
Chain N+1: seed_0' -> hash_0' -> ... (linked to hash_999999)
```

---

## Client Seeds

The `clientSeed` is a string you provide when placing a bet. It serves two purposes:

1. **Unpredictability** — Even if the server seed were known in advance, the client seed prevents the server from predicting the outcome.
2. **Verification** — You choose the seed, so you know it was not manipulated by the server.

### Best Practices for Client Seeds

- Use a cryptographically secure random string (at least 32 characters).
- Never reuse the same client seed across multiple rounds.
- Store your client seeds locally so you can verify later.

### Example Client Seed Generation

```javascript
// Browser
function generateClientSeed() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}
```

---

## Step-by-Step Verification

### 1. Place a Bet

When you place a bet, the API returns:

```json
{
  "roundId": 12345,
  "serverSeedHash": "a1b2c3d4...",
  "result": "pending",
  "payout": 0,
  "newBalance": 9500
}
```

Save the `serverSeedHash` and your `clientSeed`.

### 2. After the Round Completes

The server reveals the `serverSeed`. You can fetch round details:

```bash
curl -H "Authorization: Bearer <token>" \
  https://api.example.com/api/rounds/12345
```

### 3. Verify the Hash

Compute `SHA-256(serverSeed)` and confirm it matches `serverSeedHash`.

### 4. Verify the Game Result

Use the combined seed to recompute the game outcome and confirm it matches what the server reported.

---

## Code Examples

### JavaScript (Node.js / Browser)

```javascript
import { createHash } from "node:crypto";

/**
 * Verify that a server seed matches its committed hash.
 */
function verifyServerSeed(serverSeed, expectedHash) {
  const computedHash = createHash("sha256").update(serverSeed).digest("hex");

  return {
    verified: computedHash === expectedHash,
    computedHash,
    expectedHash,
  };
}

/**
 * Generate the combined seed used for game result computation.
 */
function getCombinedSeed(clientSeed, serverSeedHash) {
  return `${clientSeed}:${serverSeedHash}`;
}

// Example usage
const serverSeed = "slots:a3f7b2d9:42:8f3c2a1b...";
const serverSeedHash = "a1b2c3d4e5f6...";
const clientSeed = "my-client-seed-123";

const verification = verifyServerSeed(serverSeed, serverSeedHash);
console.log("Verified:", verification.verified);

const combinedSeed = getCombinedSeed(clientSeed, serverSeedHash);
console.log("Combined seed:", combinedSeed);
```

### Python

```python
import hashlib

def verify_server_seed(server_seed: str, expected_hash: str) -> dict:
    """Verify that a server seed matches its committed hash."""
    computed_hash = hashlib.sha256(server_seed.encode()).hexdigest()

    return {
        "verified": computed_hash == expected_hash,
        "computed_hash": computed_hash,
        "expected_hash": expected_hash,
    }

def get_combined_seed(client_seed: str, server_seed_hash: str) -> str:
    """Generate the combined seed used for game result computation."""
    return f"{client_seed}:{server_seed_hash}"

# Example usage
server_seed = "slots:a3f7b2d9:42:8f3c2a1b..."
server_seed_hash = "a1b2c3d4e5f6..."
client_seed = "my-client-seed-123"

result = verify_server_seed(server_seed, server_seed_hash)
print(f"Verified: {result['verified']}")

combined_seed = get_combined_seed(client_seed, server_seed_hash)
print(f"Combined seed: {combined_seed}")
```

### curl

```bash
# Verify a round
SERVER_SEED="slots:a3f7b2d9:42:8f3c2a1b..."
EXPECTED_HASH="a1b2c3d4e5f6..."

# Compute SHA-256
COMPUTED_HASH=$(echo -n "$SERVER_SEED" | sha256sum | awk '{print $1}')

if [ "$COMPUTED_HASH" = "$EXPECTED_HASH" ]; then
  echo "Verification PASSED"
else
  echo "Verification FAILED"
  echo "Expected: $EXPECTED_HASH"
  echo "Computed: $COMPUTED_HASH"
fi

# Fetch and verify via API
curl -X POST https://api.example.com/api/rounds/12345/verify \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "roundId": 12345,
    "serverSeed": "slots:a3f7b2d9:42:8f3c2a1b..."
  }'
```

---

## Per-Game Result Decoding

Each game type uses the combined seed (`clientSeed:serverSeedHash`) to deterministically generate its outcome.

### Slots

The slots engine uses the combined seed and nonce to generate random positions for each reel:

```javascript
function seededRandom(seed, nonce, reel, pos) {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${reel}:${pos}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

// Each reel's starting position
const start = seededRandom(combinedSeed, nonce, reelIndex, 0) % reelLength;
```

The visible symbols are the 3 symbols starting at that position on each reel's strip.

### Dice

The dice engine derives two dice from the combined seed:

```javascript
function seededDice(seed, nonce) {
  const hash = createHash("sha256").update(`${seed}:${nonce}`).digest("hex");
  const die1 = (parseInt(hash.slice(0, 8), 16) % 6) + 1;
  const die2 = (parseInt(hash.slice(8, 16), 16) % 6) + 1;
  return [die1, die2];
}
```

### Crash

The crash point is computed from a deterministic RNG value:

```javascript
function deterministicRng(serverSeedHash, nonce) {
  const hash = createHash("sha256")
    .update(`${serverSeedHash}:${nonce}:crash`)
    .digest("hex");
  const intValue = parseInt(hash.slice(0, 8), 16);
  return intValue / 0xffffffff;
}

function calculateCrashPoint(rngValue) {
  return Math.max(1.0, 0.99 / (1 - rngValue));
}
```

### Blackjack

The deck is shuffled using a Fisher-Yates shuffle seeded by the combined hash:

```javascript
function deterministicRandom(seed, nonce, position) {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${position}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16);
}

function shuffleDeck(cards, seed, nonce) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const rand = deterministicRandom(seed, nonce, i);
    const j = rand % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

Cards are dealt in order from the shuffled deck: player, dealer, player, dealer.

### Roulette

The winning number is derived from the combined seed:

```javascript
function generateWinningNumber(clientSeed, serverSeedHash, nonce) {
  const hash = createHash("sha256")
    .update(`${clientSeed}:${serverSeedHash}:${nonce}`)
    .digest("hex");
  const rand = parseInt(hash.slice(0, 8), 16);
  return rand % 37; // European roulette (0-36)
}
```

### Mines

Mine positions are placed using a seeded Fisher-Yates shuffle:

```javascript
function deterministicRng(serverSeedHash, nonce, position) {
  const hash = createHash("sha256")
    .update(`${serverSeedHash}:${nonce}:mines:${position}`)
    .digest("hex");
  return parseInt(hash.slice(0, 8), 16) / 0xffffffff;
}

function placeMines(gridSize, mineCount, serverSeedHash, nonce) {
  const totalTiles = gridSize * gridSize;
  const tiles = Array.from({ length: totalTiles }, (_, i) => i);

  for (let i = tiles.length - 1; i > 0; i--) {
    const rand = deterministicRng(serverSeedHash, nonce, i);
    const j = Math.floor(rand * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles.slice(0, mineCount);
}
```

### Plinko

Each ball's path is determined by bits from the hash:

```javascript
function generateBallPath(seed, nonce, ballIndex, rows) {
  const hash = createHash("sha256")
    .update(`${seed}:${nonce}:${ballIndex}`)
    .digest("hex");

  const path = [];
  let rightCount = 0;

  for (let i = 0; i < rows; i++) {
    const hexCharIndex = Math.floor(i / 4);
    const bitIndex = 3 - (i % 4);
    const hexValue = parseInt(hash[hexCharIndex], 16);
    const bit = (hexValue >> bitIndex) & 1;

    if (bit === 1) {
      path.push("R");
      rightCount++;
    } else {
      path.push("L");
    }
  }

  return { path, landingSlot: rightCount };
}
```

The landing slot determines the multiplier from the game's payout table.

---

## Verification Checklist

Before trusting any game result, confirm:

1. The `serverSeedHash` was provided before the round started.
2. The revealed `serverSeed` hashes to exactly `serverSeedHash`.
3. Your `clientSeed` matches what you sent in the bet request.
4. Recomputing the game result with the combined seed produces the same outcome.
5. The round's `nonce` matches the expected sequence.

If all checks pass, the round was fair.
