import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/leads/activity-timeline";
import { AiAnalysisPanel } from "@/components/leads/ai-analysis-panel";
import { StatusBadge } from "@/components/leads/lead-badges";
import { LeadStatusForm } from "@/components/leads/lead-status-form";
import { NoteForm } from "@/components/leads/note-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireClinicContext } from "@/lib/auth/clinic";
import { getClinicLeadDetail } from "@/lib/services/leads";
import { serviceInterestLabel } from "@/lib/validation/lead";

export const metadata: Metadata = {
  title: "Lead detail",
};

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { clinic } = await requireClinicContext();
  const { leadId } = await params;

  // Always scoped by BOTH lead id and the authorized clinic id.
  const lead = await getClinicLeadDetail(clinic.id, leadId);

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/leads" className="text-sm text-sky-700 hover:underline">
            ← Back to leads
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {lead.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Created {formatDateTime(lead.createdAt)} · {serviceInterestLabel(lead.serviceInterest)}
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AiAnalysisPanel leadId={lead.id} analysis={lead.analysis} />

          <Card>
            <CardHeader title="Original enquiry" />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailRow label="Email" value={lead.email} />
                <DetailRow label="Phone" value={lead.phone} />
                <DetailRow
                  label="Preferred contact"
                  value={lead.preferredContactMethod.toLowerCase()}
                />
                <DetailRow label="Stated urgency" value={lead.submittedUrgency.replace(/_/g, " ")} />
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Message
                </h3>
                <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  {lead.message}
                </p>
              </div>

              <p className="text-xs text-slate-500">
                Consent to be contacted: {lead.consent ? "Yes" : "No"}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Internal notes" description="Visible to clinic staff only." />
            <CardBody className="space-y-5">
              <NoteForm leadId={lead.id} />

              {lead.notes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  No notes yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {lead.notes.map((note) => (
                    <li key={note.id} className="rounded-lg border border-slate-200 px-4 py-3">
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                      <p className="mt-2 text-xs text-slate-500">
                        {note.author.name} · {formatDateTime(note.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Workflow" />
            <CardBody className="space-y-4">
              <LeadStatusForm leadId={lead.id} status={lead.status} />
              <p className="text-xs text-slate-500">
                Status changes are recorded on the activity timeline. Appointments are tracked as a
                CRM status only.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity timeline" />
            <CardBody>
              <ActivityTimeline
                activities={lead.activities.map((activity) => ({
                  id: activity.id,
                  type: activity.type,
                  description: activity.description,
                  createdAt: activity.createdAt,
                  actor: activity.actor,
                }))}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-sm text-slate-800">{value}</p>
    </div>
  );
}
