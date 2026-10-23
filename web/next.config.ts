import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// web/ の親（リポジトリルート）。Turbopack はこの外のファイルを読まない。
// tsconfig.base.json と hoisted な node_modules/next はここにある。
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
