import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Postgres driver used by the Prisma driver adapter is a native Node
  // package and must not be bundled by Next.js.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
