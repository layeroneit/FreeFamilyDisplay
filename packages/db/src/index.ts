import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

export type {
  User,
  Session,
  Invite,
  AuditLog,
  Board,
  BoardWidget,
  CachedPayload,
  Wallpaper,
  WallpaperCollection,
} from "@prisma/client";
// Value exports, not type-only: enums are runtime objects and comparisons like
// `role === UserRole.OPERATOR` need them to exist at runtime.
export { UserRole, CanvasPreset, WallpaperRotation, WallpaperOrder } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  ffdPrisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  return new PrismaClient({ adapter: new PrismaPg(url) });
}

function getPrisma(): PrismaClient {
  globalForPrisma.ffdPrisma ??= createPrismaClient();
  return globalForPrisma.ffdPrisma;
}

/**
 * Lazy singleton. The Proxy defers client construction until first property
 * access so that `DATABASE_URL` is not required while Next collects route
 * metadata at build time.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Liveness of the database connection, for `/readyz`.
 *
 * Returns a boolean rather than throwing: a readiness probe wants a verdict,
 * and the error must not propagate into a response body — a connection string
 * containing a password can appear in a Postgres error message.
 */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
