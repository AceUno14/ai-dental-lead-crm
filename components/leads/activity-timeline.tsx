import type { ActivityType } from "@/lib/generated/prisma/enums";

type TimelineActivity = {
  id: string;
  type: ActivityType;
  description: string;
  createdAt: Date;
  actor: { name: string } | null;
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  LEAD_CREATED: "Lead created",
  AI_ANALYSIS_STARTED: "AI analysis started",
  AI_ANALYSIS_COMPLETED: "AI analysis completed",
  AI_ANALYSIS_FAILED: "AI analysis failed",
  STATUS_CHANGED: "Status changed",
  NOTE_ADDED: "Note added",
  CONTACT_ATTEMPTED: "Contact attempted",
  APPOINTMENT_SET: "Appointment set",
  LEAD_WON: "Lead won",
  LEAD_LOST: "Lead lost",
};

const ACTIVITY_TONE: Record<ActivityType, string> = {
  LEAD_CREATED: "bg-sky-500",
  AI_ANALYSIS_STARTED: "bg-slate-400",
  AI_ANALYSIS_COMPLETED: "bg-emerald-500",
  AI_ANALYSIS_FAILED: "bg-red-500",
  STATUS_CHANGED: "bg-indigo-500",
  NOTE_ADDED: "bg-amber-500",
  CONTACT_ATTEMPTED: "bg-slate-400",
  APPOINTMENT_SET: "bg-emerald-500",
  LEAD_WON: "bg-green-600",
  LEAD_LOST: "bg-slate-400",
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

export function ActivityTimeline({ activities }: { activities: TimelineActivity[] }) {
  if (activities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="space-y-4">
      {activities.map((activity) => (
        <li key={activity.id} className="flex gap-3">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ACTIVITY_TONE[activity.type]}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">
              {ACTIVITY_LABELS[activity.type]}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">{activity.description}</p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateTime(activity.createdAt)}
              {activity.actor ? ` · ${activity.actor.name}` : " · system"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
