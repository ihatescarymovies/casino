import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { InsufficientFunds, WalletNotFound, WalletError } from "./errors";

const DEMO_SEED_BALANCE = 10_000; // $100.00 in cents

export interface DemoBetResult {
  transactionId: number;
  balanceBefore: number;
  balanceAfter: number;
  demo: true;
}

export interface DemoTransactionHistoryResult {
  transactions: schema.DemoTransaction[];
  total: number;
  page: number;
  limit: number;
  demo: true;
}

export interface DemoBalanceResult {
  balance: number;
  demo: true;
}

export interface DemoWalletInfo {
  balance: number;
  resetCount: number;
  lastResetAt: Date | null;
  demo: true;
}

/**
 * Get a user's demo wallet balance.
 * Returns balance in integer cents (e.g. 1000 = $10.00).
 * Creates the demo wallet if it does not exist.
 */
export async function getDemoBalance(
  userId: string,
): Promise<DemoBalanceResult> {
  const wallet = await seedDemoWallet(userId);
  return { balance: wallet.balance, demo: true };
}

/**
 * Seed a demo wallet with the default starting balance if one does not exist.
 * Returns the wallet (existing or newly created).
 */
export async function seedDemoWallet(userId: string): Promise<DemoWalletInfo> {
  const [existing] = await db
    .select()
    .from(schema.demoWalletsTable)
    .where(eq(schema.demoWalletsTable.userId, userId));

  if (existing) {
    return {
      balance: existing.balance,
      resetCount: existing.resetCount,
      lastResetAt: existing.lastResetAt,
      demo: true,
    };
  }

  const [wallet] = await db
    .insert(schema.demoWalletsTable)
    .values({
      userId,
      balance: DEMO_SEED_BALANCE,
      resetCount: 0,
    })
    .returning();

  return {
    balance: wallet.balance,
    resetCount: wallet.resetCount,
    lastResetAt: wallet.lastResetAt,
    demo: true,
  };
}

/**
 * Reset a demo wallet to the default starting balance.
 * Tracks resetCount. Max 1 reset per day.
 */
export async function resetDemoWallet(userId: string): Promise<DemoWalletInfo> {
  const wallet = await seedDemoWallet(userId);

  if (wallet.lastResetAt) {
    const lastReset = new Date(wallet.lastResetAt);
    const now = new Date();
    const isSameDay =
      lastReset.getUTCFullYear() === now.getUTCFullYear() &&
      lastReset.getUTCMonth() === now.getUTCMonth() &&
      lastReset.getUTCDate() === now.getUTCDate();

    if (isSameDay) {
      throw new WalletError("Demo wallet can only be reset once per day", 429);
    }
  }

  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.demoWalletsTable)
      .set({
        balance: DEMO_SEED_BALANCE,
        resetCount: wallet.resetCount + 1,
        lastResetAt: new Date(),
      })
      .where(eq(schema.demoWalletsTable.userId, userId))
      .returning();

    await tx.insert(schema.demoTransactionsTable).values({
      demoWalletId: updated.id,
      userId,
      type: "reset",
      amount: DEMO_SEED_BALANCE,
      balanceBefore: wallet.balance,
      balanceAfter: DEMO_SEED_BALANCE,
    });

    return {
      balance: updated.balance,
      resetCount: updated.resetCount,
      lastResetAt: updated.lastResetAt,
      demo: true,
    };
  });
}

/**
 * Place a demo bet atomically.
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Verify balance >= amount
 * 3. Debit balance
 * 4. Record transaction
 *
 * All amounts in integer cents.
 */
export async function placeDemoBet(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<DemoBetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Bet amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.demoWalletsTable)
      .where(eq(schema.demoWalletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Demo wallet not found for user ${userId}`);
    }

    if (wallet.balance < amount) {
      throw new InsufficientFunds();
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;

    await tx
      .update(schema.demoWalletsTable)
      .set({ balance: balanceAfter })
      .where(eq(schema.demoWalletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.demoTransactionsTable)
      .values({
        demoWalletId: wallet.id,
        userId,
        type: "bet",
        amount,
        balanceBefore,
        balanceAfter,
        gameType,
        roundId,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
      demo: true,
    };
  });
}

/**
 * Credit a demo payout atomically.
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Credit balance
 * 3. Record transaction
 *
 * All amounts in integer cents.
 */
export async function creditDemoPayout(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<DemoBetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Payout amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.demoWalletsTable)
      .where(eq(schema.demoWalletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Demo wallet not found for user ${userId}`);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    await tx
      .update(schema.demoWalletsTable)
      .set({ balance: balanceAfter })
      .where(eq(schema.demoWalletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.demoTransactionsTable)
      .values({
        demoWalletId: wallet.id,
        userId,
        type: "payout",
        amount,
        balanceBefore,
        balanceAfter,
        gameType,
        roundId,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
      demo: true,
    };
  });
}

/**
 * Credit a demo balance atomically (add funds to demo wallet).
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Credit balance
 * 3. Record transaction
 *
 * All amounts in integer cents.
 */
export async function creditDemoBalance(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<DemoBetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Credit amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.demoWalletsTable)
      .where(eq(schema.demoWalletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Demo wallet not found for user ${userId}`);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    await tx
      .update(schema.demoWalletsTable)
      .set({ balance: balanceAfter })
      .where(eq(schema.demoWalletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.demoTransactionsTable)
      .values({
        demoWalletId: wallet.id,
        userId,
        type: "payout",
        amount,
        balanceBefore,
        balanceAfter,
        gameType,
        roundId,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
      demo: true,
    };
  });
}

/**
 * Get paginated demo transaction history for a user.
 */
export async function getDemoTransactionHistory(
  userId: string,
  page = 1,
  limit = 20,
): Promise<DemoTransactionHistoryResult> {
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.demoTransactionsTable)
    .where(eq(schema.demoTransactionsTable.userId, userId));

  const transactions = await db
    .select()
    .from(schema.demoTransactionsTable)
    .where(eq(schema.demoTransactionsTable.userId, userId))
    .orderBy(desc(schema.demoTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    transactions,
    total: countResult?.count ?? 0,
    page,
    limit,
    demo: true,
  };
}
