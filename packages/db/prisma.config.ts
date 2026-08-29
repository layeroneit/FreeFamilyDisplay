import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig } from "@prisma/config";

// The operator's .env lives at the repo root (see .env.example), but npm
// workspace scripts run with cwd = packages/db — so a bare `dotenv/config`
// would look for packages/db/.env, find nothing, and hand Prisma an undefined
// URL. Resolve the root .env explicitly instead of trusting cwd.
// An ambient DATABASE_URL still wins: dotenv never overrides existing env.
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env"),
  quiet: true,
});

const url = process.env.DATABASE_URL;

export default defineConfig({
  // Spread rather than `url: url` — the config type marks `url` as a
  // non-undefined optional, so under exactOptionalPropertyTypes the property
  // must be absent (letting Prisma raise its own clear error) rather than
  // present-but-undefined.
  datasource: url === undefined ? {} : { url },
});
