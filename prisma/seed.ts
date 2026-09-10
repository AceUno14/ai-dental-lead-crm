/**
 * Development seed.
 *
 * Creates one demo clinic with realistic-looking but entirely fictional leads.
 * Repeatable: re-running replaces the demo clinic and demo user.
 *
 * Run with: npm run db:seed
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../lib/generated/prisma/client";
import { generateMockAnalysis } from "../lib/ai/mock";

// `quiet: true` keeps dotenv from printing its "injected env" banner, which would
// otherwise pollute stdout (and any output that gets redirected).
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured. Add it to .env.local before seeding.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const DEMO_CLINIC = {
  name: "Bright Smile Dental",
  slug: "bright-smile-dental",
};

const DEMO_USER = {
  name: "Demo Clinic Owner",
  email: "owner@bright-smile-demo.test",
  password: "[REDACTED-REVOKED-DEMO-PASSWORD]",
};

type SeedLead = {
  name: string;
  email: string;
  phone: string;
  serviceInterest: string;
  preferredContactMethod: "EMAIL" | "PHONE" | "TEXT";
  submittedUrgency: "IMMEDIATE" | "TODAY" | "THIS_WEEK" | "FLEXIBLE" | "UNKNOWN";
  message: string;
  status: "NEW" | "CONTACTED" | "APPOINTMENT_SET" | "WON" | "LOST";
  notes?: { body: string }[];
  ageInHours: number;
};

const SEED_LEADS: SeedLead[] = [
  {
    name: "Sarah Bennett",
    email: "sarah.bennett@example.test",
    phone: "+1 555 0100",
    serviceInterest: "dental_emergency",
    preferredContactMethod: "PHONE",
    submittedUrgency: "IMMEDIATE",
    message:
      "I broke a tooth this morning and I am in a lot of pain. I need an appointment as soon as possible today.",
    status: "CONTACTED",
    notes: [{ body: "Called at 09:15 — booked in for an emergency slot this afternoon." }],
    ageInHours: 5,
  },
  {
    name: "Marcus Reid",
    email: "marcus.reid@example.test",
    phone: "+1 555 0101",
    serviceInterest: "implants",
    preferredContactMethod: "EMAIL",
    submittedUrgency: "THIS_WEEK",
    message:
      "I am missing a back tooth and would like to discuss implant options and roughly what it costs.",
    status: "NEW",
    ageInHours: 20,
  },
  {
    name: "Priya Nair",
    email: "priya.nair@example.test",
    phone: "+1 555 0102",
    serviceInterest: "cleaning",
    preferredContactMethod: "TEXT",
    submittedUrgency: "FLEXIBLE",
    message: "I would like to book a routine clean in the next few weeks. No pain at the moment.",
    status: "APPOINTMENT_SET",
    notes: [{ body: "Appointment set for next Tuesday at 11:00." }],
    ageInHours: 52,
  },
  {
    name: "Tom Alvarez",
    email: "tom.alvarez@example.test",
    phone: "+1 555 0103",
    serviceInterest: "orthodontics",
    preferredContactMethod: "PHONE",
    submittedUrgency: "THIS_WEEK",
    message:
      "My teenager wants to look into clear aligners. Can you tell me whether you offer a consultation and finance options?",
    status: "NEW",
    ageInHours: 74,
  },
  {
    name: "Helen Osei",
    email: "helen.osei@example.test",
    phone: "+1 555 0104",
    serviceInterest: "whitening",
    preferredContactMethod: "EMAIL",
    submittedUrgency: "FLEXIBLE",
    message: "Interested in teeth whitening before a wedding in three months. What are the prices?",
    status: "LOST",
    notes: [{ body: "Lead chose a different clinic closer to home." }],
    ageInHours: 130,
  },
  {
    name: "Daniel Kim",
    email: "daniel.kim@example.test",
    phone: "+1 555 0105",
    serviceInterest: "general_checkup",
    preferredContactMethod: "EMAIL",
    submittedUrgency: "THIS_WEEK",
    message:
      "I have not seen a dentist in about three years and would like a check-up appointment.",
    status: "WON",
    notes: [{ body: "Attended check-up, moved to a six-month recall programme." }],
    ageInHours: 200,
  },
  {
    name: "Aisha Rahman",
    email: "aisha.rahman@example.test",
    phone: "+1 555 0106",
    serviceInterest: "root_canal",
    preferredContactMethod: "PHONE",
    submittedUrgency: "TODAY",
    message:
      "One of my upper teeth has been throbbing for two days and feels worse with hot drinks.",
    status: "CONTACTED",
    ageInHours: 30,
  },
  {
    name: "Greg Whitfield",
    email: "greg.whitfield@example.test",
    phone: "+1 555 0107",
    serviceInterest: "other",
    preferredContactMethod: "EMAIL",
    submittedUrgency: "UNKNOWN",
    message: "Do you treat nervous patients? Just gathering information at this stage.",
    status: "NEW",
    ageInHours: 260,
  },
];

async function main() {
  // Remove any previous demo data so the seed stays repeatable.
  await prisma.clinic.deleteMany({ where: { slug: DEMO_CLINIC.slug } });
  await prisma.user.deleteMany({ where: { email: DEMO_USER.email } });

  const user = await prisma.user.create({
    data: {
      name: DEMO_USER.name,
      email: DEMO_USER.email,
      emailVerified: true,
    },
  });

  // Better Auth stores the credential hash in the account table. Hashing goes
  // through Better Auth itself so the seeded password stays compatible.
  const { auth } = await import("../lib/auth/auth");
  const authContext = await auth.$context;
  const passwordHash = await authContext.password.hash(DEMO_USER.password);

  await prisma.account.create({
    data: {
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
    },
  });

  const clinic = await prisma.clinic.create({
    data: {
      name: DEMO_CLINIC.name,
      slug: DEMO_CLINIC.slug,
      memberships: {
        create: { userId: user.id, role: "OWNER" },
      },
    },
  });

  for (const lead of SEED_LEADS) {
    const createdAt = new Date(Date.now() - lead.ageInHours * 60 * 60 * 1000);

    const analysis = generateMockAnalysis({
      name: lead.name,
      serviceInterest: lead.serviceInterest,
      preferredContactMethod: lead.preferredContactMethod,
      submittedUrgency: lead.submittedUrgency,
      message: lead.message,
    });

    const createdLead = await prisma.lead.create({
      data: {
        clinicId: clinic.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        serviceInterest: lead.serviceInterest,
        preferredContactMethod: lead.preferredContactMethod,
        submittedUrgency: lead.submittedUrgency,
        message: lead.message,
        consent: true,
        status: lead.status,
        createdAt,
        updatedAt: createdAt,
        analysis: {
          create: {
            clinicId: clinic.id,
            leadScore: analysis.leadScore,
            priority: analysis.priority,
            urgency: analysis.urgency,
            intent: analysis.intent,
            serviceCategory: analysis.serviceCategory,
            summary: analysis.summary,
            recommendedAction: analysis.recommendedAction,
            draftReply: analysis.draftReply,
            model: "mock-dental-qualifier-v1",
            createdAt,
            updatedAt: createdAt,
          },
        },
        activities: {
          create: [
            {
              clinicId: clinic.id,
              type: "LEAD_CREATED",
              description: "Lead submitted through the public enquiry form.",
              createdAt,
            },
            {
              clinicId: clinic.id,
              type: "AI_ANALYSIS_STARTED",
              description: "AI qualification started.",
              createdAt,
            },
            {
              clinicId: clinic.id,
              type: "AI_ANALYSIS_COMPLETED",
              description: `AI qualification completed with a score of ${analysis.leadScore}/100 (${analysis.priority}).`,
              createdAt,
            },
          ],
        },
        notes: lead.notes
          ? {
              create: lead.notes.map((note) => ({
                clinicId: clinic.id,
                authorUserId: user.id,
                body: note.body,
                createdAt,
              })),
            }
          : undefined,
      },
    });

    if (lead.status !== "NEW") {
      await prisma.leadActivity.create({
        data: {
          clinicId: clinic.id,
          leadId: createdLead.id,
          actorUserId: user.id,
          type: "STATUS_CHANGED",
          description: "Status changed from New to a later pipeline stage.",
          createdAt: new Date(createdAt.getTime() + 60 * 60 * 1000),
        },
      });
    }
  }

  console.log(
    `Seeded clinic "${DEMO_CLINIC.name}" (public form: /c/${DEMO_CLINIC.slug}) with ${SEED_LEADS.length} leads.`,
  );
  console.log(`Demo staff login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
}

main()
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
