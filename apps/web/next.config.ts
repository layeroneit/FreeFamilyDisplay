import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // Monorepo: trace from the workspace root so the standalone bundle picks up
  // `packages/*` and the hoisted `node_modules`. Derived from cwd rather than
  // `import.meta.url` — Next compiles this file for `next build`, and that
  // pattern can fail with "exports is not defined in ES module scope" under
  // Linux/Docker.
  outputFileTracingRoot: path.join(process.cwd(), "../.."),

  // Workspace packages are consumed as their compiled `dist` output, not as
  // source. `npm run dev` and `npm run build` run `tsc --build` first, and
  // project references keep that incremental. Resolving to built output means
  // the worker (plain Node) and web (Next) load the exact same JavaScript
  // rather than two separately-transpiled copies of it.

  // The pg driver and Prisma's adapter are native/CJS and must not be bundled.
  serverExternalPackages: [
    "pg",
    "pg-pool",
    "pg-protocol",
    "pg-connection-string",
    "pgpass",
    "@prisma/adapter-pg",
    "@prisma/driver-adapter-utils",
  ],

  // Caddy sets the full security header suite in front of this (plan §8.4).
  // These are the ones worth asserting at the app layer too, so they survive a
  // direct-to-container request on the LAN path where Caddy is bypassed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
