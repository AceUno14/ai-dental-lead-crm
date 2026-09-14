import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "@/lib/auth/session";
import type { MembershipRole } from "@/lib/generated/prisma/enums";

export const ACTIVE_CLINIC_COOKIE = "alc_active_clinic";

export type ClinicContext = {
  userId: string;
  userName: string;
  userEmail: string;
  membershipId: string;
  role: MembershipRole;
  clinic: {
    id: string;
    name: string;
    slug: string;
  };
};

/**
 * Resolves the clinic the authenticated user is allowed to work in.
 *
 * The clinic is always derived from a Membership row on the server. A clinicId
 * supplied by the browser is never treated as authorization.
 */
export async function getClinicContext(): Promise<ClinicContext | null> {
  const session = await getServerSession();

  if (!session?.user) {
    return null;
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { clinic: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    return null;
  }

  // An optional cookie may only *select* between memberships the user already has.
  const preferredClinicId = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value;
  const membership =
    memberships.find((item) => item.clinicId === preferredClinicId) ?? memberships[0];

  return {
    userId: session.user.id,
    userName: session.user.name,
    userEmail: session.user.email,
    membershipId: membership.id,
    role: membership.role,
    clinic: membership.clinic,
  };
}

/**
 * Requires an authenticated user with clinic access, otherwise redirects to login.
 */
export async function requireClinicContext(): Promise<ClinicContext> {
  const context = await getClinicContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}

export async function requireSessionUser() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export function isClinicManager(role: MembershipRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Permanent deletion is OWNER-only. The role comes from the membership resolved
 * server-side by `getClinicContext`; a role sent by the browser is never read.
 */
export function isClinicOwner(role: MembershipRole): boolean {
  return role === "OWNER";
}
