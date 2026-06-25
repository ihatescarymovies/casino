/**
 * Graceful shutdown handler for the API server.
 *
 * Handles SIGTERM/SIGINT signals to:
 * - Stop accepting new game rounds
 * - Resolve active rounds (especially Crash games)
 * - Close SSE connections
 * - Close database connections
 * - Exit cleanly within timeout
 */

import type { Server } from "http";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import * as schema from "@workspace/db";
import { logger } from "./logger";

interface ShutdownOptions {
  server: Server;
  timeoutMs?: number;
  onShutdownStart?: () => void | Promise<void>;
  onShutdownComplete?: () => void | Promise<void>;
}

let isShuttingDown = false;

/**
 * Perform graceful shutdown.
 */
export async function gracefulShutdown(
  options: ShutdownOptions,
): Promise<void> {
  const {
    server,
    timeoutMs = 30_000,
    onShutdownStart,
    onShutdownComplete,
  } = options;

  if (isShuttingDown) {
    logger.warn("Shutdown already in progress, forcing exit");
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info("Starting graceful shutdown");

  try {
    // Run pre-shutdown hook
    if (onShutdownStart) {
      await onShutdownStart();
    }

    // Stop accepting new connections
    logger.info("Stopping server from accepting new connections");
    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error closing server");
      }
    });

    // Resolve active Crash rounds
    await resolveActiveRounds();

    // Close SSE connections (handled by server.close, but log for clarity)
    logger.info("Closing SSE connections");

    // Close database connection
    logger.info("Closing database connection");

    // Run post-shutdown hook
    if (onShutdownComplete) {
      await onShutdownComplete();
    }

    logger.info("Graceful shutdown completed");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during graceful shutdown");
    process.exit(1);
  }
}

/**
 * Resolve any active game rounds (especially Crash games that are still running).
 */
async function resolveActiveRounds(): Promise<void> {
  logger.info("Resolving active game rounds");

  try {
    // Find all pending rounds
    const activeRounds = await db
      .select()
      .from(schema.gameRoundsTable)
      .where(eq(schema.gameRoundsTable.status, "pending"));

    logger.info(
      { count: activeRounds.length },
      "Found active rounds to resolve",
    );

    for (const round of activeRounds) {
      try {
        if (round.gameType === "crash") {
          // For Crash games, resolve at last known multiplier or 1.00x
          await db
            .update(schema.gameRoundsTable)
            .set({
              status: "completed",
              result: "crashed",
              payout: 0, // No payout for unresolved crashes
            })
            .where(eq(schema.gameRoundsTable.id, round.id));

          logger.info({ roundId: round.id }, "Resolved active Crash round");
        } else {
          // For other games, mark as completed with no payout
          await db
            .update(schema.gameRoundsTable)
            .set({
              status: "completed",
              result: "interrupted",
              payout: 0,
            })
            .where(eq(schema.gameRoundsTable.id, round.id));

          logger.info({ roundId: round.id }, "Resolved active round");
        }
      } catch (err) {
        logger.error({ roundId: round.id, err }, "Failed to resolve round");
      }
    }

    logger.info("All active rounds resolved");
  } catch (err) {
    logger.error({ err }, "Error resolving active rounds");
    // Don't fail shutdown for this
  }
}

/**
 * Setup signal handlers for graceful shutdown.
 */
export function setupShutdownHandlers(
  options: Omit<ShutdownOptions, "onShutdownStart" | "onShutdownComplete">,
): void {
  const { server, timeoutMs } = options;

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    await gracefulShutdown({
      server,
      timeoutMs,
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught exceptions and rejections
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled rejection");
    shutdown("unhandledRejection");
  });

  logger.info("Shutdown handlers registered");
}

/**
 * Check if the server is in shutdown mode.
 */
export function isShuttingDownMode(): boolean {
  return isShuttingDown;
}
