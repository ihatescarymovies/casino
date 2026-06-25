import { Router, type IRouter, type Request, type Response } from "express";
import { sseManager } from "../lib/sse";

const router: IRouter = Router();

const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * GET /events — Establish an SSE connection.
 *
 * Query params:
 *   - gameType (required): the game type to subscribe to
 *   - lastEventId (optional): for reconnection replay
 *
 * Headers set:
 *   - Content-Type: text/event-stream
 *   - Cache-Control: no-cache
 *   - Connection: keep-alive
 *   - Last-Event-ID (when lastEventId query param is present)
 */
router.get("/events", (req: Request, res: Response) => {
  // Require authentication
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameType = req.query.gameType as string | undefined;
  if (!gameType) {
    res.status(400).json({ error: "gameType query parameter is required" });
    return;
  }

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...(req.query.lastEventId
      ? { "Last-Event-ID": req.query.lastEventId as string }
      : {}),
  });

  // Register with SSEManager
  const clientId = sseManager.addClient(gameType, res);

  // Heartbeat: send :keepalive comment every 15 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(":keepalive\n\n");
    } catch {
      clearInterval(heartbeat);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Cleanup heartbeat on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

export default router;
