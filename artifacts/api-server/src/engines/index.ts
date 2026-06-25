/**
 * Engine Registry — singleton that manages game engine instances.
 *
 * Each game type registers its engine here.  Routes look up engines
 * by game type at runtime.
 */

import type { GameEngine } from "../lib/game-engine";
import { GameRoundError } from "../lib/errors";
import { SlotsEngine } from "./slots";
import { CrashEngine } from "./crash";
import { DiceEngine } from "./dice";
import { BlackjackEngine } from "./blackjack";
import { RouletteEngine } from "./roulette";
import { MinesEngine } from "./mines";
import { PlinkoEngine } from "./plinko";

export class EngineRegistry {
  private engines = new Map<string, GameEngine>();

  /**
   * Register a game engine.
   * Throws if an engine with the same gameType is already registered.
   */
  registerEngine(engine: GameEngine): void {
    const key = engine.gameType.toLowerCase();
    if (this.engines.has(key)) {
      throw new GameRoundError(
        `Engine already registered for game type: ${engine.gameType}`,
        409,
      );
    }
    this.engines.set(key, engine);
  }

  /**
   * Get a game engine by type name (case-insensitive).
   * Throws if no engine is registered for the given type.
   */
  getEngine(gameType: string): GameEngine {
    const key = gameType.toLowerCase();
    const engine = this.engines.get(key);
    if (!engine) {
      throw new GameRoundError(
        `No engine registered for game type: ${gameType}`,
        404,
      );
    }
    return engine;
  }

  /**
   * List all registered game type names.
   */
  listEngines(): string[] {
    return Array.from(this.engines.keys());
  }
}

/** Singleton instance shared across the application */
export const engineRegistry = new EngineRegistry();

if (process.env.VITEST !== "true") {
  engineRegistry.registerEngine(new SlotsEngine());
  engineRegistry.registerEngine(new CrashEngine());
  engineRegistry.registerEngine(new DiceEngine());
  engineRegistry.registerEngine(new BlackjackEngine());
  engineRegistry.registerEngine(new RouletteEngine());
  engineRegistry.registerEngine(new MinesEngine());
  engineRegistry.registerEngine(new PlinkoEngine());
}
