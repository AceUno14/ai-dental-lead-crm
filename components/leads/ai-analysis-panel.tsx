import { PriorityBadge, ScoreBadge } from "@/components/leads/lead-badges";
import { RetryAnalysisButton } from "@/components/leads/retry-analysis-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { LeadAnalysis } from "@/lib/generated/prisma/client";

export function AiAnalysisPanel({
  leadId,
  analysis,
}: {
  leadId: string;
  analysis: LeadAnalysis | null;
}) {
  if (!analysis) {
    return (
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              AI qualification
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                not analysed
              </span>
            </span>
          }
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-600">
            This lead has not been analysed yet. The lead itself is saved and safe to work with —
            you can run the qualification again at any time.
          </p>
          <RetryAnalysisButton leadId={leadId} label="Run AI analysis" />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            AI qualification
            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
              AI-generated · review before sending
            </span>
          </span>
        }
        action={<RetryAnalysisButton leadId={leadId} />}
      />

      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <ScoreBadge score={analysis.leadScore} />
          <PriorityBadge priority={analysis.priority} />
          <span className="text-xs text-slate-500">
            Urgency: <span className="font-medium text-slate-700">{analysis.urgency}</span>
          </span>
          <span className="text-xs text-slate-500">
            Intent: <span className="font-medium text-slate-700">{analysis.intent}</span>
          </span>
          <span className="text-xs text-slate-500">
            Service:{" "}
            <span className="font-medium text-slate-700">
              {analysis.serviceCategory.replace(/_/g, " ")}
            </span>
          </span>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
          <p className="mt-1 text-sm text-slate-700">{analysis.summary}</p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recommended action
          </h3>
          <p className="mt-1 text-sm text-slate-700">{analysis.recommendedAction}</p>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Draft reply (staff review required)
          </h3>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-sans text-sm text-slate-700">
            {analysis.draftReply}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Suggested text only. Nothing is sent automatically — clinic staff must review and send
            any reply themselves.
          </p>
        </div>

        <p className="text-xs text-slate-400">
          Model: {analysis.model ?? "unknown"} · Updated{" "}
          {new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(analysis.updatedAt)}
        </p>
      </CardBody>
    </Card>
  );
}
