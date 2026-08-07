// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";

import { resolve } from "node:path";

function fixViteSsrInput() {
  return {
    name: "fix-vite-ssr-input",
    /**
     * @param {string} name
     * @param {any} envConfig
     */
    configEnvironment(name, envConfig) {
      if (envConfig.build) {
        if (envConfig.build.rolldownOptions) {
          const { checks, ...rolldownOpts } = envConfig.build.rolldownOptions;
          envConfig.build.rollupOptions = Object.assign(
            {},
            rolldownOpts,
            envConfig.build.rollupOptions,
          );
        }
        // Only fix input for non-client environments (ssr, astro, prerender).
        if (name !== "client" && !envConfig.build.rollupOptions?.input) {
          envConfig.build.rollupOptions = envConfig.build.rollupOptions || {};
          envConfig.build.rollupOptions.input = resolve("src/lib/config.ts");
        }
      }
    },
    /**
     * Astro 7 sets rolldownOptions.input for the client AFTER config resolution,
     * but Vite's resolveRollupOptions only reads rollupOptions.input.
     * Sync them here at the start of the Rollup build.
     * @param {any} options
     * @returns {any}
     */
    options(options) {
      const env = /** @type {any} */ (this).environment;
      if (env?.name === "client") {
        const rolldownInput = env.config?.build?.rolldownOptions?.input;
        if (rolldownInput) {
          return { ...options, input: rolldownInput };
        }
      }
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss(), fixViteSsrInput()],
    ssr: {
      noExternal: ["@workspace/api-client-react"],
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  },
});
