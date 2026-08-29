# syntax=docker/dockerfile:1
#
# apps/web — Next.js standalone. Build context is the repository root.

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
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client generation needs a URL present but never connects at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010

# Dedicated non-root account. Not the image's stock `node` user (uid 1000) —
# an explicit uid keeps volume ownership predictable across rebuilds.
RUN addgroup -g 1001 -S ffd && adduser -u 1001 -S ffd -G ffd

COPY --from=build --chown=1001:1001 /app/apps/web/.next/standalone ./
COPY --from=build --chown=1001:1001 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=1001:1001 /app/apps/web/public ./apps/web/public

# Written to at runtime; the rest of the filesystem is mounted read-only.
RUN mkdir -p /app/media && chown 1001:1001 /app/media

USER 1001:1001
EXPOSE 3010
CMD ["node", "apps/web/server.js"]
