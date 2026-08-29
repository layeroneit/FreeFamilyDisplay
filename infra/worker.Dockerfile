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

RUN mkdir -p /app/media && chown 1001:1001 /app/media

USER 1001:1001
EXPOSE 3002
CMD ["node", "apps/worker/dist/index.js"]
