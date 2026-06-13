import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force single-threaded compilation. Corporate EDR (CrowdStrike /
  // SentinelOne / Defender ATP) on this machine hooks Windows
  // CreateProcess and intermittently denies node subprocess spawns,
  // surfacing as "Jest worker encountered 2 child process exceptions,
  // exceeding retry limit" on whichever route hit the deny. Capping
  // workers to 1 / disabling worker threads removes the spawn churn —
  // EDR has nothing to deny. Cost: slightly slower first-compile per
  // route; HMR is unaffected because nothing rebuilds in parallel.
  experimental: {
    cpus: 1,
    workerThreads: false,
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
  },

  // Produce a self-contained build under .next/standalone/ so the
  // distribution zip can run on an employee's laptop with nothing more
  // than a portable Node.js runtime — no npm install at the destination.
  // See: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  output: "standalone",

  // better-sqlite3 ships a native .node binary. It's already on Next.js's
  // default `serverExternalPackages` list so the JS wrapper isn't bundled,
  // but the binary itself sits one folder deeper than @vercel/nft's
  // automatic tracer can see. Pin it into every route's trace so the
  // standalone output always contains it.
  outputFileTracingIncludes: {
    "/**/*": [
      "./node_modules/better-sqlite3/build/Release/*.node",
    ],
  },
};

export default nextConfig;
