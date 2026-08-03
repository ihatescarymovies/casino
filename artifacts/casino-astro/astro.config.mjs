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
     * @param {string} _name
     * @param {any} envConfig
     */
    configEnvironment(_name, envConfig) {
      if (envConfig.build) {
        if (envConfig.build.rolldownOptions) {
          const { checks, ...rolldownOpts } = envConfig.build.rolldownOptions;
          envConfig.build.rollupOptions = Object.assign(
            {},
            rolldownOpts,
            envConfig.build.rollupOptions,
          );
        }
        if (!envConfig.build.rollupOptions?.input) {
          envConfig.build.rollupOptions = envConfig.build.rollupOptions || {};
          envConfig.build.rollupOptions.input = resolve("src/lib/config.ts");
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
