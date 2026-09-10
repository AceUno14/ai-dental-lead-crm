import type { LeadPriority, LeadStatus } from "@/lib/generated/prisma/enums";

const PRIORITY_CLASSES: Record<LeadPriority, string> = {
  HOT: "bg-red-50 text-red-700 ring-red-200",
  WARM: "bg-amber-50 text-amber-700 ring-amber-200",
  COLD: "bg-slate-100 text-slate-600 ring-slate-200",
};

const STATUS_CLASSES: Record<LeadStatus, string> = {
  NEW: "bg-sky-50 text-sky-700 ring-sky-200",
  CONTACTED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  APPOINTMENT_SET: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  WON: "bg-green-50 text-green-700 ring-green-200",
  LOST: "bg-slate-100 text-slate-500 ring-slate-200",
};

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: LeadPriority | null | undefined }) {
  if (!priority) {
    return <Badge className="bg-slate-50 text-slate-500 ring-slate-200">Unscored</Badge>;
  }

  return <Badge className={PRIORITY_CLASSES[priority]}>{priority}</Badge>;
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge className={STATUS_CLASSES[status]}>{status.replace(/_/g, " ")}</Badge>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-sm text-slate-400">—</span>;
  }

  const tone = score >= 80 ? "text-red-700" : score >= 50 ? "text-amber-700" : "text-slate-600";

  return (
    <span className={`text-sm font-semibold ${tone}`}>
      {score}
      <span className="text-xs font-normal text-slate-400">/100</span>
    </span>
  );
}
