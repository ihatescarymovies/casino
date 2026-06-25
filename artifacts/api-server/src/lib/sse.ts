import { type Response } from "express";
import crypto from "node:crypto";

export interface SSEClient {
  id: string;
  res: Response;
  gameType: string;
}

/**
 * Manages SSE (Server-Sent Events) connections grouped by game type.
 *
 * Structure: Map<gameType, Map<clientId, Response>>
 *
 * Game engines use this singleton to broadcast real-time events to clients.
 */
export class SSEManager {
  private clients: Map<string, Map<string, Response>> = new Map();

  /**
   * Register a new SSE client for a given game type.
   * Returns the generated client ID.
   */
  addClient(gameType: string, res: Response): string {
    const clientId = crypto.randomUUID();

    if (!this.clients.has(gameType)) {
      this.clients.set(gameType, new Map());
    }

    this.clients.get(gameType)!.set(clientId, res);

    // Auto-cleanup on disconnect
    res.on("close", () => {
      this.removeClient(clientId);
    });

    return clientId;
  }

  /**
   * Remove a client by ID across all game types.
   */
  removeClient(clientId: string): void {
    for (const [, clients] of this.clients) {
      if (clients.has(clientId)) {
        clients.delete(clientId);
        break;
      }
    }
  }

  /**
   * Broadcast an event to all clients subscribed to a game type.
   *
   * Event format: `event: {gameType}:{eventName}\ndata: {JSON}\n\n`
   *
   * Silently ignores disconnected clients (catches write errors).
   */
  broadcast(gameType: string, eventName: string, data: unknown): void {
    const clients = this.clients.get(gameType);
    if (!clients) return;

    const event = `event: ${gameType}:${eventName}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [clientId, res] of clients) {
      try {
        res.write(event);
      } catch {
        // Client disconnected — remove silently
        clients.delete(clientId);
      }
    }
  }

  /**
   * Return the total number of connected clients across all game types.
   */
  getClientCount(): number {
    let count = 0;
    for (const [, clients] of this.clients) {
      count += clients.size;
    }
    return count;
  }
}

/** Singleton instance shared across the application */
export const sseManager = new SSEManager();
