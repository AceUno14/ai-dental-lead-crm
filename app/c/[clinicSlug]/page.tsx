import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DentalLeadForm } from "@/components/forms/dental-lead-form";
import { findPublicClinicBySlug } from "@/lib/services/clinics";

type PageParams = Promise<{ clinicSlug: string }>;

/**
 * The public submission server action persists the lead and then runs live AI
 * qualification in the same invocation. The default serverless budget is
 * shorter than a live provider call, which would abort the request mid-flight
 * and surface as a timeout. 60s is the maximum available on Vercel Hobby and
 * stays above the AI request timeout (AI_TIMEOUT_MS, default 30s).
 */
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { clinicSlug } = await params;
  const clinic = await findPublicClinicBySlug(clinicSlug);

  return {
    title: clinic ? `Book an appointment · ${clinic.name}` : "Clinic not found",
    description: clinic
      ? `Send an appointment enquiry to ${clinic.name}.`
      : "This clinic enquiry link is not available.",
  };
}

export default async function PublicClinicPage({ params }: { params: PageParams }) {
  const { clinicSlug } = await params;
  const clinic = await findPublicClinicBySlug(clinicSlug);

  if (!clinic) {
    // Safe not-found state: no clinic identifiers or internal detail is exposed.
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            New patient enquiry
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {clinic.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Send us an enquiry and our team will contact you to arrange an appointment.
          </p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <DentalLeadForm clinicSlug={clinic.slug} />
        </div>
      </section>
    </main>
  );
}
