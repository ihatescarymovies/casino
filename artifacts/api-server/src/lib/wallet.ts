import { db } from "@workspace/db";
import * as schema from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { InsufficientFunds, WalletNotFound, WalletError } from "./errors";

export interface BetResult {
  transactionId: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface TransactionHistoryResult {
  transactions: schema.Transaction[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Get a user's wallet balance.
 * Returns balance in integer cents (e.g. 1000 = $10.00).
 */
export async function getBalance(
  userId: string,
): Promise<{ balance: number; currency: string }> {
  const [wallet] = await db
    .select()
    .from(schema.walletsTable)
    .where(eq(schema.walletsTable.userId, userId));

  if (!wallet) throw new WalletNotFound(`Wallet not found for user ${userId}`);

  return { balance: wallet.balance, currency: wallet.currency };
}

/**
 * Place a bet atomically.
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Verify balance >= amount
 * 3. Debit balance
 * 4. Record transaction
 *
 * All amounts in integer cents.
 */
export async function placeBet(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<BetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Bet amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Wallet not found for user ${userId}`);
    }

    if (wallet.balance < amount) {
      throw new InsufficientFunds();
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore - amount;

    await tx
      .update(schema.walletsTable)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(schema.walletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.transactionsTable)
      .values({
        walletId: wallet.id,
        userId,
        type: "bet",
        amount,
        balanceBefore,
        balanceAfter,
        status: "completed",
        referenceId: roundId,
        description: `Bet on ${gameType}`,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
    };
  });
}

/**
 * Credit a payout atomically.
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Credit balance
 * 3. Record transaction
 *
 * All amounts in integer cents.
 */
export async function creditPayout(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<BetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Payout amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Wallet not found for user ${userId}`);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    await tx
      .update(schema.walletsTable)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(schema.walletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.transactionsTable)
      .values({
        walletId: wallet.id,
        userId,
        type: "payout",
        amount,
        balanceBefore,
        balanceAfter,
        status: "completed",
        referenceId: roundId,
        description: `Payout from ${gameType}`,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
    };
  });
}

/**
 * Credit a balance atomically (add funds to wallet).
 * 1. Lock wallet row with SELECT FOR UPDATE
 * 2. Credit balance
 * 3. Record transaction
 *
 * All amounts in integer cents.
 */
export async function creditBalance(
  userId: string,
  amount: number,
  gameType: string,
  roundId: string,
): Promise<BetResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new WalletError("Credit amount must be a positive integer", 400);
  }

  return await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(schema.walletsTable)
      .where(eq(schema.walletsTable.userId, userId))
      .for("update");

    if (!wallet) {
      throw new WalletNotFound(`Wallet not found for user ${userId}`);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore + amount;

    await tx
      .update(schema.walletsTable)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(schema.walletsTable.id, wallet.id));

    const [transaction] = await tx
      .insert(schema.transactionsTable)
      .values({
        walletId: wallet.id,
        userId,
        type: "payout",
        amount,
        balanceBefore,
        balanceAfter,
        status: "completed",
        referenceId: roundId,
        description: `Credit from ${gameType}`,
      })
      .returning();

    return {
      transactionId: transaction.id,
      balanceBefore,
      balanceAfter,
    };
  });
}

/**
 * Get paginated transaction history for a user.
 */
export async function getTransactionHistory(
  userId: string,
  page = 1,
  limit = 20,
): Promise<TransactionHistoryResult> {
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.transactionsTable)
    .where(eq(schema.transactionsTable.userId, userId));

  const transactions = await db
    .select()
    .from(schema.transactionsTable)
    .where(eq(schema.transactionsTable.userId, userId))
    .orderBy(desc(schema.transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    transactions,
    total: countResult?.count ?? 0,
    page,
    limit,
  };
}
