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
    testTimeout: 180_000,
  },
});
