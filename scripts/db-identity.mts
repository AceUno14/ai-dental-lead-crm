import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config as loadEnv, parse as parseEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const mode = process.argv[2] === "cli" ? "cli" : "e2e";
const inheritedDatabaseUrl = process.env.DATABASE_URL;

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function fileDatabaseUrl(path: string): string | undefined {
  try {
    return parseEnv(readFileSync(path)).DATABASE_URL;
  } catch {
    return undefined;
  }
}

if (mode === "cli") {
  // Import the exact config module Prisma CLI loads. Its module-level dotenv
  // calls are intentionally the source of truth for this comparison.
  await import("../prisma.config");
} else {
  // Match scripts/verify-e2e.mts exactly.
  loadEnv({ path: ".env.local", quiet: true });
  loadEnv({ path: ".env", quiet: true });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

function fileHasDatabaseUrl(path: string): boolean {
  return Boolean(fileDatabaseUrl(path));
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

try {
  const identity = await prisma.$queryRaw<
    Array<{ database: string; schema: string; currentUser: string }>
  >`SELECT current_database() AS database, current_schema() AS schema, current_user AS "currentUser"`;
  const migrations = await prisma.$queryRaw<
    Array<{ migrationName: string; finishedAt: Date | null }>
  >`SELECT migration_name AS "migrationName", finished_at AS "finishedAt" FROM "_prisma_migrations" WHERE migration_name = '20260913000000_dental_conversion_workflow'`;
  const constraints = await prisma.$queryRaw<
    Array<{ name: string; definition: string }>
  >`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('follow_up_task_analysis_fkey', 'follow_up_task_lead_fkey') ORDER BY conname`;

  console.log(`MODE: ${mode}`);
  console.log(`DATABASE_URL inherited before loading: ${inheritedDatabaseUrl ? "YES" : "NO"}`);
  console.log(
    `inherited fingerprint: ${inheritedDatabaseUrl ? fingerprint(inheritedDatabaseUrl) : "none"}`,
  );
  console.log(`.env.local has DATABASE_URL: ${fileHasDatabaseUrl(".env.local") ? "YES" : "NO"}`);
  console.log(
    `.env.local fingerprint: ${fileDatabaseUrl(".env.local") ? fingerprint(fileDatabaseUrl(".env.local")!) : "none"}`,
  );
  console.log(`.env has DATABASE_URL: ${fileHasDatabaseUrl(".env") ? "YES" : "NO"}`);
  console.log(`DB FINGERPRINT: ${fingerprint(connectionString)}`);
  console.log(`database: ${identity[0]?.database ?? "unknown"}`);
  console.log(`schema: ${identity[0]?.schema ?? "unknown"}`);
  console.log(`current_user: ${identity[0]?.currentUser ?? "unknown"}`);
  console.log(
    `dental migration: ${migrations[0]?.finishedAt ? "applied" : "NOT FOUND OR NOT FINISHED"}`,
  );
  for (const constraint of constraints) {
    console.log(`${constraint.name}: ${constraint.definition}`);
  }
} finally {
  await prisma.$disconnect();
}
