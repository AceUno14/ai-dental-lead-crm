import type { Metadata } from "next";
import Link from "next/link";

import { LeadFilters } from "@/components/leads/lead-filters";
import {
  ArchiveBadge,
  PriorityBadge,
  ScoreBadge,
  StatusBadge,
} from "@/components/leads/lead-badges";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requireClinicContext } from "@/lib/auth/clinic";
import { listClinicLeads } from "@/lib/services/leads";
import { serviceInterestLabel } from "@/lib/validation/lead";

export const metadata: Metadata = {
  title: "Leads",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

type SearchParams = Promise<{
  status?: string;
  priority?: string;
  search?: string;
  archived?: string;
}>;

/** Only the two defined non-default views are accepted; anything else is active-only. */
function resolveArchiveView(value: string): "archived" | "all" | "" {
  return value === "archived" || value === "all" ? value : "";
}

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const { clinic } = await requireClinicContext();
  const params = await searchParams;

  const status = params.status?.trim() ?? "";
  const priority = params.priority?.trim() ?? "";
  const search = params.search?.trim() ?? "";
  const archived = resolveArchiveView(params.archived?.trim() ?? "");

  const leads = await listClinicLeads(clinic.id, {
    status: status || undefined,
    priority: priority || undefined,
    search: search || undefined,
    archived: archived || undefined,
  });

  const viewingArchive = archived !== "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          {viewingArchive
            ? "Archived leads are hidden from the dashboard and the open follow-up queue. Nothing has been deleted."
            : `Newest first, excluding archived leads. Every lead belongs to ${clinic.name}.`}
        </p>
      </div>

      <Card>
        <CardBody>
          <LeadFilters
            status={status}
            priority={priority}
            search={search}
            archived={archived}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${leads.length} ${leads.length === 1 ? "lead" : "leads"}${
            archived === "archived" ? " (archived)" : ""
          }`}
          description={leads.length === 100 ? "Showing the 100 most recent leads." : undefined}
        />

        {leads.length === 0 ? (
          <CardBody>
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-700">No leads match this view</p>
              <p className="mt-1 text-sm text-slate-500">
                Try clearing the filters, or share your public enquiry form to start collecting
                leads.
              </p>
            </div>
          </CardBody>
        ) : (
          <>
            {/* Mobile card list keeps the layout free of horizontal overflow. */}
            <ul className="divide-y divide-slate-200 sm:hidden">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="block px-4 py-4 hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{lead.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {serviceInterestLabel(lead.serviceInterest)}
                        </p>
                      </div>
                      <ScoreBadge score={lead.analysis?.leadScore ?? null} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={lead.analysis?.priority ?? null} />
                      {lead.archivedAt ? <ArchiveBadge /> : null}
                      <StatusBadge status={lead.status} />
                      <span className="text-xs text-slate-500">{formatDate(lead.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Name
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Service
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Score
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Priority
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-5 py-3 font-medium">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="font-medium text-slate-900 hover:text-sky-700"
                          >
                            {lead.name}
                          </Link>
                          {lead.archivedAt ? <ArchiveBadge /> : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {serviceInterestLabel(lead.serviceInterest)}
                      </td>
                      <td className="px-5 py-3">
                        <ScoreBadge score={lead.analysis?.leadScore ?? null} />
                      </td>
                      <td className="px-5 py-3">
                        <PriorityBadge priority={lead.analysis?.priority ?? null} />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={lead.status} />
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                        {formatDate(lead.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
