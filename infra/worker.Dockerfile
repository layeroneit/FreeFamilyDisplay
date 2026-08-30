# syntax=docker/dockerfile:1
#
# apps/worker — plain Node. Build context is the repository root.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/log/package.json packages/log/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build:packages && npm run build --workspace=@ffd/worker

# One-shot migration runner (compose `migrate` service). Full dev dependency
# tree from the deps stage on purpose: the Prisma CLI is a devDependency, and
# this stage never ships to a long-running container.
FROM node:22-alpine AS migrate
WORKDIR /app
# uid 1001 must exist and have a writable HOME: an unresolvable uid falls back
# to HOME=/, which nothing can write, and the npm wrapper dies on its cache
# dir before Prisma even starts. Invoke the CLI entry directly with node —
# no npm/npx layer to want a cache at all.
RUN addgroup -g 1001 -S ffd && adduser -u 1001 -S ffd -G ffd
ENV HOME=/tmp
ENV CHECKPOINT_DISABLE=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/package.json
COPY packages/db/prisma.config.ts packages/db/prisma.config.ts
COPY packages/db/prisma packages/db/prisma
WORKDIR /app/packages/db
USER 1001:1001
# DATABASE_URL comes from the environment at run time (compose), not the
# missing repo-root .env — dotenv treats an absent file as a silent no-op.
CMD ["node", "/app/node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S ffd && adduser -u 1001 -S ffd -G ffd

# Production dependency tree only — no build toolchain in the runtime image.
COPY --from=build --chown=1001:1001 /app/package.json ./package.json
COPY --from=build --chown=1001:1001 /app/package-lock.json ./package-lock.json
COPY --from=build --chown=1001:1001 /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build --chown=1001:1001 /app/packages/db/package.json ./packages/db/package.json
COPY --from=build --chown=1001:1001 /app/packages/log/package.json ./packages/log/package.json
RUN npm ci --omit=dev --workspace=@ffd/worker --include-workspace-root

COPY --from=build --chown=1001:1001 /app/apps/worker/dist ./apps/worker/dist
COPY --from=build --chown=1001:1001 /app/packages/db/dist ./packages/db/dist
COPY --from=build --chown=1001:1001 /app/packages/log/dist ./packages/log/dist
# Generated Prisma client.
COPY --from=build --chown=1001:1001 /app/node_modules/.prisma ./node_modules/.prisma
# Built-in wallpaper manifest (metadata only; the images ship in the web image).
COPY --from=build --chown=1001:1001 /app/apps/web/public/wallpapers/manifest.json ./wallpapers/manifest.json

RUN mkdir -p /app/media && chown 1001:1001 /app/media

USER 1001:1001
EXPOSE 3002
CMD ["node", "apps/worker/dist/index.js"]
