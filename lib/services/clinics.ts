import { prisma } from "@/lib/db/prisma";
import { slugifyClinicName } from "@/lib/validation/auth";
import { clinicSlugSchema } from "@/lib/validation/lead";

export type PublicClinic = {
  id: string;
  name: string;
  slug: string;
};

/**
 * Resolves the public clinic identity from a slug.
 * Only non-sensitive clinic fields are ever selected for public routes.
 */
export async function findPublicClinicBySlug(slug: string): Promise<PublicClinic | null> {
  const parsed = clinicSlugSchema.safeParse(slug);

  if (!parsed.success) {
    return null;
  }

  return prisma.clinic.findUnique({
    where: { slug: parsed.data },
    select: { id: true, name: true, slug: true },
  });
}

/**
 * Creates a clinic for a new owner and grants them OWNER membership.
 * The slug is made unique server-side.
 */
export async function createClinicForOwner(input: {
  ownerUserId: string;
  clinicName: string;
}): Promise<{ id: string; name: string; slug: string }> {
  const slug = await createUniqueClinicSlug(input.clinicName);

  const clinic = await prisma.clinic.create({
    data: {
      name: input.clinicName,
      slug,
      memberships: {
        create: {
          userId: input.ownerUserId,
          role: "OWNER",
        },
      },
    },
    select: { id: true, name: true, slug: true },
  });

  return clinic;
}

export async function createUniqueClinicSlug(clinicName: string): Promise<string> {
  const base = slugifyClinicName(clinicName);
  let candidate = base;
  let suffix = 1;

  // Bounded loop: clinic slugs are public identifiers and must stay readable.
  while (suffix <= 50) {
    const existing = await prisma.clinic.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${Date.now().toString(36)}`;
}
