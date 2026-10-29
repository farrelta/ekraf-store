import { existsSync } from "node:fs";
import path from "node:path";

const sharedEnv = path.resolve(process.cwd(), "../.env");
if (existsSync(sharedEnv)) process.loadEnvFile(sharedEnv);

import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_ORIGIN ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
