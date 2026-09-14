import { prisma } from "@/lib/db/prisma";
import { recordActivity } from "@/lib/services/activities";
import type { PublicLeadInput } from "@/lib/validation/lead";
import type { DashboardMetrics, LeadListFilters } from "@/types";
import { ActivityType } from "@/lib/generated/prisma/enums";
import type { LeadPriority, LeadStatus, Prisma } from "@/lib/generated/prisma/client";

/**
 * Persists a public lead submission.
 *
 * The clinicId is resolved server-side from the clinic slug before this is
 * called — it is never taken from the browser.
 */
export async function createPublicLead(input: {
  clinicId: string;
  data: PublicLeadInput;
}) {
  const { clinicId, data } = input;

  return prisma.$transaction(
    async (tx) => {
      const lead = await tx.lead.create({
        data: {
          clinicId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          serviceInterest: data.serviceInterest,
          preferredContactMethod: data.preferredContactMethod,
          submittedUrgency: data.urgency,
          message: data.message,
          // Optional patient-reported answers. The schema already normalises a
          // missing or unsupported answer to UNKNOWN.
          patientInsuranceStatus: data.patientInsuranceStatus,
          paymentPreference: data.paymentPreference,
          consent: data.consent,
        },
      });

      await recordActivity(
        {
          clinicId,
          leadId: lead.id,
          type: ActivityType.LEAD_CREATED,
          description: "Lead submitted through the public enquiry form.",
        },
        tx,
      );

      return lead;
    },
    {
      // A suspended Neon compute can take longer to answer than Prisma's 2s
      // maxWait / 5s interactive-transaction defaults, which used to fail the
      // first enquiry of the day and lose it. Both values stay well inside the
      // 60s serverless budget declared on the public route.
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}

/**
 * Lead list for a clinic, newest first, with optional status/priority filters.
 *
 * Archived leads are excluded by default: archiving is the normal CRM cleanup
 * action, so the default view stays the working queue. `filters.archived`
 * switches that: "archived" shows only archived leads, "all" shows both.
 */
export async function listClinicLeads(clinicId: string, filters: LeadListFilters = {}) {
  const where: Prisma.LeadWhereInput = { clinicId, ...archivedLeadFilter(filters.archived) };

  if (filters.status && isLeadStatus(filters.status)) {
    where.status = filters.status;
  }

  if (filters.priority && isLeadPriority(filters.priority)) {
    where.analysis = { priority: filters.priority };
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      serviceInterest: true,
      status: true,
      submittedUrgency: true,
      archivedAt: true,
      createdAt: true,
      analysis: {
        select: {
          leadScore: true,
          priority: true,
          urgency: true,
        },
      },
    },
  });
}

/**
 * Translates the archived-lead view filter into a `where` fragment.
 *
 * Anything unrecognised — including a missing value and a browser-supplied
 * value that was tampered with — falls back to the active-only default, so a
 * malformed query string can never widen a query by accident.
 */
function archivedLeadFilter(archived: string | undefined): Prisma.LeadWhereInput {
  if (archived === "archived") {
    return { archivedAt: { not: null } };
  }

  if (archived === "all") {
    return {};
  }

  return { archivedAt: null };
}

/**
 * Full lead detail, restricted to the authorized clinic.
 */
export async function getClinicLeadDetail(clinicId: string, leadId: string) {
  return prisma.lead.findFirst({
    where: { id: leadId, clinicId },
    include: {
      analysis: true,
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { actor: { select: { name: true } } },
      },
      tasks: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      },
    },
  });
}

export type ClinicLeadDetail = NonNullable<
  Awaited<ReturnType<typeof getClinicLeadDetail>>
>;

/**
 * Dashboard counters. Every query is scoped to the authorized clinic, and
 * archived leads are excluded from the metrics and the recent list: they belong
 * to a separate, explicitly requested view. Nothing about them is deleted.
 */
export async function getDashboardData(clinicId: string) {
  const now = new Date();
  const activeLead = { clinicId, archivedAt: null } as const;

  const [
    totalLeads,
    newLeads,
    hotLeads,
    appointmentsSet,
    followUpsDue,
    recentLeads,
  ] = await Promise.all([
    prisma.lead.count({ where: { ...activeLead } }),
    prisma.lead.count({ where: { ...activeLead, status: "NEW" } }),
    prisma.lead.count({ where: { ...activeLead, analysis: { priority: "HOT" } } }),
    prisma.lead.count({ where: { ...activeLead, status: "APPOINTMENT_SET" } }),
    prisma.followUpTask.count({
      where: {
        clinicId,
        status: "OPEN",
        dueAt: { lte: now },
        lead: { archivedAt: null },
      },
    }),
    prisma.lead.findMany({
      where: { ...activeLead },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        serviceInterest: true,
        status: true,
        createdAt: true,
        analysis: {
          select: {
            leadScore: true,
            priority: true,
            urgency: true,
            followUpPriority: true,
            recommendedFollowUpMinutes: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  const metrics: DashboardMetrics = {
    totalLeads,
    newLeads,
    hotLeads,
    appointmentsSet,
    followUpsDue,
  };

  return { metrics, recentLeads, now };
}

/**
 * Detects an accidental double submission of the same enquiry.
 * Returns the existing lead id when a matching recent submission exists.
 *
 * Archived leads are ignored on purpose: a patient whose old enquiry was filed
 * away must still be able to submit a new one, otherwise the re-enquiry would be
 * swallowed by duplicate protection and never reach staff.
 */
export async function findRecentDuplicateLead(input: {
  clinicId: string;
  email: string;
  message: string;
  withinMs?: number;
}): Promise<{ id: string } | null> {
  const since = new Date(Date.now() - (input.withinMs ?? 2 * 60 * 1000));

  return prisma.lead.findFirst({
    where: {
      clinicId: input.clinicId,
      email: input.email,
      message: input.message,
      archivedAt: null,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
}

export function isLeadStatus(value: string): value is LeadStatus {
  return ["NEW", "CONTACTED", "APPOINTMENT_SET", "WON", "LOST"].includes(value);
}

export function isLeadPriority(value: string): value is LeadPriority {
  return ["HOT", "WARM", "COLD"].includes(value);
}
