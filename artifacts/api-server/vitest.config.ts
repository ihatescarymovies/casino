import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    conditions: ["development"],
  },
  test: {
    environment: "node",
    include: [
      "src/test/**/*.test.{ts,tsx}",
      "src/lib/**/*.test.ts",
      "src/engines/**/*.test.ts",
      "src/routes/**/*.test.ts",
    ],
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 1,
        isolate: true,
      },
    },
    testTimeout: 180_000,
  },
});
