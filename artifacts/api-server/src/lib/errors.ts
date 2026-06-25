/**
 * Custom error classes for the Casino game engine.
 *
 * Hierarchy:
 *   GameEngineError (base)
 *     ├── WalletError
 *     │     ├── InsufficientFunds
 *     │     └── WalletNotFound
 *     ├── HashChainError
 *     └── GameRoundError
 */

export class GameEngineError extends Error {
  /** HTTP status code appropriate for this error. */
  readonly statusCode: number;

  constructor(message: string, statusCode = 400, options?: ErrorOptions) {
    super(message, options);
    this.name = "GameEngineError";
    this.statusCode = statusCode;
  }
}

/* ── Wallet ─────────────────────────────────────────────────────────── */

export class WalletError extends GameEngineError {
  constructor(message: string, statusCode = 400, options?: ErrorOptions) {
    super(message, statusCode, options);
    this.name = "WalletError";
  }
}

export class InsufficientFunds extends WalletError {
  constructor(message = "Insufficient funds") {
    super(message, 402); // 402 Payment Required
    this.name = "InsufficientFunds";
  }
}

export class WalletNotFound extends WalletError {
  constructor(message = "Wallet not found") {
    super(message, 404);
    this.name = "WalletNotFound";
  }
}

/* ── Hash Chain ─────────────────────────────────────────────────────── */

export class HashChainError extends GameEngineError {
  constructor(message: string, statusCode = 400, options?: ErrorOptions) {
    super(message, statusCode, options);
    this.name = "HashChainError";
  }
}

/* ── Game Round ─────────────────────────────────────────────────────── */

export class GameRoundError extends GameEngineError {
  constructor(message: string, statusCode = 400, options?: ErrorOptions) {
    super(message, statusCode, options);
    this.name = "GameRoundError";
  }
}
