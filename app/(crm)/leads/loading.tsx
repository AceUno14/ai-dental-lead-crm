import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading leads…</span>

      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-28 w-full" />

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
