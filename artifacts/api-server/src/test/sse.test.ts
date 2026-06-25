import { describe, it, expect, vi, beforeEach } from "vitest";
import { SSEManager } from "../lib/sse";
import type { Response } from "express";
import { EventEmitter } from "node:events";

/**
 * Create a mock Express Response object that acts as an EventEmitter
 * (for the `close` event) and provides the SSE interface.
 */
function createMockRes(): Response {
  // EventEmitter supports .on('close', ...) and .emit('close')
  const ee = new EventEmitter();
  return {
    ...ee,
    write: vi.fn().mockReturnValue(true),
    writeHead: vi.fn(),
    end: vi.fn(),
    on: ee.on.bind(ee),
    emit: ee.emit.bind(ee),
  } as unknown as Response;
}

describe("SSEManager", () => {
  let manager: SSEManager;

  beforeEach(() => {
    // Fresh instance for test isolation (sseManager singleton is the app-wide one)
    manager = new SSEManager();
  });

  describe("addClient", () => {
    it("returns a UUID client ID", () => {
      const res = createMockRes();
      const clientId = manager.addClient("slots", res);
      expect(clientId).toBeDefined();
      expect(typeof clientId).toBe("string");
      // UUID v4 format
      expect(clientId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it("adds client to the correct game type group", () => {
      const res = createMockRes();
      manager.addClient("blackjack", res);
      expect(manager.getClientCount()).toBe(1);
    });

    it("supports multiple clients in the same game type", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      manager.addClient("poker", res1);
      manager.addClient("poker", res2);
      expect(manager.getClientCount()).toBe(2);
    });

    it("supports clients in different game types", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      manager.addClient("slots", res1);
      manager.addClient("blackjack", res2);
      expect(manager.getClientCount()).toBe(2);
    });

    it("registers a close handler on the response for auto-cleanup", () => {
      const res = createMockRes();
      const spy = vi.spyOn(res, "on");
      manager.addClient("roulette", res);
      expect(spy).toHaveBeenCalledWith("close", expect.any(Function));
    });
  });

  describe("removeClient", () => {
    it("removes a client by ID and decrements count", () => {
      const res = createMockRes();
      const clientId = manager.addClient("slots", res);
      expect(manager.getClientCount()).toBe(1);
      manager.removeClient(clientId);
      expect(manager.getClientCount()).toBe(0);
    });

    it("handles removing a non-existent client gracefully", () => {
      expect(() => manager.removeClient("non-existent-id")).not.toThrow();
    });

    it("only removes the targeted client, not others", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      const id1 = manager.addClient("slots", res1);
      manager.addClient("slots", res2);
      expect(manager.getClientCount()).toBe(2);
      manager.removeClient(id1);
      expect(manager.getClientCount()).toBe(1);
    });
  });

  describe("broadcast", () => {
    it("sends the correct SSE event format to matching clients", () => {
      const res = createMockRes();
      manager.addClient("slots", res);

      manager.broadcast("slots", "spinResult", { win: 100 });

      expect(res.write).toHaveBeenCalledWith(
        'event: slots:spinResult\ndata: {"win":100}\n\n',
      );
    });

    it("does not send events to clients of other game types", () => {
      const slotsRes = createMockRes();
      const pokerRes = createMockRes();
      manager.addClient("slots", slotsRes);
      manager.addClient("poker", pokerRes);

      manager.broadcast("slots", "spinResult", { win: 100 });

      expect(slotsRes.write).toHaveBeenCalled();
      expect(pokerRes.write).not.toHaveBeenCalled();
    });

    it("does nothing when no clients are subscribed to the game type", () => {
      expect(() => manager.broadcast("nonexistent", "event", {})).not.toThrow();
    });

    it("handles a client that throws on write gracefully", () => {
      const badRes = createMockRes();
      (badRes.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Broken pipe");
      });
      manager.addClient("slots", badRes);

      expect(() => manager.broadcast("slots", "event", {})).not.toThrow();
    });

    it("removes clients that throw on write", () => {
      const badRes = createMockRes();
      (badRes.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Broken pipe");
      });
      manager.addClient("slots", badRes);
      expect(manager.getClientCount()).toBe(1);

      manager.broadcast("slots", "event", {});

      expect(manager.getClientCount()).toBe(0);
    });

    it("broadcasts to multiple clients of the same game type", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      manager.addClient("slots", res1);
      manager.addClient("slots", res2);

      manager.broadcast("slots", "jackpot", { amount: 5000 });

      expect(res1.write).toHaveBeenCalledWith(
        'event: slots:jackpot\ndata: {"amount":5000}\n\n',
      );
      expect(res2.write).toHaveBeenCalledWith(
        'event: slots:jackpot\ndata: {"amount":5000}\n\n',
      );
    });
  });

  describe("getClientCount", () => {
    it("returns 0 for a fresh manager", () => {
      expect(manager.getClientCount()).toBe(0);
    });

    it("returns correct count after multiple add/remove cycles", () => {
      const res1 = createMockRes();
      const res2 = createMockRes();
      const res3 = createMockRes();
      const id1 = manager.addClient("game1", res1);
      manager.addClient("game1", res2);
      manager.addClient("game2", res3);
      expect(manager.getClientCount()).toBe(3);
      manager.removeClient(id1);
      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe("auto-cleanup on close", () => {
    it("removes client when response emits close event", () => {
      const res = createMockRes();
      manager.addClient("slots", res);
      expect(manager.getClientCount()).toBe(1);

      // Simulate connection close
      (res as unknown as EventEmitter).emit("close");

      expect(manager.getClientCount()).toBe(0);
    });
  });
});
