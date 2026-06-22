FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/casino-astro/package.json artifacts/casino-astro/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/replit-auth-web/package.json lib/replit-auth-web/package.json

# Copy workspace catalog libs
COPY lib/ lib/

RUN pnpm install --frozen-lockfile

# Build
COPY artifacts/casino-astro/ artifacts/casino-astro/
COPY artifacts/api-server/ artifacts/api-server/
RUN pnpm --filter "@workspace/casino-astro" run build

# Production image
FROM node:22-slim AS production
WORKDIR /app
COPY --from=base /app/artifacts/casino-astro/dist ./dist
COPY --from=base /app/artifacts/casino-astro/node_modules ./node_modules
COPY --from=base /app/artifacts/casino-astro/package.json ./

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
