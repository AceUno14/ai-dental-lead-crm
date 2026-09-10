/**
 * Removes the seeded demo sign-in credential from the connected database.
 *
 * The demo seed once shipped a hard-coded password, so any database seeded by an
 * older revision may still accept that public credential. This script deletes the
 * Better Auth credential account(s) for the demo email address while leaving the
 * clinic, leads, notes and timelines untouched.
 *
 * Dry run (default):  npx tsx scripts/remove-demo-credential.mts
 * Apply the change:   npx tsx scripts/remove-demo-credential.mts --apply
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? "owner@bright-smile-demo.test";
const apply = process.argv.includes("--apply");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured. Add it to .env.local before running this.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const users = await prisma.user.findMany({
    where: { email: DEMO_EMAIL },
    select: { id: true, createdAt: true },
  });

  if (users.length === 0) {
    console.log(`No user found for ${DEMO_EMAIL}. Nothing to remove.`);
    return;
  }

  const userIds = users.map((user) => user.id);

  const credentials = await prisma.account.findMany({
    where: { userId: { in: userIds }, providerId: "credential" },
    select: { id: true },
  });

  // Any session opened with the known password stays valid until it expires, so
  // revoking the password is not enough on its own.
  const sessions = await prisma.session.count({ where: { userId: { in: userIds } } });

  const otherProviders = await prisma.account.findMany({
    where: { userId: { in: userIds }, providerId: { not: "credential" } },
    select: { providerId: true },
  });

  console.log(`Matched ${users.length} user row(s) for ${DEMO_EMAIL}.`);
  console.log(`  credential accounts to remove: ${credentials.length}`);
  console.log(`  active sessions to revoke:     ${sessions}`);
  console.log(`  other linked providers kept:   ${otherProviders.length}`);

  if (credentials.length === 0 && sessions === 0) {
    console.log("No stored password credential or session found. Nothing to remove.");
    return;
  }

  if (!apply) {
    console.log("Dry run. Re-run with --apply to revoke the credential account(s) and sessions.");
    return;
  }

  const result = await prisma.account.deleteMany({
    where: { userId: { in: userIds }, providerId: "credential" },
  });

  const revoked = await prisma.session.deleteMany({ where: { userId: { in: userIds } } });

  console.log(`Deleted ${result.count} credential account(s) and revoked ${revoked.count} session(s).`);
  console.log("The clinic, leads, notes and activity timeline were not modified.");
}

main()
  .catch((error) => {
    console.error("[remove-demo-credential] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
