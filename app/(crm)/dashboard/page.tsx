import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PriorityBadge, ScoreBadge, StatusBadge } from "@/components/leads/lead-badges";
import { requireClinicContext } from "@/lib/auth/clinic";
import { getDashboardData } from "@/lib/services/leads";
import { listClinicFollowUps } from "@/lib/services/follow-up-tasks";
import { serviceInterestLabel } from "@/lib/validation/lead";

export const metadata: Metadata = {
  title: "Dashboard",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function formatDue(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export default async function DashboardPage() {
  const { clinic } = await requireClinicContext();
  const { metrics, recentLeads, now } = await getDashboardData(clinic.id);
  const dueTasks = await listClinicFollowUps(clinic.id);
  const nowMs = now.getTime();

  const cards = [
    { label: "Total leads", value: metrics.totalLeads },
    { label: "New leads", value: metrics.newLeads },
    { label: "Hot leads", value: metrics.hotLeads },
    { label: "Follow-ups due", value: metrics.followUpsDue },
    { label: "Appointments set", value: metrics.appointmentsSet },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Live lead activity for {clinic.name}.
          </p>
        </div>
        <Link
          href={`/c/${clinic.slug}`}
          className="text-sm font-medium text-sky-700 hover:underline"
        >
          Open public enquiry form →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</p>
            </CardBody>
          </Card>
        ))
        }
      </div>

      <Card>
        <CardHeader
          title="Open follow-ups"
          description="AI-recommended and staff tasks, due soonest first."
        />
        {dueTasks.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">No open follow-up tasks right now.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-200">
            {dueTasks.slice(0, 8).map((task) => {
              const overdue = task.dueAt.getTime() <= nowMs;

              return (
                <li key={task.id}>
                  <Link
                    href={`/leads/${task.lead.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50 ${
                      overdue ? "bg-red-50/60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {task.lead.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">{task.title}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          overdue ? "text-red-700" : "text-slate-500"
                        }`}
                      >
                        {overdue ? "Overdue" : "Due"} {formatDue(task.dueAt)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                        {task.priority}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Recent leads"
          description="The five most recent enquiries submitted to your clinic."
          action={
            <Link href="/leads" className="text-sm font-medium text-sky-700 hover:underline">
              View all leads
            </Link>
          }
        />

        {recentLeads.length === 0 ? (
          <CardBody>
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No leads yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Share your public enquiry link with prospective patients and new leads will appear
                here.
              </p>
              <p className="mt-3 truncate text-xs text-slate-400">/c/{clinic.slug}</p>
            </div>
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-200">
            {recentLeads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {serviceInterestLabel(lead.serviceInterest)} · {formatDate(lead.createdAt)}
                      {lead.analysis
                        ? ` · ${lead.analysis.urgency.toLowerCase().replace(/_/g, " ")} urgency`
                        : " · not analysed yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={lead.analysis?.leadScore ?? null} />
                    <PriorityBadge priority={lead.analysis?.priority ?? null} />
                    <StatusBadge status={lead.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
