import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load environment variables automatically.
// Local development secrets live in .env.local; a plain .env is supported as a fallback.
// `quiet: true` is required: dotenv prints an "injected env" banner to stdout otherwise,
// which would corrupt any output that gets redirected into a file (e.g. prisma migrate diff).
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
